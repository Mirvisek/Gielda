import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { getUserAllowedAuthMethods } from "@/lib/auth/auth-methods";

export async function GET() {
  const sessionData = await getCurrentSession();

  if (!sessionData) {
    return NextResponse.json({ authenticated: false, user: null });
  }

  const allowedMethods = await getUserAllowedAuthMethods(sessionData.user.id);

  return NextResponse.json({
    authenticated: true,
    user: {
      id: sessionData.user.id,
      email: sessionData.user.email,
      displayName: sessionData.user.displayName,
      role: sessionData.user.role,
      status: sessionData.user.status,
    },
    allowedMethods,
  });
}
