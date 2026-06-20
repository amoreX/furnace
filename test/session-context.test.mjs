import assert from "node:assert/strict"
import { test } from "node:test"
import { buildRuntimeContext, entriesToModelMessages } from "../dist/session/context.js"

test("runtime context includes current date and workspace", () => {
  const context = buildRuntimeContext({
    cwd: "/tmp/furnace",
    now: new Date("2026-06-20T17:48:00.000Z"),
  })

  assert.match(context, /Runtime context:/)
  assert.match(context, /Current ISO timestamp: 2026-06-20T17:48:00.000Z/)
  assert.match(context, /Current year: 2026/)
  assert.match(context, /Current workspace: \/tmp\/furnace/)
  assert.match(context, /latest, current, recent, today, and now/)
})

test("model messages include transient runtime context", () => {
  const messages = entriesToModelMessages(
    "base system",
    [
      {
        id: "entry-1",
        parentId: null,
        sessionId: "session-1",
        type: "message",
        role: "user",
        data: { content: "latest FIFA news" },
        model: null,
        createdAt: 0,
      },
    ],
    { cwd: "/tmp/furnace", now: new Date("2026-06-20T17:48:00.000Z") },
  )

  assert.equal(messages[0].role, "system")
  assert.equal(messages[0].content, "base system")
  assert.equal(messages[1].role, "system")
  assert.match(messages[1].content, /Current year: 2026/)
  assert.deepEqual(messages[2], { role: "user", content: "latest FIFA news" })
})
