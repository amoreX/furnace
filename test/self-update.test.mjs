import { test } from "node:test"
import assert from "node:assert/strict"

const { isSourceCheckout, runSelfUpdate } = await import("../dist/self-update.js")

test("self-update refuses to overwrite a source checkout", () => {
  let spawned = false
  let stderr = ""
  const updated = runSelfUpdate({
    packageRoot: process.cwd(),
    spawn: () => {
      spawned = true
      return { status: 0 }
    },
    stderr: (message) => { stderr += message },
    stdout: () => {},
  })

  assert.equal(isSourceCheckout(process.cwd()), true)
  assert.equal(updated, false)
  assert.equal(spawned, false)
  assert.match(stderr, /source checkout/)
})

test("self-update installs the latest published package globally", () => {
  let invocation
  let stdout = ""
  const updated = runSelfUpdate({
    packageRoot: "/path/without/a/git/checkout",
    platform: "linux",
    spawn: (command, args, options) => {
      invocation = { command, args, options }
      return { status: 0 }
    },
    stderr: () => {},
    stdout: (message) => { stdout += message },
  })

  assert.equal(updated, true)
  assert.deepEqual(invocation, {
    command: "npm",
    args: ["install", "--global", "cook-furnace@latest"],
    options: { stdio: "inherit" },
  })
  assert.match(stdout, /updated to the latest published version/)
  assert.match(stdout, /Evolve changes will be reapplied on the next launch/)
  assert.match(stdout, /`\/change`/)
  assert.match(stdout, /furnace\.unordinary\.software\/changelog/)
})

test("self-update uses npm.cmd on Windows and reports install failures", () => {
  let command
  let stderr = ""
  const updated = runSelfUpdate({
    packageRoot: "C:\\published-package",
    platform: "win32",
    spawn: (executable) => {
      command = executable
      return { status: 1 }
    },
    stderr: (message) => { stderr += message },
    stdout: () => {},
  })

  assert.equal(updated, false)
  assert.equal(command, "npm.cmd")
  assert.match(stderr, /update failed/)
})
