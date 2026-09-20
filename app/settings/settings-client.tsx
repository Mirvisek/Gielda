"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Settings,
  User,
  Key,
  Shield,
  Globe,
  Monitor,
  CheckCircle,
  AlertTriangle,
  X,
  Fingerprint,
  Trash2,
  Plus,
  RefreshCw,
  Eye,
  EyeOff,
  LogOut,
  Copy,
  ChevronRight,
} from "lucide-react";
import { startRegistration } from "@simplewebauthn/browser";
import NotificationBell from "@/components/notifications/notification-bell";
import type { UserSettingsDto } from "@/lib/user/user-settings-service";

interface Props {
  initialData: UserSettingsDto;
  currentUser: {
    id: string;
    email: string;
    displayName: string;
    role: string;
  };
}

type Tab = "profile" | "passkeys" | "security" | "oauth" | "sessions";

type ToastState = { type: "success" | "error"; text: string } | null;

/* ─── Helper: Toast ─────────────────────────────────────────────────────── */
function Toast({ toast, onClose }: { toast: ToastState; onClose: () => void }) {
  if (!toast) return null;
  return (
    <div
      className={`p-3.5 rounded-xl border text-xs flex items-center justify-between ${
        toast.type === "success"
          ? "bg-emerald-950/50 border-emerald-800/80 text-emerald-300"
          : "bg-red-950/50 border-red-800/80 text-red-300"
      }`}
    >
      <div className="flex items-center gap-2">
        {toast.type === "success" ? (
          <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
        ) : (
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
        )}
        <span>{toast.text}</span>
      </div>
      <button onClick={onClose} className="text-slate-400 hover:text-white p-1">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

/* ─── Helper: Sekcja-karta ─────────────────────────────────────────────── */
function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`p-5 rounded-2xl bg-slate-900/80 border border-slate-800 ${className}`}>
      {children}
    </div>
  );
}

/* ─── Provider icons ────────────────────────────────────────────────────── */
function ProviderBadge({ provider }: { provider: string }) {
  const labels: Record<string, string> = {
    GOOGLE: "Google",
    APPLE: "Apple",
    FACEBOOK: "Facebook",
  };
  const colors: Record<string, string> = {
    GOOGLE: "bg-blue-900/40 text-blue-300 border-blue-800/60",
    APPLE: "bg-slate-700/40 text-slate-200 border-slate-600/60",
    FACEBOOK: "bg-indigo-900/40 text-indigo-300 border-indigo-800/60",
  };
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-medium border ${colors[provider] ?? "bg-slate-800 text-slate-300 border-slate-700"}`}
    >
      {labels[provider] ?? provider}
    </span>
  );
}

/* ─── Main Component ─────────────────────────────────────────────────────── */
export function SettingsClient({ initialData, currentUser }: Props) {
  const router = useRouter();
  const [data, setData] = useState<UserSettingsDto>(initialData);
  const [activeTab, setActiveTab] = useState<Tab>("profile");
  const [toast, setToast] = useState<ToastState>(null);

  /* ── helpers ── */
  const showToast = useCallback((type: "success" | "error", text: string) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 5000);
  }, []);

  const apiFetch = useCallback(
    async (url: string, options?: RequestInit) => {
      const res = await fetch(url, {
        headers: { "Content-Type": "application/json" },
        ...options,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Nieznany błąd.");
      return json;
    },
    []
  );

  const refreshData = useCallback(async () => {
    try {
      const fresh = await apiFetch("/api/user/settings");
      setData(fresh);
    } catch {
      /* silent */
    }
  }, [apiFetch]);

  /* ── Profile tab ── */
  const [displayName, setDisplayName] = useState(currentUser.displayName);
  const [savingProfile, setSavingProfile] = useState(false);

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await apiFetch("/api/user/settings", {
        method: "PATCH",
        body: JSON.stringify({ displayName }),
      });
      showToast("success", "Profil zaktualizowany.");
      router.refresh();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Błąd zapisu.");
    } finally {
      setSavingProfile(false);
    }
  }

  /* ── Password tab ── */
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [savingPw, setSavingPw] = useState(false);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPw !== confirmPw) {
      showToast("error", "Hasła nie są identyczne.");
      return;
    }
    setSavingPw(true);
    try {
      await apiFetch("/api/user/password", {
        method: "POST",
        body: JSON.stringify({ currentPassword: currentPw || undefined, newPassword: newPw }),
      });
      showToast("success", "Hasło zmienione. Zaloguj się ponownie na innych urządzeniach.");
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
      await refreshData();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Błąd zmiany hasła.");
    } finally {
      setSavingPw(false);
    }
  }

  /* ── Recovery codes ── */
  const [newCodes, setNewCodes] = useState<string[] | null>(null);
  const [generatingCodes, setGeneratingCodes] = useState(false);
  const [codesCopied, setCodesCopied] = useState(false);

  async function handleGenerateCodes() {
    setGeneratingCodes(true);
    try {
      const res = await apiFetch("/api/user/recovery-codes", { method: "POST" });
      setNewCodes(res.codes);
      await refreshData();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Błąd generowania kodów.");
    } finally {
      setGeneratingCodes(false);
    }
  }

  function handleCopyCodes() {
    if (!newCodes) return;
    navigator.clipboard.writeText(newCodes.join("\n"));
    setCodesCopied(true);
    setTimeout(() => setCodesCopied(false), 2000);
  }

  /* ── Passkeys tab ── */
  const [addingPasskey, setAddingPasskey] = useState(false);
  const [deletingPasskeyId, setDeletingPasskeyId] = useState<string | null>(null);

  async function handleAddPasskey() {
    setAddingPasskey(true);
    try {
      const optionsRes = await apiFetch("/api/auth/passkey/register/options", { method: "POST" });
      const regResponse = await startRegistration({ optionsJSON: optionsRes });
      await apiFetch("/api/auth/passkey/register/verify", {
        method: "POST",
        body: JSON.stringify({ registrationResponse: regResponse }),
      });
      showToast("success", "Klucz Passkey dodany pomyślnie!");
      await refreshData();
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Błąd rejestracji klucza.";
      if (msg.includes("cancelled") || msg.toLowerCase().includes("anulowa")) {
        /* user cancelled — silent */
      } else {
        showToast("error", msg);
      }
    } finally {
      setAddingPasskey(false);
    }
  }

  async function handleDeletePasskey(passkeyId: string) {
    setDeletingPasskeyId(passkeyId);
    try {
      await apiFetch(`/api/user/passkeys/${passkeyId}`, { method: "DELETE" });
      showToast("success", "Klucz Passkey usunięty.");
      await refreshData();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Błąd usuwania klucza.");
    } finally {
      setDeletingPasskeyId(null);
    }
  }

  /* ── Sessions tab ── */
  const [revokingOthers, setRevokingOthers] = useState(false);

  async function handleRevokeOthers() {
    setRevokingOthers(true);
    try {
      const res = await apiFetch("/api/user/sessions/revoke-others", { method: "POST" });
      showToast("success", `Wylogowano ${res.revokedCount} innych sesji.`);
      await refreshData();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Błąd wylogowania sesji.");
    } finally {
      setRevokingOthers(false);
    }
  }

  /* ─────────────────── UI ────────────────────────────────────────────── */
  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "profile", label: "Profil", icon: <User className="w-4 h-4" /> },
    { id: "passkeys", label: "Passkey", icon: <Fingerprint className="w-4 h-4" /> },
    { id: "security", label: "Hasło i Bezpieczeństwo", icon: <Shield className="w-4 h-4" /> },
    { id: "oauth", label: "Powiązania OAuth", icon: <Globe className="w-4 h-4" /> },
    { id: "sessions", label: "Aktywne Sesje", icon: <Monitor className="w-4 h-4" /> },
  ];

  const otherSessionsCount = data.sessions.filter((s) => !s.isCurrent).length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* ─── Header ─── */}
      <header className="sticky top-0 z-50 border-b border-slate-800/60 bg-slate-950/90 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors">
              <ChevronRight className="w-4 h-4 rotate-180" />
            </Link>
            <div className="flex items-center gap-2">
              <Settings className="w-4 h-4 text-emerald-400" />
              <span className="text-sm font-semibold text-white">Ustawienia Konta</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <NotificationBell />
            <div className="hidden sm:flex items-center gap-2 pl-2 border-l border-slate-800 text-xs text-slate-400">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="font-medium text-slate-200">{currentUser.displayName || currentUser.email}</span>
            </div>
            <Link
              href="/api/auth/logout"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-700 bg-slate-800/80 hover:bg-slate-800 text-slate-200 text-xs font-medium transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Wyloguj</span>
            </Link>
          </div>
        </div>
      </header>

      {/* ─── Main ─── */}
      <main className="flex-1 p-4 lg:p-8 max-w-5xl mx-auto w-full space-y-6">
        <Toast toast={toast} onClose={() => setToast(null)} />

        {/* Tabs */}
        <div className="flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium transition-all ${
                activeTab === tab.id
                  ? "bg-emerald-600 text-white shadow-lg shadow-emerald-900/40"
                  : "bg-slate-800/80 text-slate-300 hover:bg-slate-800 hover:text-white border border-slate-700/60"
              }`}
            >
              {tab.icon}
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* ── TAB: Profile ── */}
        {activeTab === "profile" && (
          <div className="space-y-4">
            <Card>
              <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                <User className="w-4 h-4 text-emerald-400" />
                Dane Profilu
              </h2>
              <form onSubmit={handleSaveProfile} className="space-y-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">Nazwa wyświetlana</label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    minLength={2}
                    maxLength={100}
                    required
                    className="w-full bg-slate-800/80 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">E-mail (tylko do odczytu)</label>
                  <input
                    type="email"
                    value={data.user.email}
                    readOnly
                    className="w-full bg-slate-900/50 border border-slate-700/60 rounded-xl px-3.5 py-2.5 text-sm text-slate-400 cursor-not-allowed"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1.5">Rola</label>
                    <div className="bg-slate-900/50 border border-slate-700/60 rounded-xl px-3.5 py-2.5 text-sm">
                      <span className={`font-medium ${data.user.role === "ADMIN" ? "text-rose-400" : "text-slate-300"}`}>
                        {data.user.role === "ADMIN" ? "Administrator" : "Użytkownik"}
                      </span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1.5">Status konta</label>
                    <div className="bg-slate-900/50 border border-slate-700/60 rounded-xl px-3.5 py-2.5 text-sm flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${data.user.status === "ACTIVE" ? "bg-emerald-500" : "bg-amber-500"}`} />
                      <span className="text-slate-300">{data.user.status === "ACTIVE" ? "Aktywne" : data.user.status}</span>
                    </div>
                  </div>
                </div>
                <div className="text-[11px] text-slate-500">
                  Konto utworzone: {new Date(data.user.createdAt).toLocaleDateString("pl-PL", { dateStyle: "long" })}
                </div>
                <button
                  type="submit"
                  disabled={savingProfile}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition-colors disabled:opacity-60"
                >
                  {savingProfile && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  Zapisz zmiany
                </button>
              </form>
            </Card>
          </div>
        )}

        {/* ── TAB: Passkeys ── */}
        {activeTab === "passkeys" && (
          <div className="space-y-4">
            <Card>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Fingerprint className="w-4 h-4 text-emerald-400" />
                  Klucze Passkey
                </h2>
                <button
                  onClick={handleAddPasskey}
                  disabled={addingPasskey}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors disabled:opacity-60"
                >
                  {addingPasskey ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  Dodaj klucz
                </button>
              </div>

              <p className="text-xs text-slate-400 mb-4">
                Klucze Passkey umożliwiają logowanie biometryczne (odcisk palca, Face ID, PIN urządzenia) bez hasła.
              </p>

              {data.passkeys.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  <Fingerprint className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Brak zapisanych kluczy Passkey.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {data.passkeys.map((pk) => {
                    const isOnly = data.passkeys.length === 1 && !data.user.hasPassword;
                    return (
                      <div
                        key={pk.id}
                        className="flex items-center justify-between p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/60"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <Key className="w-4 h-4 text-emerald-400 shrink-0" />
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-white truncate">{pk.name || "Klucz bez nazwy"}</div>
                            <div className="text-[11px] text-slate-500 font-mono">
                              {pk.deviceType && <span className="mr-2">{pk.deviceType}</span>}
                              Dodany: {new Date(pk.createdAt).toLocaleDateString("pl-PL")}
                              {pk.lastUsedAt && (
                                <span className="ml-2">· Użyty: {new Date(pk.lastUsedAt).toLocaleDateString("pl-PL")}</span>
                              )}
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => handleDeletePasskey(pk.id)}
                          disabled={deletingPasskeyId === pk.id || isOnly}
                          title={
                            isOnly
                              ? "Nie można usunąć ostatniego klucza gdy brak hasła (anti-lockout)"
                              : "Usuń klucz Passkey"
                          }
                          className="ml-3 p-2 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-950/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
                        >
                          {deletingPasskeyId === pk.id ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>
        )}

        {/* ── TAB: Security (Password + Recovery codes) ── */}
        {activeTab === "security" && (
          <div className="space-y-4">
            {/* Zmiana hasła */}
            <Card>
              <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                <Shield className="w-4 h-4 text-emerald-400" />
                {data.user.hasPassword ? "Zmień hasło" : "Ustaw hasło"}
              </h2>
              <form onSubmit={handleChangePassword} className="space-y-3">
                {data.user.hasPassword && (
                  <div>
                    <label className="block text-xs text-slate-400 mb-1.5">Obecne hasło</label>
                    <div className="relative">
                      <input
                        type={showPw ? "text" : "password"}
                        value={currentPw}
                        onChange={(e) => setCurrentPw(e.target.value)}
                        required
                        autoComplete="current-password"
                        className="w-full bg-slate-800/80 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white pr-10 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 transition-colors"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPw((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                      >
                        {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                )}
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">Nowe hasło</label>
                  <input
                    type={showPw ? "text" : "password"}
                    value={newPw}
                    onChange={(e) => setNewPw(e.target.value)}
                    required
                    autoComplete="new-password"
                    placeholder="Minimum 12 znaków"
                    className="w-full bg-slate-800/80 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">Potwierdź nowe hasło</label>
                  <input
                    type={showPw ? "text" : "password"}
                    value={confirmPw}
                    onChange={(e) => setConfirmPw(e.target.value)}
                    required
                    autoComplete="new-password"
                    className={`w-full bg-slate-800/80 border rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:ring-1 transition-colors ${
                      confirmPw && newPw !== confirmPw
                        ? "border-red-600 focus:border-red-500 focus:ring-red-500/30"
                        : "border-slate-700 focus:border-emerald-500 focus:ring-emerald-500/30"
                    }`}
                  />
                  {confirmPw && newPw !== confirmPw && (
                    <p className="text-[11px] text-red-400 mt-1">Hasła nie są identyczne.</p>
                  )}
                </div>
                <p className="text-[11px] text-slate-500">
                  Wymagane minimum 12 znaków. Hasło jest haszowane algorytmem Argon2id.
                </p>
                <button
                  type="submit"
                  disabled={savingPw || (!!confirmPw && newPw !== confirmPw)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition-colors disabled:opacity-60"
                >
                  {savingPw && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  {data.user.hasPassword ? "Zmień hasło" : "Ustaw hasło"}
                </button>
              </form>
            </Card>

            {/* Kody awaryjne */}
            <Card>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Key className="w-4 h-4 text-amber-400" />
                  Kody awaryjne (Recovery Codes)
                </h2>
                <span className="text-xs font-mono text-slate-400">
                  Dostępnych: <span className="text-amber-300 font-semibold">{data.unusedRecoveryCodesCount}</span>
                </span>
              </div>
              <p className="text-xs text-slate-400 mb-4">
                Kody awaryjne umożliwiają odzyskanie dostępu do konta gdy utracisz dostęp do wszystkich metod logowania.
                Każdy kod jest jednorazowy.
              </p>

              {newCodes ? (
                <div className="space-y-3">
                  <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-800/60">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-semibold text-amber-300">Nowe kody — zapisz je teraz!</span>
                      <button
                        onClick={handleCopyCodes}
                        className="flex items-center gap-1 text-xs text-slate-400 hover:text-white transition-colors"
                      >
                        <Copy className="w-3 h-3" />
                        {codesCopied ? "Skopiowano!" : "Kopiuj"}
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {newCodes.map((code) => (
                        <code key={code} className="text-xs font-mono text-amber-200 bg-amber-950/40 px-2 py-1 rounded-lg tracking-widest">
                          {code}
                        </code>
                      ))}
                    </div>
                    <p className="text-[11px] text-amber-400/70 mt-3">
                      ⚠ Po zamknięciu tego okna kody nie będą widoczne ponownie.
                    </p>
                  </div>
                  <button
                    onClick={() => setNewCodes(null)}
                    className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    Potwierdzam, że zapisałem kody
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleGenerateCodes}
                  disabled={generatingCodes}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-700 hover:bg-amber-600 text-white text-sm font-medium transition-colors disabled:opacity-60"
                >
                  {generatingCodes && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  Generuj nowe kody
                </button>
              )}
            </Card>
          </div>
        )}

        {/* ── TAB: OAuth ── */}
        {activeTab === "oauth" && (
          <div className="space-y-4">
            <Card>
              <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                <Globe className="w-4 h-4 text-emerald-400" />
                Powiązania OAuth
              </h2>
              <p className="text-xs text-slate-400 mb-4">
                Konta zewnętrznych dostawców powiązane z Twoim kontem. Powiązanie zarządzane jest przez administratora
                lub następuje przy pierwszym logowaniu przez OAuth.
              </p>

              {data.oauthAccounts.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  <Globe className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Brak powiązanych kont OAuth.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {data.oauthAccounts.map((acc) => (
                    <div
                      key={acc.id}
                      className="flex items-center justify-between p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/60"
                    >
                      <div className="flex items-center gap-3">
                        <ProviderBadge provider={acc.provider} />
                        <div>
                          <div className="text-xs text-slate-400 font-mono truncate max-w-[200px]">
                            {acc.providerAccountId}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            Powiązano: {new Date(acc.createdAt).toLocaleDateString("pl-PL")}
                          </div>
                        </div>
                      </div>
                      <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                    </div>
                  ))}
                </div>
              )}

              {/* Lista dozwolonych metod */}
              <div className="mt-5 pt-4 border-t border-slate-800">
                <h3 className="text-xs font-semibold text-slate-400 mb-3">Dozwolone metody logowania</h3>
                <div className="flex flex-wrap gap-2">
                  {data.authMethods.map((m) => (
                    <span
                      key={m.method}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border ${
                        m.enabled
                          ? "bg-emerald-900/30 text-emerald-300 border-emerald-700/60"
                          : "bg-slate-800/40 text-slate-500 border-slate-700/40"
                      }`}
                    >
                      {m.enabled ? <CheckCircle className="w-3 h-3" /> : <X className="w-3 h-3" />}
                      {m.method}
                    </span>
                  ))}
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* ── TAB: Sessions ── */}
        {activeTab === "sessions" && (
          <div className="space-y-4">
            <Card>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Monitor className="w-4 h-4 text-emerald-400" />
                  Aktywne Sesje
                </h2>
                {otherSessionsCount > 0 && (
                  <button
                    onClick={handleRevokeOthers}
                    disabled={revokingOthers}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-800/70 hover:bg-rose-700 text-white text-xs font-medium transition-colors disabled:opacity-60"
                  >
                    {revokingOthers ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <LogOut className="w-3.5 h-3.5" />
                    )}
                    Wyloguj pozostałe ({otherSessionsCount})
                  </button>
                )}
              </div>
              <p className="text-xs text-slate-400 mb-4">
                Wszystkie aktywne sesje na Twoim koncie. Bieżąca sesja jest oznaczona.
              </p>

              {data.sessions.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  <Monitor className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Brak aktywnych sesji.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {data.sessions.map((sess) => (
                    <div
                      key={sess.id}
                      className={`p-3.5 rounded-xl border ${
                        sess.isCurrent
                          ? "bg-emerald-950/30 border-emerald-800/60"
                          : "bg-slate-800/60 border-slate-700/60"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Monitor className={`w-4 h-4 shrink-0 ${sess.isCurrent ? "text-emerald-400" : "text-slate-400"}`} />
                          <div>
                            <div className="text-xs font-medium text-white flex items-center gap-2">
                              {sess.userAgent ? sess.userAgent.split(")")[0].replace("(", "").trim() || "Nieznane urządzenie" : "Nieznane urządzenie"}
                              {sess.isCurrent && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-700 text-emerald-100 font-semibold">
                                  Bieżąca
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                              {sess.ipAddress && <span className="mr-2">{sess.ipAddress}</span>}
                              Ostatnia aktywność: {new Date(sess.lastSeenAt).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" })}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}
