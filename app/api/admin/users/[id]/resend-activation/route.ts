import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, handleAdminError } from "@/lib/admin/require-admin";
import { resendActivationToken } from "@/lib/admin/user-service";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;

    const result = await resendActivationToken(id, admin.id);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return handleAdminError(error);
  }
}
