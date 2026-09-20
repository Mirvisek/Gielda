import { z } from "zod";
import { FactorCategory, SignalStatus, TimeHorizon } from "@prisma/client";

export type FactorDirection = "POSITIVE" | "NEGATIVE" | "NEUTRAL";

export interface Factor {
  name: string;
  category: FactorCategory;
  value: number;
  normalizedValue: number; // znormalizowana wartość w przedziale [-1.0, +1.0]
  weight: number;          // waga czynnika w modelu [0.0, 1.0]
  confidence: number;      // poziom pewności danych dla tego czynnika [0.0, 1.0]
  direction: FactorDirection;
  source: string;
  description: string;
}

export const SignalThesisSchema = z.object({
  bullCase: z.string().min(10),
  bearCase: z.string().min(10),
  catalysts: z.array(z.string()).min(1),
  invalidators: z.array(z.string()).min(1),
  summary: z.string().min(10),
});

export type SignalThesis = z.infer<typeof SignalThesisSchema>;

export interface ScoreBreakdown {
  opportunityScore: number; // 0–100
  riskScore: number;        // 0–100
  confidenceScore: number;  // 0–100
  direction: FactorDirection;
  status: SignalStatus;
  timeHorizon: TimeHorizon;
  factors: Factor[];
}

export interface GeneratedSignal extends ScoreBreakdown {
  assetId: string;
  symbol: string;
  currentPrice: number;
  bullThesis: string;
  bearThesis: string;
  catalysts: string[];
  invalidators: string[];
  timestamp: Date;
}
