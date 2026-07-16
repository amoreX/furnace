import assert from "node:assert/strict"
import test from "node:test"

test("hidden pinned panel is revealed temporarily by focus and restored afterward", async () => {
  const { PinnedChatsPanelState } = await import("../dist/ui/pinned-chats-state.js")
  const state = new PinnedChatsPanelState()
  state.setChatCount(2)

  assert.equal(state.toggle(), true)
  assert.equal(state.visible, false)
  assert.equal(state.focus(), true)
  assert.equal(state.visible, true)
  assert.equal(state.focused, true)

  state.finishInteraction()
  assert.equal(state.visible, false)
  assert.equal(state.focused, false)
})

test("visible pinned panel stays visible after focus and clamps selection after unpin", async () => {
  const { PinnedChatsPanelState } = await import("../dist/ui/pinned-chats-state.js")
  const state = new PinnedChatsPanelState()
  state.setChatCount(3)
  state.select(2)
  state.focus()
  state.finishInteraction()
  assert.equal(state.visible, true)

  state.setChatCount(2)
  assert.equal(state.selectedIndex, 1)
})

test("pin shortcuts are inert without chats and removing the last chat restores hidden state", async () => {
  const { PinnedChatsPanelState } = await import("../dist/ui/pinned-chats-state.js")
  const state = new PinnedChatsPanelState()
  assert.equal(state.focus(), false)
  assert.equal(state.toggle(), false)

  state.setChatCount(1)
  state.toggle()
  state.focus()
  state.setChatCount(0)
  assert.equal(state.visible, false)
  assert.equal(state.focused, false)
})
