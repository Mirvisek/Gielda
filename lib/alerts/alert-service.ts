import prisma from "@/lib/db/prisma";
import { marketService } from "@/lib/market/market-service";
import { signalService } from "@/lib/scoring/signal-service";
import { portfolioService } from "@/lib/portfolio/portfolio-service";
import { pushService } from "./push-service";
import {
  AlertDto,
  CreateAlertInput,
  CreateAlertSchema,
  UpdateAlertInput,
  UpdateAlertSchema,
} from "./types";

export class AlertService {
  /**
   * Tworzy nową regułę alertu z weryfikacją danych wejściowych i powiązaniem z instrumentem.
   */
  async createAlert(userId: string, input: CreateAlertInput): Promise<AlertDto> {
    const data = CreateAlertSchema.parse(input);

    let assetId: string | null = null;
    let assetSymbol: string | undefined = undefined;
    let assetName: string | undefined = undefined;

    if (data.assetSymbol) {
      const asset = await marketService.getOrCreateAsset(data.assetSymbol);
      assetId = asset.id;
      assetSymbol = asset.symbol;
      assetName = asset.name;
    }

    const alert = await prisma.alert.create({
      data: {
        userId,
        assetId,
        alertType: data.alertType,
        conditionOperator: data.conditionOperator,
        thresholdValue: data.thresholdValue,
        cooldownMinutes: data.cooldownMinutes ?? 60,
        notes: data.notes,
        isActive: true,
      },
      include: {
        asset: true,
      },
    });

    return {
      id: alert.id,
      userId: alert.userId,
      assetId: alert.assetId,
      assetSymbol: alert.asset?.symbol || assetSymbol,
      assetName: alert.asset?.name || assetName,
      alertType: alert.alertType,
      conditionOperator: alert.conditionOperator,
      thresholdValue: Number(alert.thresholdValue),
      isActive: alert.isActive,
      notes: alert.notes,
      cooldownMinutes: alert.cooldownMinutes,
      lastNotifiedAt: alert.lastNotifiedAt ? alert.lastNotifiedAt.toISOString() : null,
      isTriggered: alert.isTriggered,
      triggeredAt: alert.triggeredAt ? alert.triggeredAt.toISOString() : null,
      createdAt: alert.createdAt.toISOString(),
    };
  }

  /**
   * Pobiera listę alertów użytkownika.
   */
  async getUserAlerts(userId: string): Promise<AlertDto[]> {
    const alerts = await prisma.alert.findMany({
      where: { userId },
      include: { asset: true },
      orderBy: { createdAt: "desc" },
    });

    return alerts.map((a) => ({
      id: a.id,
      userId: a.userId,
      assetId: a.assetId,
      assetSymbol: a.asset?.symbol,
      assetName: a.asset?.name,
      alertType: a.alertType,
      conditionOperator: a.conditionOperator,
      thresholdValue: Number(a.thresholdValue),
      isActive: a.isActive,
      notes: a.notes,
      cooldownMinutes: a.cooldownMinutes,
      lastNotifiedAt: a.lastNotifiedAt ? a.lastNotifiedAt.toISOString() : null,
      isTriggered: a.isTriggered,
      triggeredAt: a.triggeredAt ? a.triggeredAt.toISOString() : null,
      createdAt: a.createdAt.toISOString(),
    }));
  }

  /**
   * Aktualizuje regułę alertu z weryfikacją IDOR.
   */
  async updateAlert(
    userId: string,
    alertId: string,
    input: UpdateAlertInput
  ): Promise<AlertDto> {
    const data = UpdateAlertSchema.parse(input);

    const existing = await prisma.alert.findUnique({
      where: { id: alertId },
      include: { asset: true },
    });

    if (!existing || existing.userId !== userId) {
      throw new Error("Alert nie został odnaleziony lub brak uprawnień dostępu.");
    }

    const updated = await prisma.alert.update({
      where: { id: alertId },
      data: {
        isActive: data.isActive !== undefined ? data.isActive : existing.isActive,
        thresholdValue:
          data.thresholdValue !== undefined
            ? data.thresholdValue
            : existing.thresholdValue,
        conditionOperator:
          data.conditionOperator !== undefined
            ? data.conditionOperator
            : existing.conditionOperator,
        cooldownMinutes:
          data.cooldownMinutes !== undefined
            ? data.cooldownMinutes
            : existing.cooldownMinutes,
        notes: data.notes !== undefined ? data.notes : existing.notes,
      },
      include: { asset: true },
    });

    return {
      id: updated.id,
      userId: updated.userId,
      assetId: updated.assetId,
      assetSymbol: updated.asset?.symbol,
      assetName: updated.asset?.name,
      alertType: updated.alertType,
      conditionOperator: updated.conditionOperator,
      thresholdValue: Number(updated.thresholdValue),
      isActive: updated.isActive,
      notes: updated.notes,
      cooldownMinutes: updated.cooldownMinutes,
      lastNotifiedAt: updated.lastNotifiedAt
        ? updated.lastNotifiedAt.toISOString()
        : null,
      isTriggered: updated.isTriggered,
      triggeredAt: updated.triggeredAt ? updated.triggeredAt.toISOString() : null,
      createdAt: updated.createdAt.toISOString(),
    };
  }

  /**
   * Przełącza aktywność alertu (wstrzymaj / aktywuj).
   */
  async toggleAlert(userId: string, alertId: string, isActive: boolean) {
    return await this.updateAlert(userId, alertId, { isActive });
  }

  /**
   * Usuwa regułę alertu z obroną IDOR.
   */
  async deleteAlert(userId: string, alertId: string) {
    const existing = await prisma.alert.findUnique({
      where: { id: alertId },
    });

    if (!existing || existing.userId !== userId) {
      throw new Error("Alert nie został odnaleziony lub brak uprawnień dostępu.");
    }

    await prisma.alert.delete({
      where: { id: alertId },
    });

    return { success: true };
  }

  /**
   * Pomocnicza funkcja sprawdzająca spełnienie warunku matematycznego.
   */
  private checkCondition(val: number, op: string, threshold: number): boolean {
    switch (op) {
      case ">":
      case "CROSSES_ABOVE":
        return val > threshold;
      case ">=":
        return val >= threshold;
      case "<":
      case "CROSSES_BELOW":
        return val < threshold;
      case "<=":
        return val <= threshold;
      case "CROSSES":
        return Math.abs(val - threshold) <= threshold * 0.01;
      default:
        return false;
    }
  }

  /**
   * Centralny silnik ewaluacji wszystkich aktywnych alertów w systemie.
   * Gwarantuje:
   * - Przestrzeganie cooldownMinutes (brak spamu powiadomień)
   * - Tworzenie rekordu AlertNotification w bazie danych
   * - Wysyłkę Web Push via pushService
   */
  async evaluateAlerts(): Promise<{
    evaluatedCount: number;
    triggeredCount: number;
  }> {
    const activeAlerts = await prisma.alert.findMany({
      where: { isActive: true },
      include: { asset: true, user: true },
    });

    let triggeredCount = 0;
    const now = new Date();

    for (const alert of activeAlerts) {
      // 1. Sprawdź cooldown (ochrona przed floodingiem powiadomień)
      if (alert.lastNotifiedAt) {
        const diffMinutes =
          (now.getTime() - new Date(alert.lastNotifiedAt).getTime()) / (1000 * 60);
        if (diffMinutes < alert.cooldownMinutes) {
          continue; // W oknie cooldownu pomijamy
        }
      }

      const threshold = Number(alert.thresholdValue);
      let isConditionMet = false;
      let title = "";
      let message = "";
      let severity: "INFO" | "WARNING" | "CRITICAL" | "SUCCESS" = "INFO";
      let linkUrl: string = "/alerts";

      try {
        if (alert.alertType === "PRICE" && alert.asset) {
          const symbol = alert.asset.symbol;
          const quote = await marketService.getQuote(symbol);
          if (quote && quote.price > 0) {
            isConditionMet = this.checkCondition(
              quote.price,
              alert.conditionOperator,
              threshold
            );
            if (isConditionMet) {
              title = `Alert Cenowy: ${symbol}`;
              message = `Kurs ${symbol} osiągnął $${quote.price.toFixed(2)} (warunek: ${alert.conditionOperator} $${threshold.toFixed(2)}).`;
              severity = quote.price > threshold ? "SUCCESS" : "WARNING";
              linkUrl = `/assets/${symbol}`;
            }
          }
        } else if (alert.alertType === "OPPORTUNITY" && alert.asset) {
          const symbol = alert.asset.symbol;
          const signal = await signalService.getOrGenerateSignal(symbol);
          if (signal) {
            isConditionMet = this.checkCondition(
              signal.opportunityScore,
              alert.conditionOperator,
              threshold
            );
            if (isConditionMet) {
              title = `Wskaźnik Szansy AI: ${symbol}`;
              message = `Opportunity Score dla ${symbol} wzrósł do ${signal.opportunityScore}/100 (warunek: ${alert.conditionOperator} ${threshold}). Kierunek: ${signal.direction}.`;
              severity = "SUCCESS";
              linkUrl = `/assets/${symbol}`;
            }
          }
        } else if (alert.alertType === "RISK" && alert.asset) {
          const symbol = alert.asset.symbol;
          const signal = await signalService.getOrGenerateSignal(symbol);
          if (signal) {
            isConditionMet = this.checkCondition(
              signal.riskScore,
              alert.conditionOperator,
              threshold
            );
            if (isConditionMet) {
              title = `Ostrzeżenie o Ryzyku AI: ${symbol}`;
              message = `Wskaźnik ryzyka dla ${symbol} osiągnął ${signal.riskScore}/100 (warunek: ${alert.conditionOperator} ${threshold}).`;
              severity = "CRITICAL";
              linkUrl = `/assets/${symbol}`;
            }
          }
        } else if (alert.alertType === "PORTFOLIO") {
          const portfolio = await portfolioService.getPortfolioSummary(alert.userId);
          // Alert na wskaźnik ryzyka portfela lub spadek wartości całkowitej
          const riskMet = this.checkCondition(
            portfolio.portfolioRiskScore,
            alert.conditionOperator,
            threshold
          );
          if (riskMet || (portfolio.isHighRiskWarning && threshold <= 70)) {
            isConditionMet = true;
            title = `Ostrzeżenie Ryzyka Portfela`;
            message = `Ważony wskaźnik ryzyka portfela wynosi ${portfolio.portfolioRiskScore}/100 (próg: ${threshold}). Wartość portfela: $${portfolio.totalValue.toFixed(2)}.`;
            severity = "WARNING";
            linkUrl = `/portfolio`;
          }
        }

        // 2. Jeśli warunek został spełniony, zarejestruj powiadomienie i wyślij Web Push
        if (isConditionMet) {
          triggeredCount++;

          // Zapis powiadomienia w bazie danych
          await prisma.alertNotification.create({
            data: {
              userId: alert.userId,
              alertId: alert.id,
              title,
              message,
              severity,
              linkUrl,
            },
          });

          // Aktualizacja alertu
          await prisma.alert.update({
            where: { id: alert.id },
            data: {
              isTriggered: true,
              triggeredAt: now,
              lastNotifiedAt: now,
            },
          });

          // Równoległa wysyłka Web Push do urządzeń użytkownika
          await pushService.sendNotificationToUser(alert.userId, {
            title,
            body: message,
            url: linkUrl,
            tag: `alert-${alert.id}`,
          });
        }
      } catch (err) {
        console.error(`Błąd ewaluacji alertu ${alert.id}:`, err);
      }
    }

    return {
      evaluatedCount: activeAlerts.length,
      triggeredCount,
    };
  }
}

export const alertService = new AlertService();
