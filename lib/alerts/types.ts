import { z } from "zod";
import { AlertType } from "@prisma/client";

export const CreateAlertSchema = z.object({
  assetSymbol: z
    .string()
    .min(1)
    .max(32)
    .transform((s) => s.trim().toUpperCase())
    .optional(),
  alertType: z.enum([
    "PRICE",
    "VOLUME",
    "NEWS",
    "GEOPOLITICS",
    "OPPORTUNITY",
    "RISK",
    "SENTIMENT",
    "PORTFOLIO",
  ]),
  conditionOperator: z.enum([
    ">",
    "<",
    ">=",
    "<=",
    "CROSSES",
    "CROSSES_ABOVE",
    "CROSSES_BELOW",
  ]),
  thresholdValue: z.coerce.number(),
  cooldownMinutes: z.coerce.number().min(5).max(10080).default(60),
  notes: z.string().max(255).optional(),
});

export type CreateAlertInput = z.infer<typeof CreateAlertSchema>;

export const UpdateAlertSchema = z.object({
  isActive: z.boolean().optional(),
  thresholdValue: z.coerce.number().optional(),
  conditionOperator: z
    .enum([">", "<", ">=", "<=", "CROSSES", "CROSSES_ABOVE", "CROSSES_BELOW"])
    .optional(),
  cooldownMinutes: z.coerce.number().min(5).max(10080).optional(),
  notes: z.string().max(255).optional(),
});

export type UpdateAlertInput = z.infer<typeof UpdateAlertSchema>;

export const PushSubscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
  userAgent: z.string().optional(),
});

export type PushSubscriptionInput = z.infer<typeof PushSubscriptionSchema>;

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  url?: string;
  tag?: string;
}

export interface AlertDto {
  id: string;
  userId: string;
  assetId: string | null;
  assetSymbol?: string;
  assetName?: string;
  alertType: AlertType;
  conditionOperator: string;
  thresholdValue: number;
  isActive: boolean;
  notes: string | null;
  cooldownMinutes: number;
  lastNotifiedAt: string | null;
  isTriggered: boolean;
  triggeredAt: string | null;
  createdAt: string;
}

export interface NotificationDto {
  id: string;
  userId: string;
  alertId: string | null;
  title: string;
  message: string;
  severity: "INFO" | "WARNING" | "CRITICAL" | "SUCCESS";
  isRead: boolean;
  readAt: string | null;
  linkUrl: string | null;
  metadata: string | null;
  createdAt: string;
}
