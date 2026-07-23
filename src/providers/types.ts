import type { ModelSettings } from "../preferences.js"
import type { TokenPricing } from "../session/usage-cost.js"

export type Protocol = "openai-compatible" | "anthropic"

export type ContentBlock =
  | { type: "text"; text: string; cache_control?: { type: "ephemeral" } }
  | { type: "image_url"; image_url: { url: string } }

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool"
  content: string | ContentBlock[] | null
  cacheControl?: "ephemeral"
  name?: string
  tool_call_id?: string
  tool_calls?: ChatToolCall[]
}

export type ChatToolCall = {
  id: string
  type: "function"
  function: {
    name: string
    arguments: string
  }
}

export type ToolDefinition = {
  type: "function"
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export type ToolChoice =
  | "auto"
  | { type: "function"; function: { name: string } }

export type ModelInfo = {
  id: string
  name: string
  contextLength: number | null
  supportedParameters: string[]
  pricing?: TokenPricing
}

export type Usage = {
  cacheReadTokens?: number
  cacheWriteTokens?: number
  completionTokens: number
  costUsd?: number
  promptTokens: number
}

export type AssistantResponse = {
  content: string
  toolCalls: ChatToolCall[]
  usage?: Usage
}

export type StaticModelDef = {
  id: string
  displayName?: string
  contextLength?: number
  pricing?: TokenPricing
}

export type ProviderDefinition = {
  id: string
  displayName: string
  baseUrl: string
  protocol: Protocol
  envVar?: string
  defaultModel?: string
  models?: StaticModelDef[]
}

export type ResolvedProvider = ProviderDefinition & {
  apiKey: string
  siteUrl?: string
  appName?: string
}

export type Provider = {
  streamChat(
    provider: ResolvedProvider,
    model: string,
    messages: ChatMessage[],
    settings: ModelSettings,
    signal?: AbortSignal,
  ): AsyncGenerator<string>

  completeChat(
    provider: ResolvedProvider,
    model: string,
    messages: ChatMessage[],
    settings: ModelSettings,
    options?: { maxTokens?: number },
  ): Promise<string>

  completeToolChat(
    provider: ResolvedProvider,
    model: string,
    messages: ChatMessage[],
    tools: ToolDefinition[],
    settings: ModelSettings,
    options?: { maxTokens?: number; toolChoice?: ToolChoice; onTextDelta?: (delta: string) => void },
    signal?: AbortSignal,
  ): Promise<AssistantResponse>

  listModels(provider: ResolvedProvider): Promise<ModelInfo[]>
}

export type CustomProvider = ProviderDefinition & {
  apiKey?: string
}
