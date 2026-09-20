import { requireAuth } from "@/lib/auth/session";
import { userSettingsService } from "@/lib/user/user-settings-service";
import { SettingsClient } from "./settings-client";

export default async function SettingsPage() {
  const { user, session } = await requireAuth();

  const settings = await userSettingsService.getUserSettings(user.id, session.id);

  return <SettingsClient initialData={settings} currentUser={user} />;
}
