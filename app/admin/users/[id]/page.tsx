import { getUserDetails } from "@/lib/admin/user-service";
import { getCurrentSession } from "@/lib/auth/session";
import { notFound, redirect } from "next/navigation";
import UserDetailClient from "./user-detail-client";

export const dynamic = "force-dynamic";

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sessionData = await getCurrentSession();

  if (!sessionData) {
    redirect("/login");
  }

  try {
    const user = await getUserDetails(id);
    return <UserDetailClient user={user} currentAdminId={sessionData.user.id} />;
  } catch {
    notFound();
  }
}
