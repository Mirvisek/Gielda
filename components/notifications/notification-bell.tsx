"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  Bell,
  CheckCircle,
  AlertTriangle,
  ShieldAlert,
  Info,
  CheckCheck,
  ExternalLink,
  X,
} from "lucide-react";
import { NotificationDto } from "@/lib/alerts/types";

export default function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationDto[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = async () => {
    try {
      const res = await fetch("/api/notifications?limit=10");
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
        setUnreadCount(data.unreadCount || 0);
      }
    } catch {
      // Ignoruj błędy sieciowe w tle
    }
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 45000); // Polling co 45s
    return () => clearInterval(interval);
  }, []);

  // Zamknij popover przy kliknięciu poza komponentem
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const handleMarkAllAsRead = async () => {
    try {
      const res = await fetch("/api/notifications", { method: "PATCH" });
      if (res.ok) {
        setUnreadCount(0);
        setNotifications((prev) =>
          prev.map((n) => ({ ...n, isRead: true, readAt: new Date().toISOString() }))
        );
      }
    } catch {
      // Ignoruj
    }
  };

  const handleMarkAsRead = async (id: string) => {
    try {
      await fetch(`/api/notifications/${id}`, { method: "PATCH" });
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === id ? { ...n, isRead: true, readAt: new Date().toISOString() } : n
        )
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {
      // Ignoruj
    }
  };

  const getSeverityIcon = (severity: NotificationDto["severity"]) => {
    switch (severity) {
      case "CRITICAL":
        return <ShieldAlert className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />;
      case "WARNING":
        return <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />;
      case "SUCCESS":
        return <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />;
      default:
        return <Info className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />;
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Przycisk dzwonka */}
      <button
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen) fetchNotifications();
        }}
        className="relative p-1.5 rounded-lg border border-slate-800 hover:border-slate-700 bg-slate-900 text-slate-400 hover:text-white transition-colors cursor-pointer"
        title="Centrum powiadomień"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] px-1 items-center justify-center rounded-full bg-rose-600 text-[10px] font-bold text-white font-mono shadow-sm">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Popover powiadomień */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl z-50 overflow-hidden font-sans">
          <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
                Powiadomienia
              </span>
              {unreadCount > 0 && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-rose-950 text-rose-300 border border-rose-800">
                  {unreadCount} nowe
                </span>
              )}
            </div>

            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllAsRead}
                  className="text-[11px] text-slate-400 hover:text-emerald-400 transition-colors flex items-center gap-1 cursor-pointer"
                  title="Oznacz wszystkie jako przeczytane"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  <span>Odczytaj</span>
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                className="text-slate-400 hover:text-white p-1 ml-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Lista powiadomień */}
          <div className="max-h-80 overflow-y-auto divide-y divide-slate-800/60">
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                Brak nowych powiadomień
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className={`p-3 text-xs transition-colors flex items-start gap-2.5 ${
                    n.isRead ? "bg-slate-900/40 text-slate-400" : "bg-slate-800/30 text-slate-200 font-medium"
                  }`}
                >
                  {getSeverityIcon(n.severity)}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <p className="font-semibold text-slate-200 truncate text-[11px]">
                        {n.title}
                      </p>
                      <span className="text-[9px] text-slate-500 font-mono shrink-0">
                        {new Date(n.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-snug line-clamp-2">
                      {n.message}
                    </p>
                    <div className="flex items-center justify-between mt-2 pt-1 text-[10px]">
                      {n.linkUrl ? (
                        <Link
                          href={n.linkUrl}
                          onClick={() => {
                            if (!n.isRead) handleMarkAsRead(n.id);
                            setIsOpen(false);
                          }}
                          className="text-blue-400 hover:text-blue-300 flex items-center gap-1"
                        >
                          <span>Przejdź</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </Link>
                      ) : (
                        <span />
                      )}
                      {!n.isRead && (
                        <button
                          onClick={() => handleMarkAsRead(n.id)}
                          className="text-slate-500 hover:text-emerald-400 transition-colors"
                        >
                          Oznacz jako przeczytane
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Stopka popovera */}
          <div className="p-2.5 border-t border-slate-800 bg-slate-950/80 text-center">
            <Link
              href="/alerts"
              onClick={() => setIsOpen(false)}
              className="text-xs text-blue-400 hover:text-blue-300 font-medium block"
            >
              Zarządzaj alertami i Web Push &rarr;
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
