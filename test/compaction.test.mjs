import assert from "node:assert/strict"
import { test } from "node:test"
import { estimateRequestTokens, findKeepStart, shouldCompactTokenEstimate } from "../dist/session/compaction.js"

test("threshold compaction leaves reserve tokens", () => {
  assert.equal(shouldCompactTokenEstimate(83_999, { contextWindow: 100_000, enabled: true, keepRecentTokens: 20_000, reserveTokens: 16_000 }), false)
  assert.equal(shouldCompactTokenEstimate(84_000, { contextWindow: 100_000, enabled: true, keepRecentTokens: 20_000, reserveTokens: 16_000 }), true)
})

test("keep-start selection protects latest user and does not split before a tool result", () => {
  const entries = [
    entry("entry-1", "message", "user", { content: "old request " + "x".repeat(200) }),
    entry("entry-2", "tool_call", "assistant", { arguments: "{\"path\":\"notes.txt\"}", name: "read", toolCallId: "call_1" }),
    entry("entry-3", "tool_result", "tool", { content: "1|hello " + "x".repeat(300), name: "read", toolCallId: "call_1" }),
  ]

  assert.equal(findKeepStart(entries, { keepRecentTokens: 80 }), 0)
})

test("request estimates count image input independently of base64 size", () => {
  const messageWithImage = (data) => [{
    role: "user",
    content: [
      { type: "text", text: "inspect this image" },
      { type: "image_url", image_url: { url: `data:image/png;base64,${data}` } },
    ],
  }]
  const small = estimateRequestTokens(messageWithImage("AAA"))
  const large = estimateRequestTokens(messageWithImage("A".repeat(500_000)))

  assert.equal(large, small)
  assert.ok(small >= 1_600)
  assert.ok(small < 2_000)
})

test("keep-start selection uses the same fixed image budget", () => {
  const entries = [
    entry("entry-1", "message", "user", {
      content: "[Image #1] older screenshot",
      images: [{ type: "base64", media_type: "image/png", data: "A".repeat(100_000), label: "1" }],
    }),
    entry("entry-2", "message", "user", {
      content: "[Image #1] latest screenshot",
      images: [{ type: "base64", media_type: "image/png", data: "B".repeat(100_000), label: "1" }],
    }),
  ]

  assert.equal(findKeepStart(entries, { keepRecentTokens: 2_000 }), 1)
})

function entry(id, type, role, data) {
  return {
    createdAt: Number(id.split("-").at(-1) || 0),
    data,
    id,
    parentEntryId: null,
    role,
    sessionId: "session-1",
    type,
  }
}
