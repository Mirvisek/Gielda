import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { userSettingsService } from "@/lib/user/user-settings-service";
import { z } from "zod";

const changePasswordSchema = z.object({
  currentPassword: z.string().optional(),
  newPassword: z.string().min(1, "Nowe hasło jest wymagane."),
});

export async function POST(req: NextRequest) {
  const sessionData = await getCurrentSession();
  if (!sessionData) {
    return NextResponse.json({ error: "Wymagane zalogowanie." }, { status: 401 });
  }

  try {
    const json = await req.json();
    const { currentPassword, newPassword } = changePasswordSchema.parse(json);

    const result = await userSettingsService.changePassword(
      sessionData.user.id,
      currentPassword,
      newPassword
    );
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Błąd zmiany hasła.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
