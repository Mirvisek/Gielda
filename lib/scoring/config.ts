/**
 * KONFIGURACJA WAG I PROGÓW SCORINGOWYCH (ETAP 7)
 * Wszystkie wagi są wyodrębnione i konfigurowalne, nie zaszyte w komponentach.
 */

export const SCORING_WEIGHTS = {
  TECHNICAL: 0.25,     // 25% — RSI(14), relacje średnich kroczących (SMA20, SMA50)
  NEWS: 0.20,          // 20% — Sentyment klastrów informacyjnych z wagą źródeł
  MOMENTUM: 0.15,      // 15% — Krótko- i średnioterminowe stopy zwrotu (1d, 5d, 20d)
  VOLUME: 0.10,        // 10% — Wolumen vs 20d SMA i dynamika wolumenu
  EVENT_IMPACT: 0.15,  // 15% — Zdarzenia makroekonomiczne, banki centralne, wyniki
  MARKET_REGIME: 0.15, // 15% — Długoterminowy reżim trendu (SMA200, 60d return)
} as const;

export const SCORING_THRESHOLDS = {
  // Progi generowania pozytywnego sygnału wzrostowego
  BULLISH_OPPORTUNITY_MIN: 65,
  BULLISH_RISK_MAX: 55,
  BULLISH_CONFIDENCE_MIN: 60,

  // Progi generowania sygnału negatywnego / ostrzegawczego
  BEARISH_OPPORTUNITY_MIN: 65, // Duża siła setupu spadkowego (Short Opportunity)
  BEARISH_RISK_MIN: 65,        // Wysokie ryzyko załamania

  // Minimalny próg pewności — poniżej tego progu zawsze INSUFFICIENT_CONFIDENCE
  MIN_CONFIDENCE_FOR_SIGNAL: 50,

  // Maksymalna dopuszczalna rozbieżność między czynnikami technicznymi a sentymentem
  // Powyżej tego progu czynniki uznaje się za sprzeczne -> NO_CLEAR_SIGNAL
  DIVERGENCE_TOLERANCE: 0.6,
} as const;
