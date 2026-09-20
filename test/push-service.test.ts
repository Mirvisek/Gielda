import { describe, it, expect, vi, beforeEach } from "vitest";
import prisma from "@/lib/db/prisma";
import webPush from "web-push";
import { pushService } from "@/lib/alerts/push-service";

describe("Serwis Notyfikacji PWA Web Push (Push Service)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("powinien udostępnić klucz publiczny VAPID dla przeglądarki", () => {
    const key = pushService.getVapidPublicKey();
    expect(key).toBeDefined();
    expect(typeof key).toBe("string");
    expect(key.length).toBeGreaterThan(20);
  });

  it("powinien zapisać subskrypcję Web Push w bazie danych (upsert)", async () => {
    const upsertSpy = vi.spyOn(prisma.pushSubscription, "upsert").mockResolvedValue({
      id: "sub-1",
      userId: "user-1",
      endpoint: "https://fcm.googleapis.com/fcm/send/test-token",
      p256dh: "key-p256dh",
      auth: "key-auth",
      userAgent: "Chrome Mobile",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await pushService.saveSubscription(
      "user-1",
      {
        endpoint: "https://fcm.googleapis.com/fcm/send/test-token",
        keys: {
          p256dh: "key-p256dh",
          auth: "key-auth",
        },
      },
      "Chrome Mobile"
    );

    expect(upsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { endpoint: "https://fcm.googleapis.com/fcm/send/test-token" },
        create: expect.objectContaining({
          userId: "user-1",
          userAgent: "Chrome Mobile",
        }),
      })
    );
  });

  it("powinien usunąć subskrypcję danego endpointu", async () => {
    const deleteManySpy = vi.spyOn(prisma.pushSubscription, "deleteMany").mockResolvedValue({ count: 1 });

    await pushService.removeSubscription("user-1", "https://fcm.googleapis.com/fcm/send/test-token");

    expect(deleteManySpy).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        endpoint: "https://fcm.googleapis.com/fcm/send/test-token",
      },
    });
  });

  it("powinien automatycznie usunąć wygasłą subskrypcję przy błędzie 410 Gone", async () => {
    const mockSubscriptions = [
      {
        id: "sub-expired",
        userId: "user-1",
        endpoint: "https://fcm.googleapis.com/fcm/send/expired-token",
        p256dh: "p1",
        auth: "a1",
      },
    ];

    vi.spyOn(prisma.pushSubscription, "findMany").mockResolvedValue(mockSubscriptions as any);
    const deleteManySpy = vi.spyOn(prisma.pushSubscription, "deleteMany").mockResolvedValue({ count: 1 });

    // Mock webPush.sendNotification z błędem 410 Gone
    vi.spyOn(webPush, "sendNotification").mockRejectedValueOnce({
      statusCode: 410,
      message: "Subscription expired or unsubscribed",
    });

    const result = await pushService.sendNotificationToUser("user-1", {
      title: "Test",
      body: "Treść",
    });

    expect(result.sentCount).toBe(0);
    expect(result.failedCount).toBe(1);
    expect(result.purgedCount).toBe(1);

    // Weryfikacja usunięcia martwej subskrypcji
    expect(deleteManySpy).toHaveBeenCalledWith({
      where: { endpoint: "https://fcm.googleapis.com/fcm/send/expired-token" },
    });
  });
});
