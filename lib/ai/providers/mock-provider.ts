import { ArticleAnalysisInput, IAIProvider, NewsAnalysisResult, NewsAnalysisSchema } from "../types";

export class MockAIProvider implements IAIProvider {
  readonly name = "mock";
  readonly model: string;

  constructor(model = "mock-model-v1") {
    this.model = model;
  }

  async analyzeNewsArticle(input: ArticleAnalysisInput): Promise<NewsAnalysisResult> {
    const text = `${input.title} ${input.content}`.toLowerCase();

    // 1. Prosta heurystyka sentymentu
    let sentimentScore = 0.0;
    if (text.includes("surge") || text.includes("beat") || text.includes("growth") || text.includes("rally") || text.includes("record")) {
      sentimentScore += 0.65;
    }
    if (text.includes("drop") || text.includes("fall") || text.includes("plunge") || text.includes("miss") || text.includes("crisis") || text.includes("war")) {
      sentimentScore -= 0.7;
    }
    sentimentScore = Math.max(-1, Math.min(1, sentimentScore));

    // 2. Ekstrakcja popularnych tickerów
    const candidateTickers = ["AAPL", "MSFT", "NVDA", "TSLA", "AMZN", "GOOGL", "META", "SPY", "QQQ", "GLD", "USO"];
    const foundTickers: string[] = [];
    const tickerRelevance: Record<string, number> = {};

    for (const ticker of candidateTickers) {
      if (text.includes(ticker.toLowerCase()) || text.includes(`$${ticker.toLowerCase()}`)) {
        foundTickers.push(ticker);
        tickerRelevance[ticker] = 0.85;
      }
    }

    // Dodatkowe mapowanie nazw spółek na tickery
    if (text.includes("apple") && !foundTickers.includes("AAPL")) {
      foundTickers.push("AAPL");
      tickerRelevance["AAPL"] = 0.9;
    }
    if (text.includes("microsoft") && !foundTickers.includes("MSFT")) {
      foundTickers.push("MSFT");
      tickerRelevance["MSFT"] = 0.9;
    }
    if (text.includes("nvidia") && !foundTickers.includes("NVDA")) {
      foundTickers.push("NVDA");
      tickerRelevance["NVDA"] = 0.95;
    }
    if (text.includes("tesla") && !foundTickers.includes("TSLA")) {
      foundTickers.push("TSLA");
      tickerRelevance["TSLA"] = 0.9;
    }

    // 3. Typ zdarzenia
    let eventType: "MACRO" | "GEOPOLITIC" | "EARNINGS" | "CENTRAL_BANK" | "TRADE_RESTRICTION" | "COMMODITY_SHOCK" = "MACRO";
    if (text.includes("earnings") || text.includes("revenue") || text.includes("quarterly") || text.includes("eps")) {
      eventType = "EARNINGS";
    } else if (text.includes("fed") || text.includes("powell") || text.includes("interest rate") || text.includes("ecb") || text.includes("nbp")) {
      eventType = "CENTRAL_BANK";
    } else if (text.includes("war") || text.includes("sanction") || text.includes("conflict") || text.includes("geopolit")) {
      eventType = "GEOPOLITIC";
    } else if (text.includes("oil") || text.includes("opec") || text.includes("gold") || text.includes("gas")) {
      eventType = "COMMODITY_SHOCK";
    } else if (text.includes("tariff") || text.includes("trade war") || text.includes("embargo")) {
      eventType = "TRADE_RESTRICTION";
    }

    // 4. Dotkliwość
    let severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" = "MEDIUM";
    if (Math.abs(sentimentScore) > 0.6 || eventType === "GEOPOLITIC" || eventType === "CENTRAL_BANK") {
      severity = "HIGH";
    }

    const rawResult: NewsAnalysisResult = {
      sentimentScore: Number(sentimentScore.toFixed(2)),
      summary: `Automatyczna analiza artykułu "${input.title}". Wydarzenie zaklasyfikowane jako ${eventType} o wadze ${severity}.`,
      mentionedTickers: foundTickers,
      eventType,
      severity,
      economicConsequences: `Wpływ na wyceny rynkowe w horyzoncie krótkoterminowym dla instrumentów: ${foundTickers.join(", ") || "szerokiego rynku"}.`,
      confidence: 0.85,
      tickerRelevance,
    };

    // Zawsze walidujemy Zod Schema przed zwrotem
    return NewsAnalysisSchema.parse(rawResult);
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }
}
