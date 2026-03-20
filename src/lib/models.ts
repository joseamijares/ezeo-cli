/**
 * Central model configuration for Ezeo CLI multi-model routing.
 * Each command role maps to a specific provider/model.
 * All models degrade gracefully — ANTHROPIC_API_KEY is the only required key.
 */

export type ModelRole = 'router' | 'analyst' | 'writer' | 'agent' | 'batch' | 'chat';

export interface ModelConfig {
  role: ModelRole;
  provider: 'google' | 'anthropic' | 'openai-compatible';
  model: string;
  baseUrl?: string;
  apiKeyEnv: string;
  maxTokens: number;
  description: string;
}

export const MODEL_CONFIGS: Record<ModelRole, ModelConfig> = {
  router: {
    role: 'router',
    provider: 'google',
    // Gemini 2.5 Flash for fast, cheap intent classification
    model: 'gemini-2.5-flash',
    apiKeyEnv: 'GEMINI_API_KEY',
    maxTokens: 256,
    description: 'Intent classification and routing',
  },
  analyst: {
    role: 'analyst',
    provider: 'openai-compatible',
    model: 'Qwen/Qwen3-235B-A22B',
    baseUrl: 'https://api.together.xyz/v1',
    apiKeyEnv: 'TOGETHER_API_KEY',
    maxTokens: 4096,
    description: 'Deep SEO/GEO analysis and reasoning',
  },
  writer: {
    role: 'writer',
    provider: 'openai-compatible',
    model: 'kimi-k2',
    baseUrl: 'https://api.moonshot.ai/v1',
    apiKeyEnv: 'MOONSHOT_API_KEY',
    maxTokens: 8192,
    description: 'Content generation, articles, copy',
  },
  agent: {
    role: 'agent',
    provider: 'openai-compatible',
    model: 'MiniMax-M1',
    baseUrl: 'https://api.minimax.chat/v1',
    apiKeyEnv: 'MINIMAX_API_KEY',
    maxTokens: 4096,
    description: 'Multi-step tool chaining and complex tasks',
  },
  batch: {
    role: 'batch',
    provider: 'openai-compatible',
    model: 'MiniMax-M1',
    baseUrl: 'https://api.minimax.chat/v1',
    apiKeyEnv: 'MINIMAX_API_KEY',
    maxTokens: 4096,
    description: 'Structured output, JSON, schemas',
  },
  chat: {
    role: 'chat',
    provider: 'google',
    model: 'gemini-2.5-flash',
    apiKeyEnv: 'GEMINI_API_KEY',
    maxTokens: 2048,
    description: 'Interactive conversational chat',
  },
};

/** Anthropic fallback config (used when primary provider is unavailable). */
export const ANTHROPIC_FALLBACK: ModelConfig = {
  role: 'agent',
  provider: 'anthropic',
  model: 'claude-sonnet-4-6',
  apiKeyEnv: 'ANTHROPIC_API_KEY',
  maxTokens: 4096,
  description: 'Fallback — Anthropic Claude Sonnet',
};

/** Get the API key for a model config from environment variables. */
export function getApiKey(cfg: ModelConfig): string | undefined {
  return process.env[cfg.apiKeyEnv];
}

/** Check whether a model's required API key is configured. */
export function isAvailable(cfg: ModelConfig): boolean {
  return !!getApiKey(cfg);
}

/**
 * Resolve the first available config from an ordered list of roles.
 * Returns null if none of the requested roles have API keys set.
 */
export function resolveFirstAvailable(roles: ModelRole[]): ModelConfig | null {
  for (const role of roles) {
    const cfg = MODEL_CONFIGS[role];
    if (isAvailable(cfg)) return cfg;
  }
  return null;
}

/** Summary of which API keys are configured (for `ezeo doctor`). */
export interface ModelAvailability {
  role: ModelRole;
  model: string;
  provider: string;
  apiKeyEnv: string;
  available: boolean;
  description: string;
}

export function getModelAvailability(): ModelAvailability[] {
  return (Object.values(MODEL_CONFIGS) as ModelConfig[]).map((cfg) => ({
    role: cfg.role,
    model: cfg.model,
    provider: cfg.provider,
    apiKeyEnv: cfg.apiKeyEnv,
    available: isAvailable(cfg),
    description: cfg.description,
  }));
}
