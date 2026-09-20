import { NextResponse } from "next/server";
import { requireAdmin, handleAdminError } from "@/lib/admin/require-admin";
import { listAllPasskeys } from "@/lib/admin/passkey-service";

export async function GET() {
  try {
    await requireAdmin();
    const passkeys = await listAllPasskeys();
    return NextResponse.json({ passkeys });
  } catch (error) {
    return handleAdminError(error);
  }
}
