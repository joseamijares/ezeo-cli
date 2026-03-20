# Multi-Model Routing Implementation Brief

## Current State
- `agent.ts` uses `claude-opus-4-6` via `@anthropic-ai/sdk` (expensive!)
- `chat.ts` uses keyword-based router (`router.ts`) with NO LLM
- Only AI dependency: `@anthropic-ai/sdk`

## Goal
Implement multi-model routing where different commands use different LLM providers.

## Architecture

### New file: `src/lib/models.ts`
Central model configuration and client factory.

```typescript
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
    model: 'gemini-2.5-flash',  // Use 2.5 Flash for now (free tier available), upgrade to 3.1 Flash-Lite when stable
    apiKeyEnv: 'GEMINI_API_KEY',
    maxTokens: 256,
    description: 'Intent classification and routing',
  },
  analyst: {
    role: 'analyst',
    provider: 'openai-compatible',
    model: 'qwen3.5-397b',
    baseUrl: 'https://api.together.xyz/v1',  // or dashscope
    apiKeyEnv: 'TOGETHER_API_KEY',
    maxTokens: 4096,
    description: 'Deep SEO/GEO analysis and reasoning',
  },
  writer: {
    role: 'writer',
    provider: 'openai-compatible',
    model: 'kimi-k2.5',
    baseUrl: 'https://api.moonshot.ai/v1',
    apiKeyEnv: 'MOONSHOT_API_KEY',
    maxTokens: 4096,
    description: 'Content generation, articles, copy',
  },
  agent: {
    role: 'agent',
    provider: 'openai-compatible',
    model: 'MiniMax-M2.7',
    baseUrl: 'https://api.minimax.chat/v1',
    apiKeyEnv: 'MINIMAX_API_KEY',
    maxTokens: 4096,
    description: 'Multi-step tool chaining and complex tasks',
  },
  batch: {
    role: 'batch',
    provider: 'openai-compatible',
    model: 'MiniMax-M2.5',
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
```

### Key Design Decisions

1. **Use OpenAI-compatible API format** for MiniMax, Kimi, Qwen — they all support it. This means we only need TWO SDKs:
   - `@google/generative-ai` for Gemini
   - `openai` package for everything else (MiniMax, Kimi, Qwen all expose OpenAI-compatible endpoints)
   - Keep `@anthropic-ai/sdk` as fallback for Sonnet escalation

2. **Fallback chain**: If primary model fails, escalate:
   - Router: Gemini Flash → fallback to keyword router (existing `router.ts`)
   - Agent: M2.7 → Sonnet 4.6
   - Analyst: Qwen 3.5 → Gemini Flash
   - Writer: Kimi K2.5 → Gemini Flash

3. **Config via `~/.ezeo/.env`**:
   ```
   GEMINI_API_KEY=xxx
   MINIMAX_API_KEY=xxx
   MOONSHOT_API_KEY=xxx
   TOGETHER_API_KEY=xxx
   ANTHROPIC_API_KEY=xxx  (optional, for Sonnet fallback)
   ```

4. **`ezeo doctor`** should check which API keys are configured and warn about missing ones.

## Files to Create/Modify

### New Files
- `src/lib/models.ts` — Model configs, client factory, completion wrapper
- `src/lib/providers/gemini.ts` — Gemini API wrapper
- `src/lib/providers/openai-compat.ts` — OpenAI-compatible wrapper (MiniMax, Kimi, Qwen)
- `src/lib/providers/anthropic.ts` — Anthropic wrapper (extract from agent.ts)
- `src/lib/llm-router.ts` — LLM-based intent classification (enhances existing router.ts)

### Modified Files
- `src/commands/agent.ts` — Switch from Opus to M2.7, add Sonnet fallback
- `src/commands/chat.ts` — Add LLM fallback when keyword router returns "unknown"
- `src/commands/content.ts` — Use Kimi K2.5 for content generation
- `src/lib/config.ts` — Add model config loading from .env
- `src/commands/doctor.ts` — Add API key checks for all providers

### Tests to Add
- `tests/models.test.ts` — Config validation
- `tests/llm-router.test.ts` — LLM routing classification
- `tests/providers.test.ts` — Provider wrapper tests (mocked)

## Implementation Order
1. Create `src/lib/models.ts` with configs
2. Create provider wrappers (gemini, openai-compat, anthropic)
3. Create `src/lib/llm-router.ts`
4. Update `agent.ts` to use M2.7 with Sonnet fallback
5. Update `chat.ts` to use LLM router for unknown intents
6. Update `content.ts` to use Kimi
7. Update `doctor.ts` with API key checks
8. Add tests
9. Update README with multi-model setup docs

## CRITICAL
- Do NOT break existing functionality. All commands must still work with just ANTHROPIC_API_KEY.
- Missing API keys should gracefully degrade (use whatever is available).
- Keep the existing keyword router as first pass — LLM router only for "unknown" intents.
- All API calls should have timeout (10s for router, 60s for specialists).
- Run `npm test` before committing.
