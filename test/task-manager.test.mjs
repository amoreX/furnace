import assert from "node:assert/strict"
import test from "node:test"

test("foreground task groups can move to background and continue to completion", async () => {
  const { TaskManager } = await import("../dist/tasks/manager.js")
  let finish
  const updates = []
  const completions = []
  const manager = new TaskManager({
    createChildTask({ description, parentSessionId, prompt }) {
      return {
        background: false,
        childSessionId: "child-1",
        description,
        id: "task-1",
        parentSessionId,
        prompt,
        startedAt: Date.now(),
        status: "running",
      }
    },
    executeChildTask() {
      return new Promise((resolve) => { finish = resolve })
    },
    onGroupComplete(group) { completions.push(group) },
    onUpdate(snapshot) { updates.push(snapshot) },
  })

  const foreground = manager.runTasks({
    parentSessionId: "parent-1",
    tasks: [{ description: "Write poem", prompt: "Write it" }],
  })
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(manager.promoteActiveGroup("parent-1"), true)
  const released = await foreground
  assert.equal(released.backgrounded, true)
  assert.equal(released.tasks[0].status, "backgrounded")
  assert.equal(manager.status("parent-1").tasks[0].status, "backgrounded")

  finish("done")
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(completions.length, 1)
  assert.equal(completions[0].backgrounded, true)
  assert.equal(completions[0].records[0].result, "done")
  assert.equal(manager.status("parent-1").tasks[0].status, "completed")
  assert.ok(updates.some((snapshot) => snapshot.tasks.some((task) => task.status === "backgrounded")))
  assert.ok(updates.some((snapshot) => snapshot.tasks.some((task) => task.status === "completed")))
})

test("background task status includes last tool activity", async () => {
  const { TaskManager } = await import("../dist/tasks/manager.js")
  let finish
  const manager = new TaskManager({
    createChildTask({ description, parentSessionId, prompt }) {
      return {
        background: false,
        childSessionId: "child-1",
        description,
        id: "task-1",
        parentSessionId,
        prompt,
        startedAt: Date.now(),
        status: "running",
      }
    },
    executeChildTask() {
      return new Promise((resolve) => { finish = resolve })
    },
  })
  const result = await manager.runTasks({ background: true, parentSessionId: "parent-1", tasks: [{ prompt: "Inspect files" }] })
  assert.equal(result.backgrounded, true)
  assert.equal(result.tasks[0].status, "backgrounded")
  manager.recordToolActivity("child-1", "read")
  assert.equal(manager.status("parent-1").tasks[0].lastToolName, "read")
  finish("done")
})

test("background completion payload returns settled child results to the parent agent", async () => {
  const { formatBackgroundTaskCompletion } = await import("../dist/interactive-session-controller.js")
  const payload = formatBackgroundTaskCompletion([
    {
      background: true,
      childSessionId: "child-1",
      completedAt: Date.now(),
      description: "Write poem",
      id: "task-1",
      parentSessionId: "parent-1",
      prompt: "Write it",
      result: "A small poem",
      startedAt: Date.now() - 10,
      status: "completed",
    },
  ])
  assert.match(payload, /Background subagent group completed/)
  assert.match(payload, /status: completed/)
  assert.match(payload, /A small poem/)
  assert.match(payload, /continue the user's work/)
})
