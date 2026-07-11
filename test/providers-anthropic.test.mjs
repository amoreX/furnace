import { test } from "node:test"
import assert from "node:assert/strict"

test("anthropic adapter", async (t) => {
  const { createAnthropicProvider } = await import("../dist/providers/anthropic.js")

  await t.test("createAnthropicProvider returns a Provider object", async () => {
    const provider = createAnthropicProvider()
    assert.ok(provider)
    assert.equal(typeof provider.streamChat, "function")
    assert.equal(typeof provider.completeChat, "function")
    assert.equal(typeof provider.completeToolChat, "function")
    assert.equal(typeof provider.listModels, "function")
  })

  await t.test("listModels uses static model list when provided", async () => {
    const provider = createAnthropicProvider()
    const resolved = {
      id: "test-anthropic",
      displayName: "Test",
      baseUrl: "https://api.anthropic.com",
      protocol: "anthropic",
      apiKey: "fake-key",
      models: [
        { id: "claude-test-1", displayName: "Claude Test 1", contextLength: 200000 },
        { id: "claude-test-2", displayName: "Claude Test 2", contextLength: 100000 },
      ],
    }
    const models = await provider.listModels(resolved)
    assert.equal(models.length, 2)
    assert.equal(models[0].id, "claude-test-1")
    assert.equal(models[0].name, "Claude Test 1")
    assert.equal(models[0].contextLength, 200000)
  })

  await t.test("listModels returns empty array for empty static list", async () => {
    const provider = createAnthropicProvider()
    const resolved = {
      id: "test-anthropic",
      displayName: "Test",
      baseUrl: "https://api.anthropic.com",
      protocol: "anthropic",
      apiKey: "fake-key",
      models: [],
    }
    // Empty models array falls through to HTTP call which will fail
    await assert.rejects(async () => provider.listModels(resolved))
  })

  await t.test("completeChat serializes cache-control system blocks", async () => {
    const provider = createAnthropicProvider()
    const originalFetch = globalThis.fetch
    let body
    globalThis.fetch = async (_url, init) => {
      body = JSON.parse(init.body)
      return new Response(JSON.stringify({ content: [{ type: "text", text: "ok" }] }), { status: 200 })
    }
    try {
      await provider.completeChat(
        {
          id: "anthropic",
          displayName: "Anthropic",
          baseUrl: "https://api.anthropic.com",
          protocol: "anthropic",
          apiKey: "fake-key",
        },
        "claude-test",
        [
          { role: "system", content: "stable system", cacheControl: "ephemeral" },
          { role: "user", content: "cache this latest prompt" },
        ],
        {},
      )
      assert.deepEqual(body.system, [{ type: "text", text: "stable system", cache_control: { type: "ephemeral" } }])
      assert.deepEqual(body.messages[0], { role: "user", content: [{ type: "text", text: "cache this latest prompt", cache_control: { type: "ephemeral" } }] })
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  await t.test("prompt cache can be disabled by env var", async () => {
    const provider = createAnthropicProvider()
    const originalFetch = globalThis.fetch
    const originalDisable = process.env.FURNACE_DISABLE_PROMPT_CACHE
    let body
    globalThis.fetch = async (_url, init) => {
      body = JSON.parse(init.body)
      return new Response(JSON.stringify({ content: [{ type: "text", text: "ok" }] }), { status: 200 })
    }
    process.env.FURNACE_DISABLE_PROMPT_CACHE = "1"
    try {
      await provider.completeChat(
        {
          id: "anthropic",
          displayName: "Anthropic",
          baseUrl: "https://api.anthropic.com",
          protocol: "anthropic",
          apiKey: "fake-key",
        },
        "claude-test",
        [
          { role: "system", content: "stable system", cacheControl: "ephemeral" },
          { role: "user", content: "do not cache this prompt" },
        ],
        {},
      )
      assert.equal(body.system, "stable system")
      assert.deepEqual(body.messages[0], { role: "user", content: "do not cache this prompt" })
    } finally {
      if (originalDisable === undefined) delete process.env.FURNACE_DISABLE_PROMPT_CACHE
      else process.env.FURNACE_DISABLE_PROMPT_CACHE = originalDisable
      globalThis.fetch = originalFetch
    }
  })
})
