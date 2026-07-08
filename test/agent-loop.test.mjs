import assert from "node:assert/strict"
import { test } from "node:test"
import { runAgentTurn, shouldForceWebSearch } from "../dist/agent/loop.js"

test("current information prompts force websearch", () => {
  assert.equal(shouldForceWebSearch([{ role: "user", content: "latest FIFA news" }]), true)
  assert.equal(shouldForceWebSearch([{ role: "user", content: "what is the current Node.js release?" }]), true)
})

test("local repo prompts do not force websearch", () => {
  assert.equal(shouldForceWebSearch([{ role: "user", content: "latest changes in this repo" }]), false)
  assert.equal(shouldForceWebSearch([{ role: "user", content: "current git status" }]), false)
})

test("runtime context messages do not force websearch by themselves", () => {
  assert.equal(shouldForceWebSearch([{ role: "user", content: "<runtime_context>\nlatest, current, recent, today, and now\n</runtime_context>" }]), false)
})

test("agent turn compacts and retries once after context overflow", async () => {
  const originalFetch = globalThis.fetch
  let calls = 0
  let recovered = 0

  try {
    globalThis.fetch = async () => {
      calls += 1
      if (calls === 1) {
        return {
          ok: false,
          status: 400,
          statusText: "Bad Request",
          async text() {
            return "maximum context length exceeded"
          },
        }
      }
      const sseData = 'data: {"choices":[{"delta":{"content":"done"},"finish_reason":null}]}\ndata: [DONE]\n'
      let consumed = false
      return {
        ok: true,
        body: {
          getReader() {
            return {
              read() {
                if (consumed) return Promise.resolve({ done: true, value: undefined })
                consumed = true
                return Promise.resolve({ done: false, value: new TextEncoder().encode(sseData) })
              },
              releaseLock() {},
            }
          },
        },
      }
    }

    const result = await runAgentTurn({
      config: fakeConfig(),
      cwd: "/tmp/furnace",
      messages: [{ role: "user", content: "hello" }],
      onContextOverflow: async () => {
        recovered += 1
        return [{ role: "user", content: "compacted hello" }]
      },
      tools: [],
    })

    assert.equal(result.content, "done")
    assert.equal(calls, 2)
    assert.equal(recovered, 1)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("agent turn stops immediately when a task group is backgrounded", async () => {
  const originalFetch = globalThis.fetch
  let calls = 0
  const toolResults = []

  try {
    globalThis.fetch = async () => {
      calls += 1
      const chunks = [
        { choices: [{ delta: { tool_calls: [{ index: 0, id: "call_task", type: "function", function: { name: "task", arguments: "" } }] }, finish_reason: null }] },
        { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: JSON.stringify({ prompt: "Research in background", background: true }) } }] }, finish_reason: null }] },
        { usage: { prompt_tokens: 10, completion_tokens: 2 }, choices: [{ delta: {}, finish_reason: "tool_calls" }] },
      ]
      const sseData = chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n`).join("") + "data: [DONE]\n"
      let consumed = false
      return {
        ok: true,
        body: {
          getReader() {
            return {
              read() {
                if (consumed) return Promise.resolve({ done: true, value: undefined })
                consumed = true
                return Promise.resolve({ done: false, value: new TextEncoder().encode(sseData) })
              },
              releaseLock() {},
            }
          },
        },
      }
    }

    const taskRunner = {
      promoteActiveGroup() {
        return false
      },
      status() {
        return { parentSessionId: "parent", tasks: [] }
      },
      async runTasks(input) {
        return {
          backgrounded: true,
          groupId: "group_bg",
          tasks: input.tasks.map((task, index) => ({
            background: true,
            childSessionId: `child_${index + 1}`,
            description: task.description || task.prompt,
            id: `task_${index + 1}`,
            parentSessionId: input.parentSessionId,
            prompt: task.prompt,
            startedAt: 10,
            status: "backgrounded",
          })),
        }
      },
    }

    const result = await runAgentTurn({
      config: fakeConfig(),
      cwd: "/tmp/furnace",
      messages: [{ role: "user", content: "delegate" }],
      onToolResult: (_call, content) => toolResults.push(content),
      sessionId: "parent",
      taskRunner,
    })

    assert.equal(calls, 1)
    assert.equal(result.backgrounded, true)
    assert.equal(result.content, "Subagents are running in the background. I'll continue when they finish.")
    assert.equal(result.usage.promptTokens, 10)
    assert.match(toolResults[0], /Task group group_bg backgrounded\./)
  } finally {
    globalThis.fetch = originalFetch
  }
})

function fakeConfig() {
  return {
    appName: "Furnace Test",
    model: "test-model",
    modelSettings: {},
    provider: "openrouter",
    apiKey: "test-key",
    openRouterApiKey: "test-key",
    providerConfig: {
      id: "openrouter",
      displayName: "OpenRouter",
      baseUrl: "https://openrouter.ai/api/v1",
      protocol: "openai-compatible",
      apiKey: "test-key",
      siteUrl: "http://localhost",
      appName: "Furnace Test",
    },
    siteUrl: "http://localhost",
    skillPaths: [],
    subagentSystemPrompt: "subagent",
    systemPrompt: "system",
    theme: "flexoki",
    titleModel: "title-model",
    titleSystemPrompt: "title",
  }
}
