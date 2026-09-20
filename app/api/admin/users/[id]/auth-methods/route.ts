import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, handleAdminError } from "@/lib/admin/require-admin";
import { updateUserAuthMethods } from "@/lib/admin/user-service";
import { AuthMethod } from "@prisma/client";
import { z } from "zod";

const methodsSchema = z.object({
  allowedMethods: z.record(z.nativeEnum(AuthMethod), z.boolean()),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;

    const json = await req.json();
    const { allowedMethods } = methodsSchema.parse(json);

    await updateUserAuthMethods(id, allowedMethods as Record<AuthMethod, boolean>, admin.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleAdminError(error);
  }
}
