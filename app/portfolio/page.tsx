import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session";
import { portfolioService } from "@/lib/portfolio/portfolio-service";
import PortfolioClient from "./portfolio-client";

export const dynamic = "force-dynamic";

export default async function PortfolioPage() {
  const sessionData = await getCurrentSession();
  if (!sessionData || sessionData.user.status !== "ACTIVE") {
    redirect("/login");
  }

  const [portfolioSummary, watchlist] = await Promise.all([
    portfolioService.getPortfolioSummary(sessionData.user.id),
    portfolioService.getWatchlist(sessionData.user.id),
  ]);

  return (
    <PortfolioClient
      initialPortfolio={portfolioSummary}
      initialWatchlist={watchlist}
      currentUser={{
        id: sessionData.user.id,
        email: sessionData.user.email,
        displayName: sessionData.user.displayName,
        role: sessionData.user.role,
      }}
    />
  );
}
