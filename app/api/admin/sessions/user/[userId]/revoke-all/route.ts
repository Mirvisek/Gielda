import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, handleAdminError } from "@/lib/admin/require-admin";
import { revokeAllSessionsForUserByAdmin } from "@/lib/admin/session-service";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const admin = await requireAdmin();
    const { userId } = await params;

    const result = await revokeAllSessionsForUserByAdmin(userId, admin.id);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return handleAdminError(error);
  }
}
