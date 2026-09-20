import { TechnicalIndicators } from "@/lib/market/types";
import { Factor } from "./types";
import { FactorCategory } from "@prisma/client";

/**
 * Przekształca wskaźniki techniczne w ujednolicone, znormalizowane czynniki [-1.0, +1.0].
 */
export function extractTechnicalFactors(indicators: TechnicalIndicators): Factor[] {
  const factors: Factor[] = [];
  const {
    currentPrice,
    rsi14,
    sma20,
    sma50,
    sma200,
    ema20,
    atr14,
    return1d,
    return5d,
    return20d,
    return60d,
    volumeRatio20d,
  } = indicators;

  // 1. Czynnik: RSI(14)
  if (rsi14 !== null && !isNaN(rsi14)) {
    // Normalizacja: 50 -> 0.0, 70 -> +0.4, 30 -> -0.4, >70 wykupienie, <30 wyprzedanie
    let normRsi = (rsi14 - 50) / 50;
    normRsi = Math.max(-1, Math.min(1, Number(normRsi.toFixed(4))));

    let direction: "POSITIVE" | "NEGATIVE" | "NEUTRAL" = "NEUTRAL";
    if (normRsi > 0.15) direction = "POSITIVE";
    else if (normRsi < -0.15) direction = "NEGATIVE";

    factors.push({
      name: "RSI_14",
      category: FactorCategory.TECHNICAL,
      value: Number(rsi14.toFixed(2)),
      normalizedValue: normRsi,
      weight: 0.10,
      confidence: 1.0,
      direction,
      source: "TECHNICAL",
      description: `Wskaźnik siły względnej RSI(14) wynosi ${rsi14.toFixed(1)}.`,
    });
  }

  // 2. Czynnik: Trend krótkoterminowy (Cena vs SMA20 & EMA20)
  if (sma20 !== null && currentPrice > 0) {
    const dist20 = ((currentPrice - sma20) / sma20) * 100;
    // Normalizacja odległości od SMA20 (+5% -> +1.0, -5% -> -1.0)
    let normTrend = Math.tanh(dist20 / 4);
    normTrend = Math.max(-1, Math.min(1, Number(normTrend.toFixed(4))));

    let direction: "POSITIVE" | "NEGATIVE" | "NEUTRAL" = "NEUTRAL";
    if (normTrend > 0.15) direction = "POSITIVE";
    else if (normTrend < -0.15) direction = "NEGATIVE";

    factors.push({
      name: "SMA_20_TREND",
      category: FactorCategory.TECHNICAL,
      value: Number(dist20.toFixed(2)),
      normalizedValue: normTrend,
      weight: 0.10,
      confidence: 1.0,
      direction,
      source: "TECHNICAL",
      description: `Odchylenie ceny od średniej 20-sesyjnej: ${dist20 >= 0 ? "+" : ""}${dist20.toFixed(1)}%.`,
    });
  }

  // 3. Czynnik: Złoty / Śmiercionośny Krzyż (EMA20 vs SMA50)
  if (ema20 !== null && sma50 !== null && sma50 > 0) {
    const crossRatio = ((ema20 - sma50) / sma50) * 100;
    let normCross = Math.tanh(crossRatio / 3);
    normCross = Math.max(-1, Math.min(1, Number(normCross.toFixed(4))));

    let direction: "POSITIVE" | "NEGATIVE" | "NEUTRAL" = "NEUTRAL";
    if (normCross > 0.15) direction = "POSITIVE";
    else if (normCross < -0.15) direction = "NEGATIVE";

    factors.push({
      name: "MA_CROSS_20_50",
      category: FactorCategory.TECHNICAL,
      value: Number(crossRatio.toFixed(2)),
      normalizedValue: normCross,
      weight: 0.08,
      confidence: 1.0,
      direction,
      source: "TECHNICAL",
      description: `Relacja EMA(20) do SMA(50): ${crossRatio >= 0 ? "+" : ""}${crossRatio.toFixed(1)}%.`,
    });
  }

  // 4. Czynnik: Długoterminowy Reżim Rynkowy (SMA200)
  if (sma200 !== null && currentPrice > 0) {
    const dist200 = ((currentPrice - sma200) / sma200) * 100;
    let normRegime = Math.tanh(dist200 / 10);
    normRegime = Math.max(-1, Math.min(1, Number(normRegime.toFixed(4))));

    let direction: "POSITIVE" | "NEGATIVE" | "NEUTRAL" = "NEUTRAL";
    if (normRegime > 0.1) direction = "POSITIVE";
    else if (normRegime < -0.1) direction = "NEGATIVE";

    factors.push({
      name: "REGIME_SMA_200",
      category: FactorCategory.MACRO,
      value: Number(dist200.toFixed(2)),
      normalizedValue: normRegime,
      weight: 0.12,
      confidence: 1.0,
      direction,
      source: "TECHNICAL",
      description: `Położenie względem 200-sesyjnej średniej długoterminowej: ${dist200 >= 0 ? "+" : ""}${dist200.toFixed(1)}%.`,
    });
  }

  // 5. Czynnik: Momentum (Zwrot 5d i 20d)
  const retShort = return5d !== null ? return5d : return1d;
  const retMed = return20d !== null ? return20d : return60d;

  if (retShort !== null) {
    let normMomShort = Math.tanh(retShort / 5);
    normMomShort = Math.max(-1, Math.min(1, Number(normMomShort.toFixed(4))));

    let direction: "POSITIVE" | "NEGATIVE" | "NEUTRAL" = "NEUTRAL";
    if (normMomShort > 0.15) direction = "POSITIVE";
    else if (normMomShort < -0.15) direction = "NEGATIVE";

    factors.push({
      name: "MOMENTUM_SHORT",
      category: FactorCategory.TECHNICAL,
      value: Number(retShort.toFixed(2)),
      normalizedValue: normMomShort,
      weight: 0.08,
      confidence: 0.9,
      direction,
      source: "TECHNICAL",
      description: `Krótkoterminowe momentum cenowe: ${retShort >= 0 ? "+" : ""}${retShort.toFixed(2)}%.`,
    });
  }

  if (retMed !== null) {
    let normMomMed = Math.tanh(retMed / 15);
    normMomMed = Math.max(-1, Math.min(1, Number(normMomMed.toFixed(4))));

    let direction: "POSITIVE" | "NEGATIVE" | "NEUTRAL" = "NEUTRAL";
    if (normMomMed > 0.15) direction = "POSITIVE";
    else if (normMomMed < -0.15) direction = "NEGATIVE";

    factors.push({
      name: "MOMENTUM_MEDIUM",
      category: FactorCategory.TECHNICAL,
      value: Number(retMed.toFixed(2)),
      normalizedValue: normMomMed,
      weight: 0.08,
      confidence: 0.95,
      direction,
      source: "TECHNICAL",
      description: `Średnioterminowe momentum cenowe: ${retMed >= 0 ? "+" : ""}${retMed.toFixed(2)}%.`,
    });
  }

  // 6. Czynnik: Zmienność ATR (Wskaźnik Ryzyka)
  if (atr14 !== null && currentPrice > 0) {
    const atrPct = (atr14 / currentPrice) * 100;
    // Normalnie ATR to 1-3%. Powyżej 5% to podwyższona zmienność/ryzyko
    // Im wyższy ATR, tym bardziej ujemny znormalizowany czynnik ryzyka
    let normAtrRisk = -(Math.tanh((atrPct - 2.5) / 3));
    normAtrRisk = Math.max(-1, Math.min(1, Number(normAtrRisk.toFixed(4))));

    factors.push({
      name: "VOLATILITY_ATR_RISK",
      category: FactorCategory.TECHNICAL,
      value: Number(atrPct.toFixed(2)),
      normalizedValue: normAtrRisk,
      weight: 0.08,
      confidence: 1.0,
      direction: normAtrRisk < -0.2 ? "NEGATIVE" : "NEUTRAL",
      source: "TECHNICAL",
      description: `Zmienność oparta o średni zasięg ATR(14): ${atrPct.toFixed(2)}% ceny aktywa.`,
    });
  }

  // 7. Czynnik: Wolumen i akumulacja / dystrybucja
  if (volumeRatio20d !== null && volumeRatio20d > 0) {
    const isUp = (return1d || 0) >= 0;
    // Wolumen powyżej 1.0 przy wzroście to akumulacja; przy spadku to wyprzedaż
    const ratioDiff = volumeRatio20d - 1.0;
    let normVol = Math.tanh(ratioDiff) * (isUp ? 1 : -1);
    normVol = Math.max(-1, Math.min(1, Number(normVol.toFixed(4))));

    factors.push({
      name: "VOLUME_ACCUMULATION",
      category: FactorCategory.TECHNICAL,
      value: Number(volumeRatio20d.toFixed(2)),
      normalizedValue: normVol,
      weight: 0.08,
      confidence: 0.85,
      direction: normVol > 0.15 ? "POSITIVE" : normVol < -0.15 ? "NEGATIVE" : "NEUTRAL",
      source: "TECHNICAL",
      description: `Relacja wolumenu do 20-dniowej średniej: ${volumeRatio20d.toFixed(2)}x (${isUp ? "sesja wzrostowa" : "sesja spadkowa"}).`,
    });
  }

  return factors;
}
