import assert from "node:assert/strict"
import test from "node:test"

const { TranscriptViewState } = await import("../dist/ui/transcript-view-state.js")

test("/clear hides existing entries while keeping later entries visible", () => {
  const state = new TranscriptViewState()
  const entries = [{ id: "old-user" }, { id: "old-assistant" }]

  state.clear("session-a", entries)

  assert.deepEqual(state.visibleEntries("session-a", entries), [])
  assert.deepEqual(
    state.visibleEntries("session-a", [...entries, { id: "new-user" }, { id: "new-assistant" }]),
    [{ id: "new-user" }, { id: "new-assistant" }],
  )
})

test("switching conversations resets the temporary /clear boundary", () => {
  const state = new TranscriptViewState()
  const entries = [{ id: "old-user" }, { id: "old-assistant" }]

  state.clear("session-a", entries)
  state.reset()

  assert.deepEqual(state.visibleEntries("session-a", entries), entries)
})

test("a changed conversation path does not retain a stale /clear boundary", () => {
  const state = new TranscriptViewState()
  state.clear("session-a", [{ id: "old-path-entry" }])

  const replacementPath = [{ id: "different-path-entry" }]
  assert.deepEqual(state.visibleEntries("session-a", replacementPath), replacementPath)
})
