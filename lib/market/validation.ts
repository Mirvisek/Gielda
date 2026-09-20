import { OHLCV } from "./types";

const EPSILON = 1e-6;

export interface ValidationResult {
  valid: boolean;
  candle?: OHLCV;
  error?: string;
}

/**
 * Rygorystyczna walidacja i normalizacja pojedynczej świecy OHLCV.
 * Odrzuca błędne, zniekształcone lub zatrute dane od dostawców zewnętrznych.
 */
export function validateAndNormalizeCandle(raw: unknown): ValidationResult {
  if (!raw || typeof raw !== "object") {
    return { valid: false, error: "Świeca nie jest obiektem." };
  }

  const r = raw as Record<string, unknown>;

  // 1. Walidacja znacznika czasu
  let ts: Date;
  if (r.timestamp instanceof Date) {
    ts = r.timestamp;
  } else if (r.date instanceof Date) {
    ts = r.date;
  } else if (typeof r.timestamp === "string" || typeof r.timestamp === "number") {
    ts = new Date(r.timestamp);
  } else if (typeof r.date === "string" || typeof r.date === "number") {
    ts = new Date(r.date);
  } else {
    return { valid: false, error: "Brak lub nieprawidłowy format daty/timestamp." };
  }

  if (isNaN(ts.getTime())) {
    return { valid: false, error: "Nieprawidłowy czas (NaN)." };
  }

  // Odrzucenie świec z przyszłości (z marginesem 24h na różnice stref czasowych)
  if (ts.getTime() > Date.now() + 24 * 60 * 60 * 1000) {
    return { valid: false, error: "Timestamp wskazuje na przyszłość." };
  }

  // 2. Walidacja wartości cenowych
  const open = Number(r.open);
  const high = Number(r.high);
  const low = Number(r.low);
  const close = Number(r.close);
  const volume = r.volume !== undefined && r.volume !== null ? Number(r.volume) : 0;
  const adjustedClose =
    r.adjustedClose !== undefined && r.adjustedClose !== null
      ? Number(r.adjustedClose)
      : r.adjClose !== undefined && r.adjClose !== null
      ? Number(r.adjClose)
      : undefined;

  if (isNaN(open) || isNaN(high) || isNaN(low) || isNaN(close)) {
    return { valid: false, error: "Ceny zawierają wartości NaN." };
  }

  if (open <= 0 || high <= 0 || low <= 0 || close <= 0) {
    return { valid: false, error: "Ceny muszą być większe od zera." };
  }

  if (isNaN(volume) || volume < 0) {
    return { valid: false, error: "Wolumen nie może być ujemny ani NaN." };
  }

  // 3. Spójność relacji OHLC
  // high musi być najwyższą ceną w świecy
  if (high < low - EPSILON) {
    return { valid: false, error: `Niespójność: High (${high}) jest mniejszy niż Low (${low}).` };
  }

  if (high < Math.max(open, close) - EPSILON) {
    return {
      valid: false,
      error: `Niespójność: High (${high}) jest mniejszy niż max(Open, Close) (${Math.max(open, close)}).`,
    };
  }

  // low musi być najniższą ceną w świecy
  if (low > Math.min(open, close) + EPSILON) {
    return {
      valid: false,
      error: `Niespójność: Low (${low}) jest większy niż min(Open, Close) (${Math.min(open, close)}).`,
    };
  }

  const normalized: OHLCV = {
    timestamp: ts,
    open: Number(open.toFixed(4)),
    high: Number(high.toFixed(4)),
    low: Number(low.toFixed(4)),
    close: Number(close.toFixed(4)),
    volume: Math.round(volume),
    adjustedClose: adjustedClose !== undefined && !isNaN(adjustedClose) ? Number(adjustedClose.toFixed(4)) : undefined,
  };

  return { valid: true, candle: normalized };
}

/**
 * Filtruje i waliduje tablicę świec, usuwając duplikaty i sortując chronologicznie.
 */
export function validateAndDeduplicateCandles(rawCandles: unknown[]): OHLCV[] {
  if (!Array.isArray(rawCandles)) return [];

  const validCandles: OHLCV[] = [];
  const seenTimestamps = new Set<number>();

  for (const raw of rawCandles) {
    const result = validateAndNormalizeCandle(raw);
    if (result.valid && result.candle) {
      const timeKey = result.candle.timestamp.getTime();
      if (!seenTimestamps.has(timeKey)) {
        seenTimestamps.add(timeKey);
        validCandles.push(result.candle);
      }
    }
  }

  // Sortowanie rosnąco według czasu
  return validCandles.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}
