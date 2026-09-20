import prisma from "@/lib/db/prisma";
import { NotificationDto } from "./types";

export class NotificationService {
  /**
   * Pobiera powiadomienia użytkownika z paginacją oraz liczbą nieprzeczytanych.
   */
  async getNotifications(
    userId: string,
    unreadOnly = false,
    page = 1,
    limit = 30
  ): Promise<{
    notifications: NotificationDto[];
    total: number;
    unreadCount: number;
  }> {
    const skip = (page - 1) * limit;
    const where: { userId: string; isRead?: boolean } = { userId };
    if (unreadOnly) {
      where.isRead = false;
    }

    const [items, total, unreadCount] = await Promise.all([
      prisma.alertNotification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.alertNotification.count({ where }),
      prisma.alertNotification.count({
        where: { userId, isRead: false },
      }),
    ]);

    const notifications: NotificationDto[] = items.map((n) => ({
      id: n.id,
      userId: n.userId,
      alertId: n.alertId,
      title: n.title,
      message: n.message,
      severity: n.severity as NotificationDto["severity"],
      isRead: n.isRead,
      readAt: n.readAt ? n.readAt.toISOString() : null,
      linkUrl: n.linkUrl,
      metadata: n.metadata,
      createdAt: n.createdAt.toISOString(),
    }));

    return { notifications, total, unreadCount };
  }

  /**
   * Zwraca samą liczbę nieprzeczytanych powiadomień (dla ikony dzwonka).
   */
  async getUnreadCount(userId: string): Promise<number> {
    return await prisma.alertNotification.count({
      where: { userId, isRead: false },
    });
  }

  /**
   * Oznacza powiadomienie jako przeczytane z twardą weryfikacją IDOR.
   */
  async markAsRead(userId: string, notificationId: string) {
    const notif = await prisma.alertNotification.findUnique({
      where: { id: notificationId },
    });

    if (!notif || notif.userId !== userId) {
      throw new Error("Powiadomienie nie zostało odnalezione lub brak uprawnień.");
    }

    return await prisma.alertNotification.update({
      where: { id: notificationId },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });
  }

  /**
   * Oznacza wszystkie powiadomienia danego użytkownika jako przeczytane.
   */
  async markAllAsRead(userId: string) {
    return await prisma.alertNotification.updateMany({
      where: {
        userId,
        isRead: false,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });
  }

  /**
   * Usuwa powiadomienie z weryfikacją IDOR.
   */
  async deleteNotification(userId: string, notificationId: string) {
    const notif = await prisma.alertNotification.findUnique({
      where: { id: notificationId },
    });

    if (!notif || notif.userId !== userId) {
      throw new Error("Powiadomienie nie zostało odnalezione lub brak uprawnień.");
    }

    await prisma.alertNotification.delete({
      where: { id: notificationId },
    });

    return { success: true };
  }
}

export const notificationService = new NotificationService();
