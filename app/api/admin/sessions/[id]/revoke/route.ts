import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, handleAdminError } from "@/lib/admin/require-admin";
import { revokeSessionByAdmin } from "@/lib/admin/session-service";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;

    const result = await revokeSessionByAdmin(id, admin.id);
    return NextResponse.json(result);
  } catch (error) {
    return handleAdminError(error);
  }
}
