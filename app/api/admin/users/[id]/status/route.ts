import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, handleAdminError } from "@/lib/admin/require-admin";
import { changeUserStatus } from "@/lib/admin/user-service";
import { UserStatus } from "@prisma/client";
import { z } from "zod";

const statusSchema = z.object({
  status: z.nativeEnum(UserStatus),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;

    const json = await req.json();
    const { status } = statusSchema.parse(json);

    const result = await changeUserStatus(id, status, admin.id);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return handleAdminError(error);
  }
}
