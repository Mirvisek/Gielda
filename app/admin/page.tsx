import prisma from "@/lib/db/prisma";
import Link from "next/link";
import { Users, KeyRound, Radio, ShieldAlert, UserPlus, ArrowRight } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  const [
    totalUsers,
    activeUsers,
    invitedUsers,
    activeSessions,
    totalPasskeys,
    recentEvents,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { status: "ACTIVE" } }),
    prisma.user.count({ where: { status: "INVITED" } }),
    prisma.session.count({ where: { revokedAt: null, expiresAt: { gt: new Date() } } }),
    prisma.passkey.count(),
    prisma.securityEvent.findMany({
      take: 5,
      orderBy: { createdAt: "desc" },
      include: { user: { select: { email: true } } },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-100">Przegląd Bezpieczeństwa</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Stan uwierzytelniania, użytkowników i integralności systemu.
          </p>
        </div>

        <Link
          href="/admin/users"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-all shadow-md shadow-blue-600/20 w-fit"
        >
          <UserPlus className="w-4 h-4" />
          <span>Utwórz nowe konto</span>
        </Link>
      </div>

      {/* Karty podsumowania */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Konta użytkowników</span>
            <Users className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-bold text-slate-100">{totalUsers}</div>
          <div className="text-[11px] text-slate-500 mt-1">
            {activeUsers} aktywnych · {invitedUsers} oczekujących
          </div>
        </div>

        <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Aktywne sesje</span>
            <Radio className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-slate-100">{activeSessions}</div>
          <div className="text-[11px] text-slate-500 mt-1">Zabezpieczone SHA-256</div>
        </div>

        <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Klucze Passkey</span>
            <KeyRound className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-bold text-slate-100">{totalPasskeys}</div>
          <div className="text-[11px] text-slate-500 mt-1">Zarejestrowanych WebAuthn</div>
        </div>

        <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Model Dostępów</span>
            <ShieldAlert className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-sm font-bold text-amber-300">Prywatny (Whitelist)</div>
          <div className="text-[11px] text-slate-500 mt-1">Brak rejestracji publicznej</div>
        </div>
      </div>

      {/* Ostatnie zdarzenia */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-200">
            Ostatnie Zdarzenia Bezpieczeństwa (Security Events)
          </h3>
          <Link
            href="/admin/audit"
            className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
          >
            <span>Zobacz wszystkie</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="divide-y divide-slate-800/60">
          {recentEvents.map((evt) => (
            <div key={evt.id} className="py-3 flex items-center justify-between text-xs">
              <div className="flex items-center gap-3">
                <span
                  className={`w-2 h-2 rounded-full ${
                    evt.success ? "bg-emerald-400" : "bg-red-400"
                  }`}
                />
                <span className="font-mono font-medium text-slate-200">{evt.eventType}</span>
                <span className="text-slate-500 font-mono">
                  {evt.user?.email || "Niezidentyfikowany"}
                </span>
              </div>
              <div className="flex items-center gap-4 text-slate-500 font-mono text-[11px]">
                <span>IP: {evt.ipAddress || "—"}</span>
                <span>{new Date(evt.createdAt).toLocaleTimeString()}</span>
              </div>
            </div>
          ))}
          {recentEvents.length === 0 && (
            <div className="text-xs text-slate-500 py-4 text-center">
              Brak zarejestrowanych zdarzeń w ostatnim czasie.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
