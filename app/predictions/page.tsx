import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session";
import { predictionService } from "@/lib/scoring/prediction-service";
import PredictionClient, { serializePrediction } from "./prediction-client";

export const dynamic = "force-dynamic";

export default async function PredictionsPage() {
  const sessionData = await getCurrentSession();
  if (!sessionData || sessionData.user.status !== "ACTIVE") {
    redirect("/login");
  }

  // Pobierz pierwszą stronę prognoz oraz statystyki kalibracji
  const [predictionsData, stats] = await Promise.all([
    predictionService.getPredictions({ page: 1, limit: 20 }),
    predictionService.getCalibrationStats(),
  ]);

  const serializedItems = predictionsData.items.map(serializePrediction);

  return (
    <PredictionClient
      initialPredictions={{
        items: serializedItems,
        total: predictionsData.total,
        page: predictionsData.page,
        limit: predictionsData.limit,
        totalPages: predictionsData.totalPages,
      }}
      initialStats={stats}
      currentUser={{
        id: sessionData.user.id,
        email: sessionData.user.email,
        displayName: sessionData.user.displayName,
        role: sessionData.user.role,
      }}
    />
  );
}
