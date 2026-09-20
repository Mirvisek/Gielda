import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session";
import { alertService } from "@/lib/alerts/alert-service";
import { notificationService } from "@/lib/alerts/notification-service";
import { pushService } from "@/lib/alerts/push-service";
import { portfolioService } from "@/lib/portfolio/portfolio-service";
import AlertsClient from "./alerts-client";

export const dynamic = "force-dynamic";

export default async function AlertsPage() {
  const sessionData = await getCurrentSession();
  if (!sessionData || sessionData.user.status !== "ACTIVE") {
    redirect("/login");
  }

  const [alerts, notificationsData, watchlist, pushCount] = await Promise.all([
    alertService.getUserAlerts(sessionData.user.id),
    notificationService.getNotifications(sessionData.user.id, false, 1, 50),
    portfolioService.getWatchlist(sessionData.user.id),
    pushService.getUserSubscriptionsCount(sessionData.user.id),
  ]);

  return (
    <AlertsClient
      initialAlerts={alerts}
      initialNotifications={notificationsData.notifications}
      initialUnreadCount={notificationsData.unreadCount}
      watchlist={watchlist}
      pushDevicesCount={pushCount}
      currentUser={{
        id: sessionData.user.id,
        email: sessionData.user.email,
        displayName: sessionData.user.displayName,
        role: sessionData.user.role,
      }}
    />
  );
}
