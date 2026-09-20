import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session";
import { getUserAllowedAuthMethods } from "@/lib/auth/auth-methods";
import DashboardClient from "./dashboard-client";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const sessionData = await getCurrentSession();

  // Ochrona trasy: brak sesji lub konto nieaktywne -> przekierowanie do logowania
  if (!sessionData || sessionData.user.status !== "ACTIVE") {
    redirect("/login");
  }

  const allowedMethods = await getUserAllowedAuthMethods(sessionData.user.id);

  return (
    <DashboardClient
      user={{
        id: sessionData.user.id,
        email: sessionData.user.email,
        displayName: sessionData.user.displayName,
        role: sessionData.user.role,
        status: sessionData.user.status,
      }}
      allowedMethods={allowedMethods}
    />
  );
}
