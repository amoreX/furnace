import test from "node:test"
import assert from "node:assert/strict"

test("restart invocation preserves the current launcher and arguments", async () => {
  const { furnaceRestartInvocation } = await import("../../dist/evolve/restart.js")
  assert.deepEqual(
    furnaceRestartInvocation({
      argv: ["/node", "/furnace/dist/cli.js", "--continue"],
      execArgv: ["--enable-source-maps"],
      execPath: "/node",
    }),
    {
      command: "/node",
      args: ["--enable-source-maps", "/furnace/dist/cli.js", "--continue"],
    },
  )
})

test("scheduled restart replaces the current process to retain terminal focus", async () => {
  const { scheduleFurnaceRestart } = await import("../../dist/evolve/restart.js")
  let scheduledRestart
  const exitCodes = []
  const replacements = []
  scheduleFurnaceRestart({
    exitProcess: (code) => {
      exitCodes.push(code)
    },
    invocation: { command: "/node", args: ["/furnace/dist/cli.js"] },
    schedule: (listener) => {
      scheduledRestart = listener
    },
    replaceProcess: (command, args, env) => {
      replacements.push({ command, args, env })
    },
  })

  assert.deepEqual(replacements, [])
  assert.deepEqual(exitCodes, [])
  scheduledRestart()
  assert.equal(replacements.length, 1)
  assert.equal(replacements[0].command, "/node")
  assert.deepEqual(replacements[0].args, ["/node", "/furnace/dist/cli.js"])
  assert.equal(replacements[0].env, process.env)
  assert.deepEqual(exitCodes, [])
})
