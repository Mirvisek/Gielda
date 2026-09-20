import webPush from "web-push";
import prisma from "@/lib/db/prisma";
import { PushPayload, PushSubscriptionInput } from "./types";

class PushService {
  private vapidPublicKey: string;
  private vapidPrivateKey: string;
  private vapidSubject: string;
  private initialized = false;

  constructor() {
    this.vapidSubject = process.env.VAPID_SUBJECT || "mailto:admin@local.test";

    // Jeśli klucze są w zmiennych środowiskowych, użyj ich.
    // W przeciwnym razie wygeneruj parę kluczy VAPID dla trybu developerskiego.
    if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
      this.vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
      this.vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
    } else {
      // Stabilny klucz zastępczy na czas uruchomienia, by nie crashować środowiska
      const keys = webPush.generateVAPIDKeys();
      this.vapidPublicKey = keys.publicKey;
      this.vapidPrivateKey = keys.privateKey;
    }

    this.ensureInitialized();
  }

  private ensureInitialized() {
    if (!this.initialized) {
      try {
        webPush.setVapidDetails(
          this.vapidSubject,
          this.vapidPublicKey,
          this.vapidPrivateKey
        );
        this.initialized = true;
      } catch (err) {
        console.error("Błąd inicjalizacji Web Push VAPID:", err);
      }
    }
  }

  /**
   * Zwraca publiczny klucz VAPID dla przeglądarki użytkownika.
   */
  getVapidPublicKey(): string {
    return this.vapidPublicKey;
  }

  /**
   * Zapisuje lub aktualizuje subskrypcję Web Push urządzenia użytkownika.
   */
  async saveSubscription(
    userId: string,
    sub: PushSubscriptionInput,
    userAgent?: string
  ) {
    return await prisma.pushSubscription.upsert({
      where: { endpoint: sub.endpoint },
      create: {
        userId,
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        userAgent: userAgent || sub.userAgent || null,
      },
      update: {
        userId,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        userAgent: userAgent || sub.userAgent || null,
      },
    });
  }

  /**
   * Usuwa subskrypcję danego urządzenia (np. przy wylogowaniu lub cofnięciu zgody).
   */
  async removeSubscription(userId: string, endpoint: string) {
    return await prisma.pushSubscription.deleteMany({
      where: {
        userId,
        endpoint,
      },
    });
  }

  /**
   * Pobiera liczbę zarejestrowanych urządzeń użytkownika.
   */
  async getUserSubscriptionsCount(userId: string): Promise<number> {
    return await prisma.pushSubscription.count({
      where: { userId },
    });
  }

  /**
   * Wysyła natywne powiadomienie Web Push do wszystkich zarejestrowanych urządzeń użytkownika.
   * Automatycznie usuwa z bazy wygasłe tokeny (HTTP 410 Gone / 404 Not Found).
   */
  async sendNotificationToUser(userId: string, payload: PushPayload): Promise<{
    sentCount: number;
    failedCount: number;
    purgedCount: number;
  }> {
    this.ensureInitialized();

    const subscriptions = await prisma.pushSubscription.findMany({
      where: { userId },
    });

    if (subscriptions.length === 0) {
      return { sentCount: 0, failedCount: 0, purgedCount: 0 };
    }

    const notificationPayload = JSON.stringify({
      title: payload.title,
      body: payload.body,
      icon: payload.icon || "/icons/icon-192.png",
      badge: payload.badge || "/icons/icon-192.png",
      url: payload.url || "/alerts",
      tag: payload.tag || "market-alert",
    });

    let sentCount = 0;
    let failedCount = 0;
    let purgedCount = 0;

    await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          await webPush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: {
                p256dh: sub.p256dh,
                auth: sub.auth,
              },
            },
            notificationPayload
          );
          sentCount++;
        } catch (err: unknown) {
          failedCount++;
          const statusCode = (err as { statusCode?: number })?.statusCode;
          // 410 Gone lub 404 oznacza wyrejestrowane lub wygasłe urządzenie
          if (statusCode === 410 || statusCode === 404) {
            await prisma.pushSubscription.deleteMany({
              where: { endpoint: sub.endpoint },
            });
            purgedCount++;
          }
        }
      })
    );

    return { sentCount, failedCount, purgedCount };
  }
}

export const pushService = new PushService();
