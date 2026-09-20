import { listAllPasskeys } from "@/lib/admin/passkey-service";
import PasskeysClient from "./passkeys-client";

export const dynamic = "force-dynamic";

export default async function AdminPasskeysPage() {
  const passkeys = await listAllPasskeys();

  return <PasskeysClient initialPasskeys={passkeys} />;
}
