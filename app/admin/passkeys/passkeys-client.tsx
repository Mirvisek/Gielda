"use client";

import { useState } from "react";
import { KeyRound, Trash2, CheckCircle, AlertTriangle } from "lucide-react";
import Link from "next/link";

export interface PasskeyItem {
  id: string;
  name: string;
  credentialId: string;
  deviceType: string | null;
  createdAt: Date | string;
  lastUsedAt: Date | string | null;
  user: {
    id: string;
    email: string;
    displayName: string;
    status: string;
  };
}

export default function PasskeysClient({ initialPasskeys }: { initialPasskeys: PasskeyItem[] }) {
  const [passkeys, setPasskeys] = useState<PasskeyItem[]>(initialPasskeys);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleRevoke = async (passkeyId: string) => {
    if (!confirm("Czy na pewno chcesz unieważnić ten klucz Passkey? Użytkownik straci możliwość logowania za jego pomocą.")) return;

    try {
      const res = await fetch(`/api/admin/passkeys/${passkeyId}/revoke`, { method: "POST" });
      if (!res.ok) throw new Error("Błąd podczas unieważniania klucza Passkey.");

      setPasskeys(passkeys.filter((p) => p.id !== passkeyId));
      setMessage({ type: "success", text: "Klucz Passkey został odwołany." });
    } catch (err: unknown) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Błąd" });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-100">Klucze Passkey w Systemie</h2>
        <p className="text-xs text-slate-400 mt-0.5">
          Zarejestrowane sprzętowe i biometryczne poświadczenia FIDO2/WebAuthn.
        </p>
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

      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/60 border-b border-slate-800 text-slate-400 uppercase tracking-wider font-semibold text-[10px]">
              <tr>
                <th className="p-4">Nazwa Klucza</th>
                <th className="p-4">Właściciel</th>
                <th className="p-4">Typ Urządzenia</th>
                <th className="p-4">Utworzono</th>
                <th className="p-4">Ostatnie Użycie</th>
                <th className="p-4 text-right">Akcja</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {passkeys.map((p) => (
                <tr key={p.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="p-4">
                    <div className="font-medium text-slate-200 flex items-center gap-1.5">
                      <KeyRound className="w-3.5 h-3.5 text-purple-400" />
                      <span>{p.name}</span>
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono truncate max-w-xs">
                      ID: {p.credentialId}
                    </div>
                  </td>
                  <td className="p-4">
                    <Link
                      href={`/admin/users/${p.user.id}`}
                      className="font-medium text-slate-200 hover:text-blue-400 transition-colors"
                    >
                      {p.user.displayName}
                    </Link>
                    <div className="text-[11px] text-slate-500 font-mono">{p.user.email}</div>
                  </td>
                  <td className="p-4">
                    <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 font-mono text-[10px] text-slate-300">
                      {p.deviceType || "Passkey"}
                    </span>
                  </td>
                  <td className="p-4 text-slate-400 text-[11px] font-mono">
                    {new Date(p.createdAt).toLocaleDateString()}
                  </td>
                  <td className="p-4 text-slate-400 text-[11px] font-mono">
                    {p.lastUsedAt ? new Date(p.lastUsedAt).toLocaleString() : "Nigdy"}
                  </td>
                  <td className="p-4 text-right">
                    <button
                      onClick={() => handleRevoke(p.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-950 hover:bg-red-950/60 text-slate-300 hover:text-red-300 border border-slate-800 hover:border-red-900 rounded-lg text-xs transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Odwołaj</span>
                    </button>
                  </td>
                </tr>
              ))}
              {passkeys.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500">
                    Brak zarejestrowanych kluczy Passkey w systemie.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
