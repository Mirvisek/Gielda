import { OHLCV, TechnicalIndicators } from "./types";

/**
 * Prosta średnia krocząca (SMA - Simple Moving Average).
 * Zwraca tablicę o tej samej długości co prices, gdzie elementy przed `period - 1` mają wartość null.
 */
export function calculateSMA(prices: number[], period: number): (number | null)[] {
  if (!prices || prices.length === 0 || period <= 0) return [];
  const result: (number | null)[] = new Array(prices.length).fill(null);

  if (prices.length < period) return result;

  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += prices[i];
  }
  result[period - 1] = Number((sum / period).toFixed(4));

  for (let i = period; i < prices.length; i++) {
    sum += prices[i] - prices[i - period];
    result[i] = Number((sum / period).toFixed(4));
  }

  return result;
}

/**
 * Wykładnicza średnia krocząca (EMA - Exponential Moving Average).
 * EMA_today = Price_today * alpha + EMA_prev * (1 - alpha), gdzie alpha = 2 / (period + 1).
 */
export function calculateEMA(prices: number[], period: number): (number | null)[] {
  if (!prices || prices.length === 0 || period <= 0) return [];
  const result: (number | null)[] = new Array(prices.length).fill(null);

  if (prices.length < period) return result;

  const alpha = 2 / (period + 1);

  // Pierwsza wartość EMA to SMA z pierwszego okna
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += prices[i];
  }
  let prevEma = sum / period;
  result[period - 1] = Number(prevEma.toFixed(4));

  for (let i = period; i < prices.length; i++) {
    const currentEma = prices[i] * alpha + prevEma * (1 - alpha);
    result[i] = Number(currentEma.toFixed(4));
    prevEma = currentEma;
  }

  return result;
}

/**
 * Wskaźnik siły względnej (RSI - Relative Strength Index) wg metody Wildera.
 * Domyślny okres = 14.
 */
export function calculateRSI(prices: number[], period: number = 14): (number | null)[] {
  if (!prices || prices.length <= period || period <= 0) {
    return new Array(prices ? prices.length : 0).fill(null);
  }

  const result: (number | null)[] = new Array(prices.length).fill(null);

  let gainSum = 0;
  let lossSum = 0;

  // Pierwszy okres: wyliczenie zmian
  for (let i = 1; i <= period; i++) {
    const change = prices[i] - prices[i - 1];
    if (change >= 0) {
      gainSum += change;
    } else {
      lossSum += Math.abs(change);
    }
  }

  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;

  if (avgLoss === 0) {
    result[period] = 100;
  } else if (avgGain === 0) {
    result[period] = 0;
  } else {
    const rs = avgGain / avgLoss;
    result[period] = Number((100 - 100 / (1 + rs)).toFixed(2));
  }

  // Wygładzanie metodą Wildera dla kolejnych świec
  for (let i = period + 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    const currentGain = change > 0 ? change : 0;
    const currentLoss = change < 0 ? Math.abs(change) : 0;

    avgGain = (avgGain * (period - 1) + currentGain) / period;
    avgLoss = (avgLoss * (period - 1) + currentLoss) / period;

    if (avgLoss === 0) {
      result[i] = 100;
    } else if (avgGain === 0) {
      result[i] = 0;
    } else {
      const rs = avgGain / avgLoss;
      result[i] = Number((100 - 100 / (1 + rs)).toFixed(2));
    }
  }

  return result;
}

/**
 * Średni zasięg rzeczywisty (ATR - Average True Range).
 * True Range = max(high - low, abs(high - prevClose), abs(low - prevClose)).
 */
export function calculateATR(candles: OHLCV[], period: number = 14): (number | null)[] {
  if (!candles || candles.length === 0 || period <= 0) return [];
  const result: (number | null)[] = new Array(candles.length).fill(null);

  if (candles.length < period) return result;

  const trueRanges: number[] = new Array(candles.length);
  trueRanges[0] = candles[0].high - candles[0].low;

  for (let i = 1; i < candles.length; i++) {
    const current = candles[i];
    const prevClose = candles[i - 1].close;
    const tr = Math.max(
      current.high - current.low,
      Math.abs(current.high - prevClose),
      Math.abs(current.low - prevClose)
    );
    trueRanges[i] = tr;
  }

  // Pierwszy ATR to średnia arytmetyczna z pierwszych 'period' True Ranges
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += trueRanges[i];
  }
  let prevAtr = sum / period;
  result[period - 1] = Number(prevAtr.toFixed(4));

  // Wygładzanie ATR metodą Wildera
  for (let i = period; i < candles.length; i++) {
    const currentAtr = (prevAtr * (period - 1) + trueRanges[i]) / period;
    result[i] = Number(currentAtr.toFixed(4));
    prevAtr = currentAtr;
  }

  return result;
}

/**
 * Wylicza stopy zwrotu za ostatnie 1d, 5d, 20d, 60d.
 */
export function calculateReturns(prices: number[]): {
  return1d: number | null;
  return5d: number | null;
  return20d: number | null;
  return60d: number | null;
} {
  const n = prices.length;
  if (n < 2) {
    return { return1d: null, return5d: null, return20d: null, return60d: null };
  }

  const current = prices[n - 1];

  const calc = (daysBack: number): number | null => {
    if (n <= daysBack) return null;
    const base = prices[n - 1 - daysBack];
    if (base <= 0) return null;
    return Number((((current - base) / base) * 100).toFixed(2));
  };

  return {
    return1d: calc(1),
    return5d: calc(5),
    return20d: calc(20),
    return60d: calc(60),
  };
}

/**
 * Wylicza metryki wolumenu (zmiana % oraz ratio względem 20-dniowej średniej).
 */
export function calculateVolumeMetrics(candles: OHLCV[]): {
  volumeChangePercent: number | null;
  volumeRatio20d: number | null;
} {
  const n = candles.length;
  if (n < 2) return { volumeChangePercent: null, volumeRatio20d: null };

  const currentVol = candles[n - 1].volume;
  const prevVol = candles[n - 2].volume;

  let volumeChangePercent: number | null = null;
  if (prevVol > 0) {
    volumeChangePercent = Number((((currentVol - prevVol) / prevVol) * 100).toFixed(2));
  }

  let volumeRatio20d: number | null = null;
  if (n >= 20) {
    let sum = 0;
    for (let i = n - 20; i < n; i++) {
      sum += candles[i].volume;
    }
    const avg20 = sum / 20;
    if (avg20 > 0) {
      volumeRatio20d = Number((currentVol / avg20).toFixed(2));
    }
  }

  return { volumeChangePercent, volumeRatio20d };
}

/**
 * Zbiorcze wyliczenie wszystkich wskaźników technicznych dla zadanego zestawu świec OHLCV.
 */
export function calculateAllTechnicalIndicators(candles: OHLCV[]): TechnicalIndicators {
  if (!candles || candles.length === 0) {
    return {
      currentPrice: 0,
      sma20: null,
      sma50: null,
      sma200: null,
      ema20: null,
      rsi14: null,
      atr14: null,
      return1d: null,
      return5d: null,
      return20d: null,
      return60d: null,
      volumeChangePercent: null,
      volumeRatio20d: null,
    };
  }

  const closes = candles.map((c) => c.close);
  const lastIndex = closes.length - 1;
  const currentPrice = closes[lastIndex];

  const sma20Series = calculateSMA(closes, 20);
  const sma50Series = calculateSMA(closes, 50);
  const sma200Series = calculateSMA(closes, 200);
  const ema20Series = calculateEMA(closes, 20);
  const rsiSeries = calculateRSI(closes, 14);
  const atrSeries = calculateATR(candles, 14);

  const returns = calculateReturns(closes);
  const volumeMetrics = calculateVolumeMetrics(candles);

  return {
    currentPrice,
    sma20: sma20Series[lastIndex] ?? null,
    sma50: sma50Series[lastIndex] ?? null,
    sma200: sma200Series[lastIndex] ?? null,
    ema20: ema20Series[lastIndex] ?? null,
    rsi14: rsiSeries[lastIndex] ?? null,
    atr14: atrSeries[lastIndex] ?? null,
    ...returns,
    ...volumeMetrics,
  };
}
