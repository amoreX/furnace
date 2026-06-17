import type { FurnaceConfig } from "./config.js"

export type OpenRouterMessage = {
  role: "system" | "user" | "assistant"
  content: string
}

type ChatCompletionChunk = {
  choices?: Array<{
    delta?: {
      content?: string
    }
    finish_reason?: string | null
  }>
  error?: {
    message?: string
  }
}

export async function* streamOpenRouterResponse(
  config: FurnaceConfig,
  messages: OpenRouterMessage[],
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    signal,
    headers: {
      Authorization: `Bearer ${config.openRouterApiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": config.siteUrl,
      "X-Title": config.appName,
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      stream: true,
    }),
  })

  if (!response.ok || !response.body) {
    const body = await response.text().catch(() => "")
    throw new Error(`OpenRouter request failed (${response.status}): ${body || response.statusText}`)
  }

  const decoder = new TextDecoder()
  let buffer = ""

  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true })

    const lines = buffer.split("\n")
    buffer = lines.pop() || ""

    for (const rawLine of lines) {
      const line = rawLine.trim()

      if (!line || line.startsWith(":")) continue
      if (!line.startsWith("data:")) continue

      const data = line.slice("data:".length).trim()
      if (data === "[DONE]") return

      const parsed = parseChunk(data)
      if (parsed.error?.message) throw new Error(parsed.error.message)

      const content = parsed.choices?.[0]?.delta?.content
      if (content) yield content
    }
  }
}

function parseChunk(data: string): ChatCompletionChunk {
  try {
    return JSON.parse(data) as ChatCompletionChunk
  } catch {
    throw new Error(`OpenRouter returned an invalid stream chunk: ${data}`)
  }
}
