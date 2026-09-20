"use client";

import { useState } from "react";
import { Trash2, CheckCircle, AlertTriangle } from "lucide-react";
import Link from "next/link";

export interface SessionItem {
  id: string;
  userId: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date | string;
  lastSeenAt: Date | string;
  expiresAt: Date | string;
  user: {
    id: string;
    email: string;
    displayName: string;
    role: string;
    status: string;
  };
}

export default function SessionsClient({ initialSessions }: { initialSessions: SessionItem[] }) {
  const [sessions, setSessions] = useState<SessionItem[]>(initialSessions);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleRevoke = async (sessionId: string) => {
    if (!confirm("Czy na pewno chcesz unieważnić tę sesję?")) return;

    try {
      const res = await fetch(`/api/admin/sessions/${sessionId}/revoke`, { method: "POST" });
      if (!res.ok) throw new Error("Błąd podczas unieważniania sesji.");

      setSessions(sessions.filter((s) => s.id !== sessionId));
      setMessage({ type: "success", text: "Sesja została pomyślnie unieważniona." });
    } catch (err: unknown) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Błąd" });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-100">Aktywne Sesje w Systemie</h2>
        <p className="text-xs text-slate-400 mt-0.5">
          Lista wszystkich otwartych tokenów sesyjnych (SHA-256) użytkowników w aplikacji.
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
                <th className="p-4">Użytkownik</th>
                <th className="p-4">IP & Urządzenie</th>
                <th className="p-4">Utworzono</th>
                <th className="p-4">Ostatnia Aktywność</th>
                <th className="p-4">Wygasa</th>
                <th className="p-4 text-right">Akcja</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {sessions.map((s) => (
                <tr key={s.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="p-4">
                    <Link
                      href={`/admin/users/${s.user.id}`}
                      className="font-medium text-slate-200 hover:text-blue-400 transition-colors"
                    >
                      {s.user.displayName}
                    </Link>
                    <div className="text-[11px] text-slate-500 font-mono">{s.user.email}</div>
                  </td>
                  <td className="p-4">
                    <div className="font-mono text-slate-300">{s.ipAddress || "—"}</div>
                    <div className="text-[10px] text-slate-500 truncate max-w-xs font-mono">
                      {s.userAgent || "Brak User-Agent"}
                    </div>
                  </td>
                  <td className="p-4 text-slate-400 text-[11px] font-mono">
                    {new Date(s.createdAt).toLocaleString()}
                  </td>
                  <td className="p-4 text-slate-400 text-[11px] font-mono">
                    {new Date(s.lastSeenAt).toLocaleString()}
                  </td>
                  <td className="p-4 text-slate-400 text-[11px] font-mono">
                    {new Date(s.expiresAt).toLocaleDateString()}
                  </td>
                  <td className="p-4 text-right">
                    <button
                      onClick={() => handleRevoke(s.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-950 hover:bg-red-950/60 text-slate-300 hover:text-red-300 border border-slate-800 hover:border-red-900 rounded-lg text-xs transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Odwołaj</span>
                    </button>
                  </td>
                </tr>
              ))}
              {sessions.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500">
                    Brak otwartych sesji w systemie.
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
