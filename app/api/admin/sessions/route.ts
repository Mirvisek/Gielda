import { NextResponse } from "next/server";
import { requireAdmin, handleAdminError } from "@/lib/admin/require-admin";
import { listActiveSessions } from "@/lib/admin/session-service";

export async function GET() {
  try {
    await requireAdmin();
    const sessions = await listActiveSessions();
    return NextResponse.json({ sessions });
  } catch (error) {
    return handleAdminError(error);
  }
}
