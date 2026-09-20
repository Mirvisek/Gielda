import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, handleAdminError } from "@/lib/admin/require-admin";
import { getAuditLogs, getSecurityEvents } from "@/lib/admin/audit-service";

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();

    const searchParams = req.nextUrl.searchParams;
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)));
    const offset = Math.max(0, parseInt(searchParams.get("offset") || "0", 10));

    const [auditData, securityData] = await Promise.all([
      getAuditLogs(limit, offset),
      getSecurityEvents(limit, offset),
    ]);

    return NextResponse.json({
      auditLogs: auditData.logs,
      auditTotal: auditData.total,
      securityEvents: securityData.events,
      securityTotal: securityData.total,
    });
  } catch (error) {
    return handleAdminError(error);
  }
}
