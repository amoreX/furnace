import { test } from "node:test"
import assert from "node:assert/strict"

const { createFurnaceTerminal } = await import("../../dist/ui/pi-terminal.js")

function createMockTerminal() {
  return {
    start: () => {},
    stop: () => {},
    drainInput: async () => {},
    write: () => {},
    moveBy: () => {},
    hideCursor: () => {},
    showCursor: () => {},
    clearLine: () => {},
    clearFromCursor: () => {},
    clearScreen: () => {},
    setTitle: () => {},
    setProgress: () => {},
    get columns() { return 80 },
    get rows() { return 24 },
    get kittyProtocolActive() { return false },
  }
}

test("createFurnaceTerminal returns all required FurnaceTerminal methods", () => {
  const terminal = createFurnaceTerminal({
    cwd: "/tmp",
    model: "openai/gpt-4o",
    modelSettings: {},
    onSubmit: () => {},
    terminal: createMockTerminal(),
    themeName: "default",
    title: "Test",
  })

  const required = [
    "clearInteractionPrompts",
    "clearToolActivities",
    "clearPlanActions",
    "requestQuestions",
    "requestApproval",
    "showQuestionPrompt",
    "showApprovalPrompt",
    "run",
    "stop",
    "waitForInputFocus",
    "setBusy",
    "setContextUsage",
    "setCostUsage",
    "setInputDraft",
    "setInputDisabled",
    "setStatusLinePreferences",
    "setSessionMeta",
    "setLofi",
    "setMode",
    "setThinking",
    "setQueuedPrompts",
    "setSlashCommandItems",
    "setTasks",
    "showModelEditor",
    "showPermissions",
    "showPlanActions",
    "showSettings",
    "showApiKeySetup",
    "showProviderSelector",
    "setModel",
    "setTheme",
    "setTitle",
    "setToolActivities",
    "clearTranscriptDisplay",
    "setStreamingContent",
    "setStatusNotice",
    "setTranscript",
    "suspendForEditor",
    "insertImageAttachment",
  ]

  for (const method of required) {
    assert.equal(typeof terminal[method], "function", `missing method: ${method}`)
  }
})

test("setTranscript and setStreamingContent do not throw", () => {
  const terminal = createFurnaceTerminal({
    cwd: "/tmp",
    model: "openai/gpt-4o",
    modelSettings: {},
    onSubmit: () => {},
    terminal: createMockTerminal(),
    themeName: "default",
    title: "Test",
  })

  assert.doesNotThrow(() => {
    terminal.setTranscript([
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi there" },
    ])
    terminal.setStreamingContent("streaming...")
  })
})
