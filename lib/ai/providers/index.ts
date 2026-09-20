import { IAIProvider } from "../types";
import { OpenAIProvider } from "./openai-provider";
import { GeminiProvider } from "./gemini-provider";
import { ClaudeProvider } from "./claude-provider";
import { MockAIProvider } from "./mock-provider";

let cachedProvider: IAIProvider | null = null;

export function getAIProvider(overrideProvider?: string, overrideModel?: string): IAIProvider {
  if (overrideProvider) {
    return createProvider(overrideProvider, overrideModel);
  }

  if (cachedProvider) {
    return cachedProvider;
  }

  const providerName = (process.env.AI_PROVIDER || "").toLowerCase().trim();
  const modelName = process.env.AI_MODEL;

  cachedProvider = createProvider(providerName, modelName);
  return cachedProvider;
}

function createProvider(name: string, model?: string): IAIProvider {
  switch (name) {
    case "openai":
      return new OpenAIProvider(model);
    case "gemini":
    case "google":
      return new GeminiProvider(model);
    case "claude":
    case "anthropic":
      return new ClaudeProvider(model);
    case "mock":
    case "test":
      return new MockAIProvider(model);
    default:
      // Jeśli w środowisku jest klucz OpenAI, użyj OpenAI; w przeciwnym razie Mock dla bezpieczeństwa
      if (process.env.OPENAI_API_KEY) {
        return new OpenAIProvider(model);
      }
      if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) {
        return new GeminiProvider(model);
      }
      if (process.env.ANTHROPIC_API_KEY) {
        return new ClaudeProvider(model);
      }
      return new MockAIProvider(model);
  }
}

/**
 * Umożliwia zresetowanie instancji (np. na potrzeby testów z inną konfiguracją).
 */
export function resetAIProvider(): void {
  cachedProvider = null;
}
