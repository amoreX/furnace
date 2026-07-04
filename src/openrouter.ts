import type { FurnaceConfig } from "./config.js"
import { createOpenAICompatibleProvider } from "./providers/openai-compatible.js"
import type { ResolvedProvider, ChatMessage, ToolDefinition, ToolChoice, ModelInfo, AssistantResponse } from "./providers/types.js"

// Re-export types for backward compatibility
export type ContentBlock = import("./providers/types.js").ContentBlock
export type OpenRouterMessage = ChatMessage
export type OpenRouterToolDefinition = ToolDefinition
export type OpenRouterToolCall = import("./providers/types.js").ChatToolCall
export type OpenRouterAssistantResponse = AssistantResponse
export type OpenRouterToolChoice = ToolChoice
export type OpenRouterModel = ModelInfo
export type OpenRouterModelPricing = { completion: number; prompt: number }
export type OpenRouterUsage = import("./providers/types.js").Usage

const adapter = createOpenAICompatibleProvider()

function toResolvedProvider(config: FurnaceConfig): ResolvedProvider {
  return {
    id: "openrouter",
    displayName: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    protocol: "openai-compatible",
    apiKey: config.apiKey,
    siteUrl: config.siteUrl,
    appName: config.appName,
  }
}

export async function* streamOpenRouterResponse(
  config: FurnaceConfig,
  messages: ChatMessage[],
  signal?: AbortSignal,
): AsyncGenerator<string> {
  yield* adapter.streamChat(toResolvedProvider(config), config.model, messages, config.modelSettings, signal)
}

export async function completeOpenRouterResponse(
  config: FurnaceConfig,
  messages: ChatMessage[],
  options: { model?: string; maxTokens?: number } = {},
): Promise<string> {
  return adapter.completeChat(
    toResolvedProvider(config),
    options.model || config.model,
    messages,
    config.modelSettings,
    { maxTokens: options.maxTokens },
  )
}

export async function completeOpenRouterToolResponse(
  config: FurnaceConfig,
  messages: ChatMessage[],
  tools: ToolDefinition[],
  options: { toolChoice?: ToolChoice; onTextDelta?: (delta: string) => void } = {},
  signal?: AbortSignal,
): Promise<AssistantResponse> {
  return adapter.completeToolChat(
    toResolvedProvider(config),
    config.model,
    messages,
    tools,
    config.modelSettings,
    options,
    signal,
  )
}

export async function listOpenRouterModels(config: FurnaceConfig): Promise<ModelInfo[]> {
  return adapter.listModels(toResolvedProvider(config))
}

export function isContextOverflowError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /\b(context|token|tokens|input)\b.*\b(length|limit|window|maximum|too large|too long|exceed)/i.test(message)
    || /\b(maximum context|context_length|context window|too many tokens|input is too long|prompt is too long)\b/i.test(message)
}
