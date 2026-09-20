"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  KeyRound,
  Radio,
  Trash2,
  Send,
  AlertTriangle,
  CheckCircle,
  Copy,
  Check,
} from "lucide-react";

export interface UserSessionItem {
  id: string;
  ipAddress: string | null;
  userAgent: string | null;
  deviceId: string | null;
  createdAt: Date | string;
  lastSeenAt: Date | string;
  expiresAt: Date | string;
}

export interface UserPasskeyItem {
  id: string;
  name: string;
  deviceType: string | null;
  credentialId: string;
  createdAt: Date | string;
  lastUsedAt: Date | string | null;
}

export interface UserAuthMethodItem {
  method: string;
  enabled: boolean;
}

export interface UserDetailData {
  id: string;
  email: string;
  displayName: string;
  role: string;
  status: string;
  createdAt: Date | string;
  lastLoginAt: Date | string | null;
  authMethods: UserAuthMethodItem[];
  sessions: UserSessionItem[];
  passkeys: UserPasskeyItem[];
}

interface Props {
  user: UserDetailData;
  currentAdminId: string;
}

export default function UserDetailClient({ user: initialUser, currentAdminId }: Props) {
  const router = useRouter();
  const [user, setUser] = useState<UserDetailData>(initialUser);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Status select state
  const [selectedStatus, setSelectedStatus] = useState(user.status);

  // Auth methods state
  const methodsMap: Record<string, boolean> = {
    PASSWORD: false,
    PASSKEY: false,
    GOOGLE: false,
    APPLE: false,
    FACEBOOK: false,
  };
  user.authMethods.forEach((m) => {
    methodsMap[m.method] = m.enabled;
  });
  const [allowedMethods, setAllowedMethods] = useState(methodsMap);

  // Wygenerowany nowy link aktywacyjny
  const [activationUrl, setActivationUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleStatusChange = async () => {
    if (selectedStatus === user.status) return;

    if (
      !confirm(
        `Czy na pewno chcesz zmienić status konta na ${selectedStatus}? Zmiana na status nieaktywny natychmiast unieważni wszystkie otwarte sesje tego użytkownika.`
      )
    ) {
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const res = await fetch(`/api/admin/users/${user.id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: selectedStatus }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Błąd podczas zmiany statusu.");
      }

      setMessage({
        type: "success",
        text: `Status konta zaktualizowany na ${selectedStatus}.${
          data.revokedSessionsCount > 0 ? ` Unieważniono ${data.revokedSessionsCount} sesji.` : ""
        }`,
      });
      setUser({ ...user, status: selectedStatus });
      router.refresh();
    } catch (err: unknown) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Błąd zmiany statusu" });
      setSelectedStatus(user.status);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAuthMethods = async () => {
    setLoading(true);
    setMessage(null);

    try {
      const res = await fetch(`/api/admin/users/${user.id}/auth-methods`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allowedMethods }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Błąd zapisu metod autentykacji.");
      }

      setMessage({ type: "success", text: "Dozwolone metody logowania zostały zaktualizowane." });
      router.refresh();
    } catch (err: unknown) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Błąd" });
    } finally {
      setLoading(false);
    }
  };

  const handleResendActivation = async () => {
    setLoading(true);
    setMessage(null);

    try {
      const res = await fetch(`/api/admin/users/${user.id}/resend-activation`, {
        method: "POST",
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Błąd generowania linku aktywacyjnego.");
      }

      setActivationUrl(data.activationUrl);
      setMessage({ type: "success", text: "Wygenerowano nowy jednorazowy token aktywacyjny!" });
    } catch (err: unknown) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Błąd" });
    } finally {
      setLoading(false);
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    if (!confirm("Czy na pewno unieważnić tę sesję?")) return;

    try {
      const res = await fetch(`/api/admin/sessions/${sessionId}/revoke`, { method: "POST" });
      if (!res.ok) throw new Error("Błąd unieważniania sesji");

      setUser({
        ...user,
        sessions: user.sessions.filter((s) => s.id !== sessionId),
      });
      setMessage({ type: "success", text: "Sesja została unieważniona." });
    } catch (err: unknown) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Błąd" });
    }
  };

  const handleRevokeAllSessions = async () => {
    if (!confirm("Czy na pewno chcesz unieważnić WSZYSTKIE aktywne sesje tego użytkownika?")) return;

    try {
      const res = await fetch(`/api/admin/sessions/user/${user.id}/revoke-all`, { method: "POST" });
      if (!res.ok) throw new Error("Błąd unieważniania sesji");

      setUser({ ...user, sessions: [] });
      setMessage({ type: "success", text: "Wszystkie sesje użytkownika zostały natychmiast odwołane." });
    } catch (err: unknown) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Błąd" });
    }
  };

  const handleRevokePasskey = async (passkeyId: string) => {
    if (!confirm("Czy na pewno chcesz usunąć ten klucz Passkey? Użytkownik nie będzie mógł się nim zalogować.")) return;

    try {
      const res = await fetch(`/api/admin/passkeys/${passkeyId}/revoke`, { method: "POST" });
      if (!res.ok) throw new Error("Błąd odwoływania klucza Passkey");

      setUser({
        ...user,
        passkeys: user.passkeys.filter((p) => p.id !== passkeyId),
      });
      setMessage({ type: "success", text: "Klucz Passkey został odwołany." });
    } catch (err: unknown) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Błąd" });
    }
  };

  const isSelf = user.id === currentAdminId;

  return (
    <div className="space-y-6">
      {/* Pasek powrotu */}
      <div className="flex items-center justify-between">
        <Link
          href="/admin/users"
          className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Wróć do listy użytkowników</span>
        </Link>
      </div>

      {message && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
            message.type === "success"
              ? "bg-emerald-950/50 border-emerald-800/80 text-emerald-300"
              : "bg-red-950/50 border-red-800/80 text-red-300"
          }`}
        >
          {message.type === "success" ? (
            <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* Nagłówek Użytkownika */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-lg font-bold text-slate-100">{user.displayName}</h2>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  user.role === "ADMIN"
                    ? "bg-red-950 border border-red-800 text-red-400"
                    : "bg-slate-800 text-slate-300"
                }`}
              >
                {user.role}
              </span>
              {isSelf && (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-950 border border-blue-800 text-blue-400">
                  Twoje konto
                </span>
              )}
            </div>
            <div className="text-xs text-slate-400 font-mono">{user.email}</div>
          </div>

          {user.status === "INVITED" && (
            <button
              onClick={handleResendActivation}
              disabled={loading}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-blue-800 bg-blue-950/60 hover:bg-blue-900/60 text-blue-300 text-xs font-medium transition-colors cursor-pointer w-fit"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Wygeneruj nowy link aktywacyjny</span>
            </button>
          )}
        </div>

        {/* Nowo wygenerowany link aktywacyjny */}
        {activationUrl && (
          <div className="mt-4 p-3 bg-slate-950 border border-blue-800 rounded-xl space-y-2">
            <div className="text-xs text-blue-300 font-semibold">
              Nowy link aktywacyjny dla użytkownika:
            </div>
            <div className="text-[11px] font-mono text-slate-300 break-all select-all">
              {activationUrl}
            </div>
            <button
              onClick={() => {
                navigator.clipboard.writeText(activationUrl);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-medium transition-colors cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? "Skopiowano!" : "Kopiuj link"}</span>
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Zmiana Statusu */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-100">Status Konta</h3>
            <span className="text-xs text-slate-400 font-mono">Aktualny: {user.status}</span>
          </div>

          <p className="text-xs text-slate-400">
            Zmiana statusu na SUSPENDED, LOCKED lub DISABLED automatycznie i bezpowrotnie zrywa
            wszystkie aktywne sesje użytkownika.
          </p>

          <div className="flex items-center gap-3">
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              disabled={isSelf}
              className="flex-1 px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-blue-500 disabled:opacity-50"
            >
              <option value="ACTIVE">ACTIVE (Dostęp normalny)</option>
              <option value="INVITED">INVITED (Oczekuje na aktywację)</option>
              <option value="SUSPENDED">SUSPENDED (Czasowo zawieszony przez admina)</option>
              <option value="LOCKED">LOCKED (Zablokowany przez system bezpieczeństwa)</option>
              <option value="DISABLED">DISABLED (Wyłączony na stałe)</option>
              <option value="DELETED">DELETED (Usunięty logicznie)</option>
            </select>

            <button
              onClick={handleStatusChange}
              disabled={loading || isSelf || selectedStatus === user.status}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-medium transition-all disabled:opacity-50 cursor-pointer"
            >
              Zapisz status
            </button>
          </div>
          {isSelf && (
            <p className="text-[11px] text-amber-400">
              Nie możesz zawiesić ani zablokować własnego aktualnego konta administratora.
            </p>
          )}
        </div>

        {/* Dozwolone metody autentykacji */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          <h3 className="text-sm font-bold text-slate-100">Dozwolone Metody Logowania</h3>
          <p className="text-xs text-slate-400">
            Zezwolenie włączone przez administratora jest warunkiem koniecznym do logowania daną metodą.
          </p>

          <div className="grid grid-cols-2 gap-2 text-xs">
            {Object.keys(allowedMethods).map((method) => (
              <label
                key={method}
                className="flex items-center gap-2 p-2.5 rounded-lg bg-slate-950 border border-slate-800/80 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={allowedMethods[method]}
                  onChange={(e) =>
                    setAllowedMethods({ ...allowedMethods, [method]: e.target.checked })
                  }
                  className="rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-0"
                />
                <span className="font-mono text-slate-300 text-[11px]">{method}</span>
              </label>
            ))}
          </div>

          <button
            onClick={handleSaveAuthMethods}
            disabled={loading}
            className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-medium transition-colors cursor-pointer"
          >
            Zapisz dozwolone metody
          </button>
        </div>
      </div>

      {/* Aktywne sesje tego użytkownika */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-bold text-slate-100">
              Aktywne Sesje ({user.sessions.length})
            </h3>
          </div>

          {user.sessions.length > 0 && (
            <button
              onClick={handleRevokeAllSessions}
              className="px-3 py-1.5 rounded-lg border border-red-900/60 bg-red-950/40 hover:bg-red-900/40 text-red-300 text-xs font-medium transition-colors cursor-pointer"
            >
              Unieważnij wszystkie sesje
            </button>
          )}
        </div>

        <div className="divide-y divide-slate-800/60 text-xs">
          {user.sessions.map((s) => (
            <div
              key={s.id}
              className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-slate-200">IP: {s.ipAddress || "Nieznane"}</span>
                  <span className="text-[11px] text-slate-500">
                    Ostatnia aktywność: {new Date(s.lastSeenAt).toLocaleString()}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 truncate max-w-xl font-mono">
                  {s.userAgent || "Brak User-Agent"}
                </p>
              </div>

              <button
                onClick={() => handleRevokeSession(s.id)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-950 hover:bg-red-950/60 text-slate-300 hover:text-red-300 border border-slate-800 hover:border-red-900 rounded-lg text-xs transition-colors cursor-pointer w-fit"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Odwołaj</span>
              </button>
            </div>
          ))}
          {user.sessions.length === 0 && (
            <div className="py-6 text-center text-slate-500 text-xs">
              Użytkownik nie posiada aktualnie żadnych aktywnych sesji.
            </div>
          )}
        </div>
      </div>

      {/* Klucze Passkey użytkownika */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-purple-400" />
          <h3 className="text-sm font-bold text-slate-100">
            Zarejestrowane Klucze Passkey ({user.passkeys.length})
          </h3>
        </div>

        <div className="divide-y divide-slate-800/60 text-xs">
          {user.passkeys.map((p) => (
            <div key={p.id} className="py-3 flex items-center justify-between">
              <div>
                <div className="font-medium text-slate-200">{p.name}</div>
                <div className="text-[11px] text-slate-500 font-mono">
                  Dodano: {new Date(p.createdAt).toLocaleDateString()} · Typ:{" "}
                  {p.deviceType || "Passkey"} · Ostatnie użycie:{" "}
                  {p.lastUsedAt ? new Date(p.lastUsedAt).toLocaleString() : "Nigdy"}
                </div>
              </div>

              <button
                onClick={() => handleRevokePasskey(p.id)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-950 hover:bg-red-950/60 text-slate-300 hover:text-red-300 border border-slate-800 hover:border-red-900 rounded-lg text-xs transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Usuń klucz</span>
              </button>
            </div>
          ))}
          {user.passkeys.length === 0 && (
            <div className="py-6 text-center text-slate-500 text-xs">
              Brak zarejestrowanych kluczy Passkey dla tego użytkownika.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
