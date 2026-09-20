import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session";
import { UserRole, UserStatus } from "@prisma/client";
import Link from "next/link";
import {
  Users,
  KeyRound,
  Radio,
  FileText,
  LayoutDashboard,
  Lock,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const sessionData = await getCurrentSession();

  // Centralny guard po stronie serwera dla widoków /admin/*
  if (
    !sessionData ||
    sessionData.user.status !== UserStatus.ACTIVE ||
    sessionData.user.role !== UserRole.ADMIN
  ) {
    redirect("/login");
  }

  const { user } = sessionData;

  const navItems = [
    { label: "Przegląd", href: "/admin", icon: LayoutDashboard },
    { label: "Użytkownicy", href: "/admin/users", icon: Users },
    { label: "Aktywne Sesje", href: "/admin/sessions", icon: Radio },
    { label: "Klucze Passkey", href: "/admin/passkeys", icon: KeyRound },
    { label: "Audyt & Zdarzenia", href: "/admin/audit", icon: FileText },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Header */}
      <header className="border-b border-red-900/30 bg-slate-900/80 backdrop-blur sticky top-0 z-50 px-4 lg:px-8 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-red-600/20 border border-red-500/40 flex items-center justify-center text-red-400">
            <Lock className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold tracking-wider uppercase text-slate-100">
                Panel Administracyjny
              </h1>
              <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-red-950 border border-red-800 text-red-400 uppercase">
                ADMIN
              </span>
            </div>
            <p className="text-[10px] text-slate-400">Centrum Zarządzania Bezpieczeństwem i Kontami</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <Link
            href="/dashboard"
            className="text-xs text-blue-400 hover:text-blue-300 transition-colors hidden sm:inline"
          >
            ← Wróć do Aplikacji
          </Link>

          <div className="flex items-center gap-2 border-l border-slate-800 pl-4">
            <div className="text-right hidden sm:block">
              <div className="text-xs font-medium text-slate-200">{user.displayName}</div>
              <div className="text-[10px] text-slate-500 font-mono">{user.email}</div>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation Bar */}
      <nav className="border-b border-slate-800 bg-slate-900/40 px-4 lg:px-8 py-2 overflow-x-auto flex items-center gap-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-colors shrink-0"
            >
              <Icon className="w-3.5 h-3.5 text-slate-400" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Main Content */}
      <main className="flex-1 p-4 lg:p-8 max-w-7xl mx-auto w-full">{children}</main>
    </div>
  );
}
