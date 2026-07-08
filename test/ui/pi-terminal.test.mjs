import { test } from "node:test"
import assert from "node:assert/strict"

const { createFurnaceTerminal } = await import("../../dist/ui/pi-terminal.js")

test("createFurnaceTerminal returns all required FurnaceTerminal methods", () => {
  const terminal = createFurnaceTerminal({
    cwd: "/tmp",
    model: "openai/gpt-4o",
    modelSettings: {},
    onSubmit: () => {},
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
    "setPinnedChats",
    "setThinking",
    "setQueuedPrompts",
    "setSlashCommandItems",
    "setTasks",
    "showModelEditor",
    "showPermissions",
    "showPlanActions",
    "setSidebarEnabled",
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
