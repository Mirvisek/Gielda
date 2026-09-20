"use client";

import { useState } from "react";
import { FileText, ShieldAlert, CheckCircle2, XCircle } from "lucide-react";

export interface AuditLogItem {
  id: string;
  actorUserId: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  ipAddress: string | null;
  metadata: string | null;
  createdAt: Date | string;
  actor: {
    id: string;
    email: string;
    displayName: string;
  } | null;
}

export interface SecurityEventItem {
  id: string;
  userId: string | null;
  eventType: string;
  success: boolean;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: string | null;
  createdAt: Date | string;
  user: {
    id: string;
    email: string;
    displayName: string;
  } | null;
}

interface Props {
  initialAuditLogs: AuditLogItem[];
  initialSecurityEvents: SecurityEventItem[];
}

export default function AuditClient({
  initialAuditLogs,
  initialSecurityEvents,
}: Props) {
  const [tab, setTab] = useState<"AUDIT" | "SECURITY">("AUDIT");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-100">Dziennik Audytu & Bezpieczeństwa</h2>
        <p className="text-xs text-slate-400 mt-0.5">
          Ściśle niemutowalne (read-only) logi operacji administracyjnych oraz zdarzeń bezpieczeństwa.
        </p>
      </div>

      {/* Przełącznik Zakładek */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
        <button
          onClick={() => setTab("AUDIT")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
            tab === "AUDIT"
              ? "bg-slate-800 text-white border border-slate-700"
              : "text-slate-400 hover:text-white"
          }`}
        >
          <FileText className="w-3.5 h-3.5 text-blue-400" />
          <span>Działania Administratorów (audit_logs)</span>
        </button>

        <button
          onClick={() => setTab("SECURITY")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
            tab === "SECURITY"
              ? "bg-slate-800 text-white border border-slate-700"
              : "text-slate-400 hover:text-white"
          }`}
        >
          <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
          <span>Zdarzenia Systemowe (security_events)</span>
        </button>
      </div>

      {/* Tabela Audit Logs */}
      {tab === "AUDIT" && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/60 border-b border-slate-800 text-slate-400 uppercase tracking-wider font-semibold text-[10px]">
                <tr>
                  <th className="p-4">Czas</th>
                  <th className="p-4">Administrator</th>
                  <th className="p-4">Operacja</th>
                  <th className="p-4">Cel (Target)</th>
                  <th className="p-4">Adres IP</th>
                  <th className="p-4">Szczegóły (Metadata)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                {initialAuditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="p-4 text-slate-400">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className="p-4">
                      <div className="text-slate-200">{log.actor?.displayName || "System"}</div>
                      <div className="text-[10px] text-slate-500">{log.actor?.email}</div>
                    </td>
                    <td className="p-4">
                      <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-blue-400 font-bold text-[10px]">
                        {log.action}
                      </span>
                    </td>
                    <td className="p-4 text-slate-300">
                      {log.targetType} {log.targetId ? `(${log.targetId.slice(0, 10)}...)` : ""}
                    </td>
                    <td className="p-4 text-slate-400">{log.ipAddress || "—"}</td>
                    <td className="p-4 text-[10px] text-slate-500 max-w-xs truncate">
                      {log.metadata || "—"}
                    </td>
                  </tr>
                ))}
                {initialAuditLogs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-500 font-sans">
                      Brak wpisów w dzienniku audytu.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tabela Security Events */}
      {tab === "SECURITY" && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/60 border-b border-slate-800 text-slate-400 uppercase tracking-wider font-semibold text-[10px]">
                <tr>
                  <th className="p-4">Czas</th>
                  <th className="p-4">Wynik</th>
                  <th className="p-4">Typ Zdarzenia</th>
                  <th className="p-4">Konto Użytkownika</th>
                  <th className="p-4">IP & User-Agent</th>
                  <th className="p-4">Metadane</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                {initialSecurityEvents.map((evt) => (
                  <tr key={evt.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="p-4 text-slate-400">
                      {new Date(evt.createdAt).toLocaleString()}
                    </td>
                    <td className="p-4">
                      {evt.success ? (
                        <span className="inline-flex items-center gap-1 text-emerald-400">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>SUKCES</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-red-400">
                          <XCircle className="w-3.5 h-3.5" />
                          <span>PORAŻKA</span>
                        </span>
                      )}
                    </td>
                    <td className="p-4 font-bold text-slate-200">{evt.eventType}</td>
                    <td className="p-4 text-slate-300">
                      {evt.user?.email || <span className="text-slate-600">Niezidentyfikowany</span>}
                    </td>
                    <td className="p-4">
                      <div className="text-slate-300">{evt.ipAddress || "—"}</div>
                      <div className="text-[10px] text-slate-500 max-w-xs truncate">
                        {evt.userAgent}
                      </div>
                    </td>
                    <td className="p-4 text-[10px] text-slate-500 max-w-xs truncate">
                      {evt.metadata || "—"}
                    </td>
                  </tr>
                ))}
                {initialSecurityEvents.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-500 font-sans">
                      Brak zdarzeń w dzienniku bezpieczeństwa.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
