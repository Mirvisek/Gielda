import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session";
import { marketService } from "@/lib/market/market-service";
import MarketsClient from "./markets-client";

export const dynamic = "force-dynamic";

export default async function MarketsPage() {
  const sessionData = await getCurrentSession();
  if (!sessionData || sessionData.user.status !== "ACTIVE") {
    redirect("/login");
  }

  const overview = await marketService.getMarketOverview();

  return <MarketsClient initialOverview={overview} />;
}
