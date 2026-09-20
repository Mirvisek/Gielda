import { describe, it, expect, vi, beforeEach } from "vitest";
import prisma from "@/lib/db/prisma";
import { alertService } from "@/lib/alerts/alert-service";
import { notificationService } from "@/lib/alerts/notification-service";

describe("Testy Bezpieczeństwa Alertów & IDOR Protection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const userA = "user-alice-123";
  const userB = "user-bob-456";

  const alertB = {
    id: "alert-bob-1",
    userId: userB,
    assetId: "asset-1",
    alertType: "PRICE",
    conditionOperator: ">",
    thresholdValue: 150 as any,
    isActive: true,
  };

  const notificationB = {
    id: "notif-bob-1",
    userId: userB,
    alertId: alertB.id,
    title: "Powiadomienie Boba",
    message: "Tylko dla Boba",
    severity: "INFO",
    isRead: false,
  };

  it("powinien uniemożliwić Użytkownikowi A modyfikację alertu Użytkownika B (IDOR update)", async () => {
    vi.spyOn(prisma.alert, "findUnique").mockResolvedValue(alertB as any);
    const updateSpy = vi.spyOn(prisma.alert, "update");

    await expect(
      alertService.updateAlert(userA, alertB.id, { thresholdValue: 200 })
    ).rejects.toThrow("Alert nie został odnaleziony lub brak uprawnień dostępu.");

    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("powinien uniemożliwić Użytkownikowi A usunięcie alertu Użytkownika B (IDOR delete)", async () => {
    vi.spyOn(prisma.alert, "findUnique").mockResolvedValue(alertB as any);
    const deleteSpy = vi.spyOn(prisma.alert, "delete");

    await expect(alertService.deleteAlert(userA, alertB.id)).rejects.toThrow(
      "Alert nie został odnaleziony lub brak uprawnień dostępu."
    );

    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it("powinien uniemożliwić Użytkownikowi A oznaczenie powiadomienia Użytkownika B jako przeczytane", async () => {
    vi.spyOn(prisma.alertNotification, "findUnique").mockResolvedValue(notificationB as any);
    const updateSpy = vi.spyOn(prisma.alertNotification, "update");

    await expect(
      notificationService.markAsRead(userA, notificationB.id)
    ).rejects.toThrow("Powiadomienie nie zostało odnalezione lub brak uprawnień.");

    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("powinien uniemożliwić Użytkownikowi A usunięcie powiadomienia Użytkownika B", async () => {
    vi.spyOn(prisma.alertNotification, "findUnique").mockResolvedValue(notificationB as any);
    const deleteSpy = vi.spyOn(prisma.alertNotification, "delete");

    await expect(
      notificationService.deleteNotification(userA, notificationB.id)
    ).rejects.toThrow("Powiadomienie nie zostało odnalezione lub brak uprawnień.");

    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it("powinien ściśle filtrować powiadomienia per userId", async () => {
    const findManySpy = vi.spyOn(prisma.alertNotification, "findMany").mockResolvedValue([]);
    vi.spyOn(prisma.alertNotification, "count").mockResolvedValue(0);

    await notificationService.getNotifications(userA);

    expect(findManySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: userA,
        }),
      })
    );
  });
});
