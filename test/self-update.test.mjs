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

test("self-update installs the latest package through the managed installer", () => {
  let invocation
  let stdout = ""
  const updated = runSelfUpdate({
    packageRoot: "/path/without/a/git/checkout",
    platform: "linux",
    install: (options) => {
      invocation = options
      return {
        launcherPath: "/home/user/.local/bin/furnace",
        pathChanged: false,
        root: "/home/user/.local/share/furnace",
        version: "9.8.7",
      }
    },
    stderr: () => {},
    stdout: (message) => { stdout += message },
  })

  assert.equal(updated, true)
  assert.equal(invocation.packageSpec, "cook-furnace@latest")
  assert.equal(invocation.platform, "linux")
  assert.match(stdout, /9\.8\.7 is installed/)
  assert.match(stdout, /Evolve changes will be reapplied on the next launch/)
  assert.match(stdout, /`\/change`/)
  assert.match(stdout, /furnace\.unordinary\.software\/changelog/)
})

test("self-update preserves the managed root on Windows and reports install failures", () => {
  let installRoot
  let stderr = ""
  const updated = runSelfUpdate({
    env: { FURNACE_MANAGED_ROOT: "C:\\Users\\Nihal\\AppData\\Local\\Furnace" },
    packageRoot: "C:\\published-package",
    platform: "win32",
    install: (options) => {
      installRoot = options.root
      throw new Error("npm installation failed")
    },
    stderr: (message) => { stderr += message },
    stdout: () => {},
  })

  assert.equal(updated, false)
  assert.equal(installRoot, "C:\\Users\\Nihal\\AppData\\Local\\Furnace")
  assert.match(stderr, /update failed/)
  assert.match(stderr, /npm installation failed/)
})

test("legacy published installs migrate to the managed installation", () => {
  let installed = false
  const updated = runSelfUpdate({
    env: {},
    install: () => {
      installed = true
      return {
        launcherPath: "/home/user/.local/bin/furnace",
        pathChanged: true,
        root: "/home/user/.local/share/furnace",
        version: "2.0.0",
      }
    },
    packageRoot: "/usr/local/lib/node_modules/cook-furnace",
    platform: "linux",
    stderr: () => {},
    stdout: () => {},
  })

  assert.equal(updated, true)
  assert.equal(installed, true)
})
