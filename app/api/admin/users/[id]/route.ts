import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, handleAdminError } from "@/lib/admin/require-admin";
import { getUserDetails } from "@/lib/admin/user-service";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const { id } = await params;

    const user = await getUserDetails(id);
    return NextResponse.json({ user });
  } catch (error) {
    return handleAdminError(error);
  }
}
