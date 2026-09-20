/**
 * Konfiguracja modułu Portfela Inwestycyjnego
 */

/**
 * Próg koncentracji pozycji (15% wartości portfela).
 * Pozycja przekraczająca ten udział z wysokim wskaźnikiem ryzyka wyzwala ostrzeżenie.
 */
export const PORTFOLIO_CONCENTRATION_THRESHOLD = 0.15;

/**
 * Próg wysokiego ryzyka pojedynczego aktywa (Risk Score >= 70 w skali 0-100).
 */
export const PORTFOLIO_HIGH_RISK_THRESHOLD = 70;
