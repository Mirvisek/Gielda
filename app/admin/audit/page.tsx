import { getAuditLogs, getSecurityEvents } from "@/lib/admin/audit-service";
import AuditClient from "./audit-client";

export const dynamic = "force-dynamic";

export default async function AdminAuditPage() {
  const [auditData, securityData] = await Promise.all([
    getAuditLogs(50, 0),
    getSecurityEvents(50, 0),
  ]);

  return (
    <AuditClient
      initialAuditLogs={auditData.logs}
      initialSecurityEvents={securityData.events}
    />
  );
}
