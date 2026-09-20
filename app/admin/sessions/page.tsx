import { listActiveSessions } from "@/lib/admin/session-service";
import SessionsClient from "./sessions-client";

export const dynamic = "force-dynamic";

export default async function AdminSessionsPage() {
  const sessions = await listActiveSessions();

  return <SessionsClient initialSessions={sessions} />;
}
