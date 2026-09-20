import { z } from "zod";

export const ExecuteTradeSchema = z.object({
  symbol: z
    .string()
    .min(1, "Symbol is required")
    .max(32, "Symbol is too long")
    .transform((val) => val.trim().toUpperCase()),
  type: z.enum(["BUY", "SELL"]),
  quantity: z.coerce.number().positive("Quantity must be greater than zero"),
  price: z.coerce.number().positive("Price must be greater than zero"),
  fee: z.coerce.number().nonnegative("Fee cannot be negative").default(0),
  notes: z.string().max(1000).optional(),
  executedAt: z.string().or(z.date()).optional(),
});

export type ExecuteTradeInput = z.input<typeof ExecuteTradeSchema>;

export const CashOperationSchema = z.object({
  type: z.enum(["DEPOSIT", "WITHDRAWAL", "ADJUSTMENT"]),
  amount: z.coerce.number().positive("Amount must be greater than zero"),
  description: z.string().max(255).optional(),
});

export type CashOperationInput = z.input<typeof CashOperationSchema>;

export interface PositionSummary {
  id: string;
  assetId: string;
  symbol: string;
  name: string;
  currency: string;
  quantity: number;
  averageBuyPrice: number;
  currentPrice: number;
  marketValue: number;
  costBasis: number;
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
  realizedPnL: number;
  totalPnL: number;
  weightPercent: number;
  signal: {
    opportunityScore: number;
    riskScore: number;
    confidenceScore: number;
    direction: string;
  } | null;
  isConcentratedRiskWarning: boolean;
  status: "ACTIVE" | "CLOSED";
}

export interface PortfolioSummary {
  id: string;
  name: string;
  currency: string;
  cashBalance: number;
  equityValue: number;
  totalValue: number;
  totalCostBasis: number;
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
  realizedPnL: number;
  totalPnL: number;
  portfolioRiskScore: number;
  positions: PositionSummary[];
  isHighRiskWarning: boolean;
}

export interface WatchlistItemSummary {
  id: string;
  assetId: string;
  symbol: string;
  name: string;
  currency: string;
  currentPrice: number;
  changePercent: number;
  opportunityScore: number | null;
  riskScore: number | null;
  confidenceScore: number | null;
  direction: string | null;
  addedAt: string;
}

export interface PortfolioTransactionDto {
  id: string;
  assetSymbol: string;
  assetName: string;
  type: "BUY" | "SELL";
  quantity: number;
  price: number;
  totalValue: number;
  fee: number;
  notes: string | null;
  executedAt: string;
}

export interface CashTransactionDto {
  id: string;
  type: string;
  amount: number;
  balanceAfter: number;
  description: string | null;
  createdAt: string;
}
