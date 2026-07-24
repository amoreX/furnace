import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"))
const { shouldSetExecutableBit } = await import("../scripts/build.mjs")
const { developmentCommand } = await import("../scripts/run-development-command.mjs")

test("development npm scripts do not require a Unix shell", () => {
  for (const name of ["check-node", "dev", "build", "start", "typecheck", "test", "prepublishOnly"]) {
    const script = packageJson.scripts[name]
    assert.equal(typeof script, "string")
    assert.doesNotMatch(script, /\.sh\b|(?:^|\s)sh\s+-c\b|chmod\s+\+x/)
  }
})

test("development commands run JavaScript CLIs through the active Node executable", () => {
  const [devExecutable, devArgs] = developmentCommand("dev", ["--help"])
  const [typecheckExecutable, typecheckArgs] = developmentCommand("typecheck")
  const [startExecutable, startArgs] = developmentCommand("start", ["--version"])

  assert.equal(devExecutable, process.execPath)
  assert.match(devArgs[0], /tsx[/\\]dist[/\\]cli\.mjs$/)
  assert.deepEqual(devArgs.slice(1), ["src/cli.ts", "--help"])
  assert.equal(typecheckExecutable, process.execPath)
  assert.match(typecheckArgs[0], /typescript[/\\]bin[/\\]tsc$/)
  assert.deepEqual(typecheckArgs.slice(1), ["-p", "tsconfig.json", "--noEmit"])
  assert.equal(startExecutable, process.execPath)
  assert.deepEqual(startArgs, ["dist/cli.js", "--version"])
})

test("build permissions are applied only on Unix-like platforms", () => {
  assert.equal(shouldSetExecutableBit("darwin"), true)
  assert.equal(shouldSetExecutableBit("linux"), true)
  assert.equal(shouldSetExecutableBit("win32"), false)
})
