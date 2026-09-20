import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, handleAdminError } from "@/lib/admin/require-admin";
import { createUser, listUsers } from "@/lib/admin/user-service";
import { UserRole, UserStatus } from "@prisma/client";
import { z } from "zod";

const createUserSchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(2).max(100),
  role: z.nativeEnum(UserRole).optional(),
  allowedMethods: z.object({
    PASSWORD: z.boolean(),
    PASSKEY: z.boolean(),
    GOOGLE: z.boolean(),
    APPLE: z.boolean(),
    FACEBOOK: z.boolean(),
  }),
});

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();

    const searchParams = req.nextUrl.searchParams;
    const status = (searchParams.get("status") as UserStatus) || undefined;
    const role = (searchParams.get("role") as UserRole) || undefined;
    const search = searchParams.get("search") || undefined;

    const users = await listUsers({ status, role, search });
    return NextResponse.json({ users });
  } catch (error) {
    return handleAdminError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin();

    const json = await req.json();
    const parsed = createUserSchema.parse(json);

    const result = await createUser(parsed, admin.id);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleAdminError(error);
  }
}
