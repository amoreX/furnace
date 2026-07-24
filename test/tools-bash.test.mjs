import assert from "node:assert/strict"
import test from "node:test"

const { shellInvocations } = await import("../dist/tools/bash.js")

test("shell commands use Bash on macOS and Linux", () => {
  for (const platform of ["darwin", "linux"]) {
    assert.deepEqual(shellInvocations("pwd", platform, {}), [
      { executable: "/bin/bash", args: ["-lc", "pwd"] },
    ])
  }
})

test("native Windows shell commands prefer PowerShell and preserve failures", () => {
  const [powerShell, commandPrompt] = shellInvocations(
    "Get-ChildItem",
    "win32",
    { SystemRoot: "C:\\Windows", ComSpec: "C:\\Windows\\System32\\cmd.exe" },
  )

  assert.equal(
    powerShell.executable,
    "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
  )
  assert.deepEqual(powerShell.args.slice(0, -1), [
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
  ])
  assert.match(powerShell.args.at(-1), /Get-ChildItem/)
  assert.match(powerShell.args.at(-1), /\$LASTEXITCODE/)
  assert.deepEqual(commandPrompt, {
    executable: "C:\\Windows\\System32\\cmd.exe",
    args: ["/d", "/s", "/c", "Get-ChildItem"],
  })
})

test("native Windows supports an explicit PowerShell executable", () => {
  const [powerShell] = shellInvocations("Get-Location", "win32", {
    FURNACE_WINDOWS_SHELL: "C:\\Program Files\\PowerShell\\7\\pwsh.exe",
  })

  assert.equal(powerShell.executable, "C:\\Program Files\\PowerShell\\7\\pwsh.exe")
})
