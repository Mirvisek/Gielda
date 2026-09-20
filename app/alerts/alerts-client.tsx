"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Bell,
  Plus,
  Trash2,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  ArrowLeft,
  ShieldAlert,
  Smartphone,
  Send,
  X,
  ExternalLink,
  Power,
  Info,
  CheckCheck,
} from "lucide-react";
import { AlertDto, NotificationDto, CreateAlertInput } from "@/lib/alerts/types";
import { WatchlistItemSummary } from "@/lib/portfolio/types";
import NotificationBell from "@/components/notifications/notification-bell";

interface Props {
  initialAlerts: AlertDto[];
  initialNotifications: NotificationDto[];
  initialUnreadCount: number;
  watchlist: WatchlistItemSummary[];
  pushDevicesCount: number;
  currentUser: {
    id: string;
    email: string;
    displayName: string;
    role: string;
  };
}

// Konwersja klucza VAPID base64 do Uint8Array wymaganego przez PushManager
function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export default function AlertsClient({
  initialAlerts,
  initialNotifications,
  initialUnreadCount,
  watchlist,
  pushDevicesCount,
  currentUser,
}: Props) {
  const [alerts, setAlerts] = useState<AlertDto[]>(initialAlerts);
  const [notifications, setNotifications] = useState<NotificationDto[]>(initialNotifications);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [devicesCount, setDevicesCount] = useState(pushDevicesCount);

  // Stan uprawnień Web Push w bieżącej przeglądarce
  const [pushPermission, setPushPermission] = useState<"default" | "granted" | "denied" | "unsupported">("default");
  const [isSubscribedOnDevice, setIsSubscribedOnDevice] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);

  // Modal nowego alertu
  const [modalOpen, setModalOpen] = useState(false);
  const [alertType, setAlertType] = useState<"PRICE" | "OPPORTUNITY" | "RISK" | "PORTFOLIO">("PRICE");
  const [symbol, setSymbol] = useState(watchlist[0]?.symbol || "AAPL");
  const [operator, setOperator] = useState<">" | "<" | ">=" | "<=" | "CROSSES">(">");
  const [threshold, setThreshold] = useState("180");
  const [cooldown, setCooldown] = useState("60");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Stan ewaluacji
  const [evaluating, setEvaluating] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Sprawdzenie stanu Service Workera i Push Notifications po załadowaniu
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setPushPermission("unsupported");
      return;
    }

    setPushPermission(Notification.permission);

    // Rejestracja sw.js jeśli nie istnieje
    navigator.serviceWorker.register("/sw.js").then((reg) => {
      reg.pushManager.getSubscription().then((sub) => {
        setIsSubscribedOnDevice(!!sub);
      });
    });
  }, []);

  const refreshData = async () => {
    try {
      const [alertsRes, notifRes] = await Promise.all([
        fetch("/api/alerts"),
        fetch("/api/notifications"),
      ]);

      if (alertsRes.ok) {
        const aData = await alertsRes.json();
        setAlerts(aData.data || []);
      }
      if (notifRes.ok) {
        const nData = await notifRes.json();
        setNotifications(nData.notifications || []);
        setUnreadCount(nData.unreadCount || 0);
      }
    } catch {
      // Ignoruj
    }
  };

  // Rejestracja subskrypcji Web Push na bieżącym urządzeniu
  const handleSubscribePush = async () => {
    setPushLoading(true);
    setToast(null);

    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        throw new Error("Twoja przeglądarka nie obsługuje powiadomień Web Push.");
      }

      // Poproś o uprawnienia
      const permission = await Notification.requestPermission();
      setPushPermission(permission);

      if (permission !== "granted") {
        throw new Error("Nie zezwolono na powiadomienia w przeglądarce.");
      }

      // Pobierz publiczny klucz VAPID z serwera
      const keyRes = await fetch("/api/push/vapid-key");
      if (!keyRes.ok) {
        throw new Error("Błąd pobierania klucza VAPID z serwera.");
      }
      const { publicKey } = await keyRes.json();

      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();

      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      }

      const subData = sub.toJSON();

      // Zapisz na serwerze
      const saveRes = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: sub.endpoint,
          keys: {
            p256dh: subData.keys?.p256dh,
            auth: subData.keys?.auth,
          },
          userAgent: navigator.userAgent,
        }),
      });

      if (!saveRes.ok) {
        throw new Error("Błąd zapisu subskrypcji na serwerze.");
      }

      setIsSubscribedOnDevice(true);
      setDevicesCount((prev) => prev + 1);
      setToast({
        type: "success",
        text: "Powiadomienia Web Push zostały pomyślnie włączone na tym urządzeniu!",
      });
    } catch (err) {
      setToast({
        type: "error",
        text: err instanceof Error ? err.message : "Błąd rejestracji push.",
      });
    } finally {
      setPushLoading(false);
    }
  };

  // Wyłączenie subskrypcji na bieżącym urządzeniu
  const handleUnsubscribePush = async () => {
    setPushLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setIsSubscribedOnDevice(false);
      setDevicesCount((prev) => Math.max(0, prev - 1));
      setToast({
        type: "success",
        text: "Powiadomienia push zostały wyłączone dla tego urządzenia.",
      });
    } catch (err) {
      setToast({
        type: "error",
        text: err instanceof Error ? err.message : "Błąd wyrejestrowania push.",
      });
    } finally {
      setPushLoading(false);
    }
  };

  // Wysłanie testowego powiadomienia Push
  const handleSendTestPush = async () => {
    setPushLoading(true);
    try {
      const res = await fetch("/api/push/test", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Błąd wysyłki powiadomienia testowego.");
      }
      setToast({
        type: "success",
        text: data.message || "Wysłano testowe powiadomienie Push!",
      });
    } catch (err) {
      setToast({
        type: "error",
        text: err instanceof Error ? err.message : "Błąd testu powiadomień.",
      });
    } finally {
      setPushLoading(false);
    }
  };

  // Ręczne wymuszenie ewaluacji alertów
  const handleEvaluateAlerts = async () => {
    setEvaluating(true);
    try {
      const res = await fetch("/api/alerts/evaluate", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setToast({
          type: "success",
          text: `Sprawdzono ${data.result?.evaluatedCount ?? 0} alertów. Wyzwolono: ${data.result?.triggeredCount ?? 0}.`,
        });
        await refreshData();
      }
    } catch {
      setToast({ type: "error", text: "Błąd podczas ewaluacji alertów." });
    } finally {
      setEvaluating(false);
    }
  };

  // Dodanie nowego alertu
  const handleCreateAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);

    try {
      const val = parseFloat(threshold);
      const cool = parseInt(cooldown, 10);
      if (isNaN(val)) throw new Error("Wartość progu musi być liczbą.");

      const payload: CreateAlertInput = {
        alertType,
        conditionOperator: operator,
        thresholdValue: val,
        cooldownMinutes: isNaN(cool) ? 60 : cool,
        notes: notes.trim() || undefined,
        assetSymbol: alertType !== "PORTFOLIO" ? symbol.trim().toUpperCase() : undefined,
      };

      if (alertType !== "PORTFOLIO" && !payload.assetSymbol) {
        throw new Error("Symbol aktywa jest wymagany.");
      }

      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Błąd tworzenia alertu.");
      }

      setModalOpen(false);
      setToast({ type: "success", text: "Pomyślnie utworzono nową regułę alertu!" });
      await refreshData();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Nieoczekiwany błąd.");
    } finally {
      setSubmitting(false);
    }
  };

  // Przełączenie aktywności alertu
  const handleToggleAlert = async (alertId: string, currentActive: boolean) => {
    try {
      const res = await fetch(`/api/alerts/${alertId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !currentActive }),
      });

      if (res.ok) {
        setAlerts((prev) =>
          prev.map((a) => (a.id === alertId ? { ...a, isActive: !currentActive } : a))
        );
      }
    } catch {
      // Ignoruj
    }
  };

  // Usunięcie alertu
  const handleDeleteAlert = async (alertId: string) => {
    if (!confirm("Czy na pewno chcesz usunąć tę regułę alertu?")) return;

    try {
      const res = await fetch(`/api/alerts/${alertId}`, { method: "DELETE" });
      if (res.ok) {
        setAlerts((prev) => prev.filter((a) => a.id !== alertId));
        setToast({ type: "success", text: "Reguła alertu została usunięta." });
      }
    } catch {
      setToast({ type: "error", text: "Nie udało się usunąć alertu." });
    }
  };

  // Oznaczenie wszystkich powiadomień jako przeczytane
  const handleMarkAllRead = async () => {
    try {
      const res = await fetch("/api/notifications", { method: "PATCH" });
      if (res.ok) {
        setUnreadCount(0);
        setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      }
    } catch {
      // Ignoruj
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-blue-600 selection:text-white">
      {/* Pasek nawigacyjny */}
      <header className="border-b border-slate-800 bg-slate-900/70 backdrop-blur sticky top-0 z-40 px-4 lg:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="p-1.5 rounded-lg border border-slate-800 hover:border-slate-700 bg-slate-900 text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="w-8 h-8 rounded-lg bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-rose-400">
            <Bell className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold tracking-wider uppercase text-slate-100">
                Centrum Alertów & PWA Push
              </h1>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-rose-950 text-rose-400 border border-rose-800/80 uppercase">
                Real-time
              </span>
            </div>
            <p className="text-[10px] text-slate-500 hidden sm:block">
              Reguły wczesnego ostrzegania, notyfikacje natywne Web Push i dziennik zdarzeń
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => {
              setFormError(null);
              setModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-xs font-medium transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Nowy Alert</span>
          </button>

          <button
            onClick={handleEvaluateAlerts}
            disabled={evaluating}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-700 bg-slate-800/80 hover:bg-slate-800 text-slate-200 text-xs font-medium transition-colors disabled:opacity-50 cursor-pointer"
            title="Wymuś natychmiastowe sprawdzenie reguł rynkowych"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${evaluating ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Ewaluuj teraz</span>
          </button>

          {/* Dzwonek powiadomień */}
          <NotificationBell />

          <div className="h-4 w-px bg-slate-800 mx-1 hidden sm:block" />

          <Link
            href="/portfolio"
            className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors hidden md:inline"
          >
            Portfel
          </Link>
          <Link
            href="/predictions"
            className="text-xs text-amber-400 hover:text-amber-300 transition-colors hidden md:inline"
          >
            Prognozy
          </Link>
          <Link
            href="/settings"
            className="text-xs text-slate-400 hover:text-slate-200 transition-colors hidden md:inline"
          >
            Ustawienia
          </Link>

          <div className="hidden lg:flex items-center gap-2 pl-2 border-l border-slate-800 text-xs text-slate-400">
            <span className="w-2 h-2 rounded-full bg-rose-500" />
            <span className="font-medium text-slate-200">
              {currentUser.displayName || currentUser.email}
            </span>
          </div>
        </div>
      </header>

      {/* Główna treść */}
      <main className="flex-1 p-4 lg:p-8 max-w-7xl mx-auto w-full space-y-6">
        {/* Toast powiadomienia */}
        {toast && (
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
            <button onClick={() => setToast(null)} className="text-slate-400 hover:text-white p-1">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Hero Cards: 4 kluczowe metryki */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 1. Aktywne Reguły */}
          <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span className="font-medium">Reguły Alertowe</span>
              <Bell className="w-4 h-4 text-rose-400" />
            </div>
            <div className="my-2">
              <div className="text-2xl font-bold font-mono tracking-tight text-white">
                {alerts.filter((a) => a.isActive).length} / {alerts.length}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                Aktywne reguły monitorujące
              </div>
            </div>
            <div className="text-[10px] text-slate-500 font-mono">
              Wycena, wskaźniki AI i portfel
            </div>
          </div>

          {/* 2. Powiadomienia In-App */}
          <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span className="font-medium">Dziennik Powiadomień</span>
              <CheckCheck className="w-4 h-4 text-blue-400" />
            </div>
            <div className="my-2">
              <div className="text-2xl font-bold font-mono tracking-tight text-white flex items-baseline gap-2">
                <span>{notifications.length}</span>
                {unreadCount > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-rose-950 text-rose-300 border border-rose-800 font-semibold">
                    {unreadCount} nowe
                  </span>
                )}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                Zarejestrowane zdarzenia w aplikacji
              </div>
            </div>
            <div className="text-[10px] text-slate-500">
              Historia wyzwolonych alertów rynkowych
            </div>
          </div>

          {/* 3. Zarejestrowane Urządzenia Push */}
          <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span className="font-medium">Subskrypcje Web Push</span>
              <Smartphone className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="my-2">
              <div className="text-2xl font-bold font-mono tracking-tight text-white">
                {devicesCount}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                Zarejestrowane telefony i przeglądarki
              </div>
            </div>
            <div className="text-[10px] text-slate-500">
              Dostarczanie natywne w tle (VAPID)
            </div>
          </div>

          {/* 4. Status na tym urządzeniu */}
          <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span className="font-medium">Bieżące Urządzenie</span>
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  isSubscribedOnDevice ? "bg-emerald-400" : "bg-slate-600"
                }`}
              />
            </div>
            <div className="my-2">
              <div className="text-lg font-bold tracking-tight text-white">
                {isSubscribedOnDevice ? "Aktywne (Zasubskrybowano)" : "Nieaktywne"}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5 font-mono">
                Zgoda: {pushPermission}
              </div>
            </div>
            <div className="text-[10px] text-slate-500">
              {isSubscribedOnDevice
                ? "Urządzenie odbiera natywne powiadomienia"
                : "Kliknij poniżej, aby włączyć push"}
            </div>
          </div>
        </div>

        {/* Baner konfiguracji PWA Web Push */}
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-rose-400" />
              <h3 className="text-sm font-bold text-white">
                Natywne Powiadomienia PWA Push na Telefon i Pulpit
              </h3>
            </div>
            <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
              System obsługuje standard W3C Web Push (RFC 8291 / 8292 VAPID). Po włączeniu powiadomień
              będziesz otrzymywać natywne alerty rynkowe nawet przy zminimalizowanej przeglądarce
              lub zablokowanym telefonie.
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {isSubscribedOnDevice ? (
              <>
                <button
                  onClick={handleSendTestPush}
                  disabled={pushLoading}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Wyślij testowy Push</span>
                </button>
                <button
                  onClick={handleUnsubscribePush}
                  disabled={pushLoading}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-700 bg-slate-800/80 hover:bg-slate-800 text-slate-300 text-xs font-medium transition-colors disabled:opacity-50 cursor-pointer"
                >
                  <Power className="w-3.5 h-3.5 text-rose-400" />
                  <span>Wyłącz na tym urządzeniu</span>
                </button>
              </>
            ) : (
              <button
                onClick={handleSubscribePush}
                disabled={pushLoading}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition-colors shadow-lg shadow-rose-600/20 disabled:opacity-50 cursor-pointer"
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span>Włącz powiadomienia na tym urządzeniu</span>
              </button>
            )}
          </div>
        </div>

        {/* Tabela Reguł Alertowych */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                Twoje Reguły Alertowe ({alerts.length})
              </h2>
              <p className="text-[11px] text-slate-400">
                Deterministyczne reguły wczesnego ostrzegania z ochroną przed spamem (cooldown)
              </p>
            </div>

            <button
              onClick={() => {
                setFormError(null);
                setModalOpen(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Dodaj regułę</span>
            </button>
          </div>

          {alerts.length === 0 ? (
            <div className="p-12 text-center rounded-2xl bg-slate-900/40 border border-slate-800 text-xs text-slate-400 space-y-2">
              <Bell className="w-8 h-8 text-slate-600 mx-auto" />
              <p>Brak skonfigurowanych alertów.</p>
              <p className="text-[11px] text-slate-500">
                Utwórz pierwszy alert cenowy lub scoringowy AI, aby automatycznie monitorować rynek.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/60">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-900/90 text-slate-400 uppercase text-[10px] tracking-wider">
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-3">Typ alertu</th>
                    <th className="py-3.5 px-3">Instrument</th>
                    <th className="py-3.5 px-3">Warunek & Próg</th>
                    <th className="py-3.5 px-3">Cooldown</th>
                    <th className="py-3.5 px-3">Ostatnie powiadomienie</th>
                    <th className="py-3.5 px-4 text-center">Akcje</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {alerts.map((a) => (
                    <tr key={a.id} className="hover:bg-slate-800/40 transition-colors">
                      {/* Przełącznik aktywny */}
                      <td className="py-3 px-4">
                        <button
                          onClick={() => handleToggleAlert(a.id, a.isActive)}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase transition-colors cursor-pointer ${
                            a.isActive
                              ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                              : "bg-slate-800 text-slate-500 border border-slate-700"
                          }`}
                        >
                          {a.isActive ? "Aktywny" : "Wstrzymany"}
                        </button>
                      </td>

                      {/* Typ */}
                      <td className="py-3 px-3 font-semibold text-slate-200">
                        {a.alertType === "PRICE" && "Kurs Cenowy"}
                        {a.alertType === "OPPORTUNITY" && "Szansa AI (Opp Score)"}
                        {a.alertType === "RISK" && "Ryzyko AI (Risk Score)"}
                        {a.alertType === "PORTFOLIO" && "Ryzyko Portfela"}
                      </td>

                      {/* Instrument */}
                      <td className="py-3 px-3 font-mono font-bold text-white">
                        {a.assetSymbol ? (
                          <Link
                            href={`/assets/${a.assetSymbol}`}
                            className="hover:text-blue-400 flex items-center gap-1"
                          >
                            <span>{a.assetSymbol}</span>
                            <ExternalLink className="w-2.5 h-2.5 text-slate-500" />
                          </Link>
                        ) : (
                          <span className="text-slate-400 font-sans">Cały Portfel</span>
                        )}
                      </td>

                      {/* Warunek & Próg */}
                      <td className="py-3 px-3 font-mono font-semibold text-slate-100">
                        {a.conditionOperator} {a.thresholdValue}
                      </td>

                      {/* Cooldown */}
                      <td className="py-3 px-3 font-mono text-slate-400 text-[11px]">
                        {a.cooldownMinutes} min
                      </td>

                      {/* Ostatnie wyzwolenie */}
                      <td className="py-3 px-3 text-slate-400 text-[11px] font-mono">
                        {a.lastNotifiedAt
                          ? new Date(a.lastNotifiedAt).toLocaleString("pl-PL")
                          : "Nigdy"}
                      </td>

                      {/* Akcje */}
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => handleDeleteAlert(a.id)}
                          className="p-1 rounded bg-slate-800 hover:bg-rose-950 hover:text-rose-400 text-slate-400 transition-colors"
                          title="Usuń regułę"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Dziennik Powiadomień In-App */}
        <div className="space-y-4 pt-4 border-t border-slate-800/80">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                Dziennik Powiadomień In-App ({notifications.length})
              </h2>
              <p className="text-[11px] text-slate-400">
                Pełna historia zdarzeń zarejestrowanych przez silnik alertowy
              </p>
            </div>

            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-700 bg-slate-800 text-slate-200 text-xs font-medium hover:bg-slate-700 transition-colors cursor-pointer"
              >
                <CheckCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Oznacz wszystkie jako przeczytane</span>
              </button>
            )}
          </div>

          {notifications.length === 0 ? (
            <div className="p-8 text-center rounded-2xl bg-slate-900/40 border border-slate-800 text-xs text-slate-500">
              Brak historii powiadomień.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className={`p-4 rounded-2xl border transition-all space-y-2 ${
                    n.isRead
                      ? "bg-slate-900/40 border-slate-800/80 text-slate-400"
                      : "bg-slate-900/90 border-slate-700/80 text-slate-200 shadow-md"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {n.severity === "CRITICAL" && (
                        <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
                      )}
                      {n.severity === "WARNING" && (
                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                      )}
                      {n.severity === "SUCCESS" && (
                        <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                      )}
                      {n.severity === "INFO" && (
                        <Info className="w-4 h-4 text-blue-400 shrink-0" />
                      )}
                      <h4 className="text-xs font-bold text-white truncate max-w-[220px]">
                        {n.title}
                      </h4>
                    </div>
                    <span className="text-[10px] text-slate-500 font-mono shrink-0">
                      {new Date(n.createdAt).toLocaleDateString("pl-PL")}{" "}
                      {new Date(n.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>

                  <p className="text-xs text-slate-300 leading-relaxed">{n.message}</p>

                  {n.linkUrl && (
                    <div className="pt-1 flex items-center justify-between text-[11px]">
                      <Link
                        href={n.linkUrl}
                        className="text-blue-400 hover:text-blue-300 flex items-center gap-1 font-medium"
                      >
                        <span>Szczegóły instrumentu</span>
                        <ExternalLink className="w-3 h-3" />
                      </Link>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* MODAL KREATORA ALERTU */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl relative">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center">
                  <Bell className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Nowa Reguła Alertu</h3>
                  <p className="text-[10px] text-slate-400">
                    Deterministyczny monitoring rynkowy
                  </p>
                </div>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleCreateAlert} className="space-y-4 text-xs">
              {/* Typ alertu */}
              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  Typ monitorowanego zdarzenia
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setAlertType("PRICE");
                      setThreshold("180");
                    }}
                    className={`py-2 px-3 rounded-xl border font-semibold transition-colors cursor-pointer text-left ${
                      alertType === "PRICE"
                        ? "bg-rose-950/60 border-rose-600 text-rose-300"
                        : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Kurs Cenowy ($)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAlertType("OPPORTUNITY");
                      setThreshold("75");
                    }}
                    className={`py-2 px-3 rounded-xl border font-semibold transition-colors cursor-pointer text-left ${
                      alertType === "OPPORTUNITY"
                        ? "bg-emerald-950/60 border-emerald-600 text-emerald-300"
                        : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Szansa AI (0-100)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAlertType("RISK");
                      setThreshold("70");
                    }}
                    className={`py-2 px-3 rounded-xl border font-semibold transition-colors cursor-pointer text-left ${
                      alertType === "RISK"
                        ? "bg-amber-950/60 border-amber-600 text-amber-300"
                        : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Ryzyko AI (0-100)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAlertType("PORTFOLIO");
                      setThreshold("65");
                    }}
                    className={`py-2 px-3 rounded-xl border font-semibold transition-colors cursor-pointer text-left ${
                      alertType === "PORTFOLIO"
                        ? "bg-blue-950/60 border-blue-600 text-blue-300"
                        : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Ryzyko Portfela
                  </button>
                </div>
              </div>

              {/* Instrument (jeśli nie portfel) */}
              {alertType !== "PORTFOLIO" && (
                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">
                    Symbol Aktywa (Ticker)
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="np. NVDA, AAPL, MSFT"
                    value={symbol}
                    onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono uppercase focus:border-rose-500 focus:outline-none"
                  />
                </div>
              )}

              {/* Warunek i Próg */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">
                    Warunek
                  </label>
                  <select
                    value={operator}
                    onChange={(e) =>
                      setOperator(e.target.value as ">" | "<" | ">=" | "<=" | "CROSSES")
                    }
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono focus:border-rose-500 focus:outline-none"
                  >
                    <option value=">">Większe niż (&gt;)</option>
                    <option value=">=">Większe lub równe (&ge;)</option>
                    <option value="<">Mniejsze niż (&lt;)</option>
                    <option value="<=">Mniejsze lub równe (&le;)</option>
                    <option value="CROSSES">Zbliża się (w granicach 1%)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">
                    Próg wyzwolenia
                  </label>
                  <input
                    type="number"
                    step="any"
                    required
                    placeholder="np. 180"
                    value={threshold}
                    onChange={(e) => setThreshold(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono focus:border-rose-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Cooldown i Notatka */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">
                    Cooldown (minuty)
                  </label>
                  <select
                    value={cooldown}
                    onChange={(e) => setCooldown(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono focus:border-rose-500 focus:outline-none"
                  >
                    <option value="15">15 minut</option>
                    <option value="60">1 godzina (zalecane)</option>
                    <option value="240">4 godziny</option>
                    <option value="1440">24 godziny (1 raz/dzień)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">
                    Krótka notatka
                  </label>
                  <input
                    type="text"
                    placeholder="np. Sygnał do zakupu"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:border-rose-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 transition-colors cursor-pointer"
                >
                  Anuluj
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {submitting ? "Zapisywanie..." : "Utwórz Alert"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
