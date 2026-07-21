import assert from "node:assert/strict"
import test from "node:test"

const { PromptQueueStore } = await import("../dist/prompt-queue.js")

test("queued prompts preserve image attachments through reorder and removal", () => {
  const store = new PromptQueueStore()
  const image = {
    id: "image-1",
    displayName: "queued.png",
    source: { type: "base64", media_type: "image/png", data: "aW1hZ2U=" },
  }
  const first = store.enqueue("session", "first")
  const second = store.enqueue("session", "second", { images: [image] })

  assert.equal(store.promote("session", second.id), second)
  assert.deepEqual(store.get("session").map((prompt) => prompt.id), [second.id, first.id])

  const restored = store.remove("session", second.id)
  assert.equal(restored?.text, "second")
  assert.deepEqual(restored?.images, [image])
  assert.deepEqual(store.get("session").map((prompt) => prompt.id), [first.id])

  store.insert("session", restored, 0)
  assert.deepEqual(store.get("session").map((prompt) => prompt.id), [second.id, first.id])
})

test("queues remain isolated when switching between pinned conversation ids", () => {
  const store = new PromptQueueStore()
  const firstChatPrompt = store.enqueue("pinned-chat-1", "first chat follow-up")
  const secondChatPrompt = store.enqueue("pinned-chat-2", "second chat follow-up")

  assert.deepEqual(store.get("pinned-chat-1").map((prompt) => prompt.id), [firstChatPrompt.id])
  assert.deepEqual(store.get("pinned-chat-2").map((prompt) => prompt.id), [secondChatPrompt.id])

  store.promote("pinned-chat-2", secondChatPrompt.id)
  store.remove("pinned-chat-1", firstChatPrompt.id)

  assert.deepEqual(store.get("pinned-chat-1"), [])
  assert.deepEqual(store.get("pinned-chat-2").map((prompt) => prompt.id), [secondChatPrompt.id])
})

test("user interruption pauses only that conversation queue until explicitly resumed", () => {
  const store = new PromptQueueStore()
  store.enqueue("chat-a", "waiting follow-up")
  store.enqueue("chat-b", "other chat follow-up")

  store.pause("chat-a")
  assert.equal(store.isPaused("chat-a"), true)
  assert.equal(store.isPaused("chat-b"), false)
  assert.equal(store.get("chat-a")[0].text, "waiting follow-up")

  store.resume("chat-a")
  assert.equal(store.isPaused("chat-a"), false)
  assert.equal(store.get("chat-a")[0].text, "waiting follow-up")
})
