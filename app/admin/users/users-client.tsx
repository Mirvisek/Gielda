"use client";

import { useState } from "react";
import Link from "next/link";
import {
  UserPlus,
  Search,
  Copy,
  Check,
  KeyRound,
  Radio,
  ExternalLink,
  X,
  AlertCircle,
} from "lucide-react";

interface UserItem {
  id: string;
  email: string;
  displayName: string;
  role: string;
  status: string;
  createdAt: Date;
  lastLoginAt: Date | null;
  authMethods: { method: string; enabled: boolean }[];
  _count: { sessions: number; passkeys: number };
}

export default function UsersClient({ initialUsers }: { initialUsers: UserItem[] }) {
  const [users, setUsers] = useState<UserItem[]>(initialUsers);
  const [search, setSearch] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Formularz tworzenia
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<"USER" | "ADMIN">("USER");
  const [allowedMethods, setAllowedMethods] = useState({
    PASSWORD: true,
    PASSKEY: true,
    GOOGLE: false,
    APPLE: false,
    FACEBOOK: false,
  });

  // Po utworzeniu - wygenerowany link aktywacyjny
  const [createdResult, setCreatedResult] = useState<{
    email: string;
    activationUrl: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          displayName,
          role,
          allowedMethods,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Błąd podczas tworzenia konta.");
      }

      setCreatedResult({
        email: data.user.email,
        activationUrl: data.activationUrl,
      });

      // Odśwież listę użytkowników
      const refRes = await fetch("/api/admin/users");
      if (refRes.ok) {
        const refData = await refRes.json();
        setUsers(refData.users);
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Wystąpił błąd");
    } finally {
      setLoading(false);
    }
  };

  const copyActivationLink = () => {
    if (createdResult) {
      navigator.clipboard.writeText(createdResult.activationUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setCreatedResult(null);
    setEmail("");
    setDisplayName("");
    setRole("USER");
    setErrorMessage(null);
  };

  const filteredUsers = users.filter(
    (u) =>
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      u.displayName.toLowerCase().includes(search.toLowerCase())
  );

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ACTIVE":
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950/80 border border-emerald-800 text-emerald-400">ACTIVE</span>;
      case "INVITED":
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-950/80 border border-blue-800 text-blue-400">INVITED</span>;
      case "SUSPENDED":
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950/80 border border-amber-800 text-amber-400">SUSPENDED</span>;
      case "LOCKED":
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-950/80 border border-red-800 text-red-400">LOCKED</span>;
      case "DISABLED":
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 border border-slate-700 text-slate-400">DISABLED</span>;
      case "DELETED":
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-900 border border-gray-800 text-gray-500 line-through">DELETED</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300">{status}</span>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-100">Konta Użytkowników</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Zarządzanie kontami, uprawnieniami, metodami logowania i stanem sesji.
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-all shadow-md shadow-blue-600/20 cursor-pointer w-fit"
        >
          <UserPlus className="w-4 h-4" />
          <span>Utwórz Użytkownika</span>
        </button>
      </div>

      {/* Wyszukiwarka */}
      <div className="relative">
        <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3 pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Szukaj po adresie email lub nazwie użytkownika..."
          className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-blue-500 transition-colors"
        />
      </div>

      {/* Tabela Użytkowników */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/60 border-b border-slate-800 text-slate-400 uppercase tracking-wider font-semibold text-[10px]">
              <tr>
                <th className="p-4">Użytkownik</th>
                <th className="p-4">Rola</th>
                <th className="p-4">Status</th>
                <th className="p-4">Dozwolone Metody</th>
                <th className="p-4">Sesje / Passkeys</th>
                <th className="p-4 text-right">Akcja</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredUsers.map((u) => (
                <tr key={u.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="p-4">
                    <div className="font-medium text-slate-200">{u.displayName}</div>
                    <div className="text-[11px] text-slate-400 font-mono">{u.email}</div>
                  </td>
                  <td className="p-4">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        u.role === "ADMIN"
                          ? "bg-red-950/80 border border-red-800 text-red-400"
                          : "bg-slate-800 border border-slate-700 text-slate-300"
                      }`}
                    >
                      {u.role}
                    </span>
                  </td>
                  <td className="p-4">{getStatusBadge(u.status)}</td>
                  <td className="p-4">
                    <div className="flex flex-wrap gap-1">
                      {u.authMethods
                        .filter((m) => m.enabled)
                        .map((m) => (
                          <span
                            key={m.method}
                            className="px-1.5 py-0.5 bg-slate-950 border border-slate-800 text-[9px] font-mono text-slate-400 rounded"
                          >
                            {m.method}
                          </span>
                        ))}
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-3 text-slate-400 font-mono text-[11px]">
                      <span className="flex items-center gap-1">
                        <Radio className="w-3.5 h-3.5 text-emerald-400" />
                        {u._count?.sessions || 0}
                      </span>
                      <span className="flex items-center gap-1">
                        <KeyRound className="w-3.5 h-3.5 text-purple-400" />
                        {u._count?.passkeys || 0}
                      </span>
                    </div>
                  </td>
                  <td className="p-4 text-right">
                    <Link
                      href={`/admin/users/${u.id}`}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-800 bg-slate-950 hover:bg-slate-800 text-slate-300 text-xs transition-colors"
                    >
                      <span>Zarządzaj</span>
                      <ExternalLink className="w-3 h-3" />
                    </Link>
                  </td>
                </tr>
              ))}
              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500">
                    Brak użytkowników spełniających kryteria wyszukiwania.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Tworzenia Użytkownika */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-lg shadow-2xl relative">
            <button
              onClick={closeModal}
              className="absolute right-4 top-4 text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            {!createdResult ? (
              <>
                <h3 className="text-base font-bold text-slate-100 mb-1">
                  Utwórz Nowe Konto (Zaproszenie)
                </h3>
                <p className="text-xs text-slate-400 mb-4">
                  Konto zostanie utworzone w statusie INVITED z jednorazowym tokenem aktywacyjnym.
                </p>

                {errorMessage && (
                  <div className="mb-4 p-3 rounded-lg bg-red-950/60 border border-red-800 text-red-300 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                    <span>{errorMessage}</span>
                  </div>
                )}

                <form onSubmit={handleCreateUser} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Adres Email</label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="user@example.com"
                      className="w-full px-3.5 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Imię i Nazwisko / Nick</label>
                    <input
                      type="text"
                      required
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Jan Kowalski"
                      className="w-full px-3.5 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Rola</label>
                    <select
                      value={role}
                      onChange={(e) => setRole(e.target.value as "USER" | "ADMIN")}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                    >
                      <option value="USER">USER (Zwykły użytkownik)</option>
                      <option value="ADMIN">ADMIN (Pełne uprawnienia)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-2">
                      Dozwolone Metody Logowania
                    </label>
                    <div className="space-y-2 p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs">
                      <label className="flex items-center gap-2.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={allowedMethods.PASSWORD}
                          onChange={(e) =>
                            setAllowedMethods({ ...allowedMethods, PASSWORD: e.target.checked })
                          }
                          className="rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-0"
                        />
                        <span className="text-slate-300">Hasło (Argon2id fallback)</span>
                      </label>

                      <label className="flex items-center gap-2.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={allowedMethods.PASSKEY}
                          onChange={(e) =>
                            setAllowedMethods({ ...allowedMethods, PASSKEY: e.target.checked })
                          }
                          className="rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-0"
                        />
                        <span className="text-slate-300">Passkey / WebAuthn (Biometria)</span>
                      </label>

                      <label className="flex items-center gap-2.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={allowedMethods.GOOGLE}
                          onChange={(e) =>
                            setAllowedMethods({ ...allowedMethods, GOOGLE: e.target.checked })
                          }
                          className="rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-0"
                        />
                        <span className="text-slate-300">Google OAuth (Wymaga powiązania)</span>
                      </label>

                      <label className="flex items-center gap-2.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={allowedMethods.APPLE}
                          onChange={(e) =>
                            setAllowedMethods({ ...allowedMethods, APPLE: e.target.checked })
                          }
                          className="rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-0"
                        />
                        <span className="text-slate-300">Apple Sign In (Wymaga powiązania)</span>
                      </label>

                      <label className="flex items-center gap-2.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={allowedMethods.FACEBOOK}
                          onChange={(e) =>
                            setAllowedMethods({ ...allowedMethods, FACEBOOK: e.target.checked })
                          }
                          className="rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-0"
                        />
                        <span className="text-slate-300">Facebook Login (Wymaga powiązania)</span>
                      </label>
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 pt-3">
                    <button
                      type="button"
                      onClick={closeModal}
                      className="px-4 py-2 rounded-xl border border-slate-800 text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors"
                    >
                      Anuluj
                    </button>
                    <button
                      type="submit"
                      disabled={loading}
                      className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-all shadow-md shadow-blue-600/20 disabled:opacity-50 cursor-pointer"
                    >
                      {loading ? "Tworzenie..." : "Utwórz konto"}
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <div className="space-y-4">
                <div className="p-3 bg-emerald-950/40 border border-emerald-800/80 rounded-xl text-emerald-300 text-xs flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Konto zostało pomyślnie utworzone w statusie INVITED!</span>
                </div>

                <div className="text-xs text-slate-300">
                  Przekaż użytkownikowi poniższy bezpieczny, jednorazowy link aktywacyjny:
                </div>

                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 font-mono text-[11px] text-slate-300 break-all select-all">
                  {createdResult.activationUrl}
                </div>

                <button
                  type="button"
                  onClick={copyActivationLink}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-all cursor-pointer"
                >
                  {copied ? <Check className="w-4 h-4 text-white" /> : <Copy className="w-4 h-4" />}
                  <span>{copied ? "Skopiowano link!" : "Skopiuj link aktywacyjny"}</span>
                </button>

                <button
                  type="button"
                  onClick={closeModal}
                  className="w-full py-2 text-xs text-slate-400 hover:text-white transition-colors"
                >
                  Zamknij
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
