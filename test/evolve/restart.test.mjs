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

test("scheduled restart hands off the terminal without waiting for the child", async () => {
  const { scheduleFurnaceRestart } = await import("../../dist/evolve/restart.js")
  let scheduledRestart
  const exitCodes = []
  const launches = []
  let unrefCalls = 0
  scheduleFurnaceRestart({
    exitProcess: (code) => {
      exitCodes.push(code)
    },
    invocation: { command: "/node", args: ["/furnace/dist/cli.js"] },
    schedule: (listener) => {
      scheduledRestart = listener
    },
    spawnProcess: (command, args, options) => {
      launches.push({ command, args, options })
      return {
        unref: () => {
          unrefCalls += 1
        },
      }
    },
  })

  assert.deepEqual(launches, [])
  assert.deepEqual(exitCodes, [])
  scheduledRestart()
  assert.equal(launches.length, 1)
  assert.equal(launches[0].command, "/node")
  assert.deepEqual(launches[0].args, ["/furnace/dist/cli.js"])
  assert.equal(launches[0].options.stdio, "inherit")
  assert.equal(unrefCalls, 1)
  assert.deepEqual(exitCodes, [0])
})
