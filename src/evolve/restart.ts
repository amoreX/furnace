import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process"

export type RestartInvocation = {
  args: string[]
  command: string
}

export function furnaceRestartInvocation(input: {
  argv?: string[]
  execArgv?: string[]
  execPath?: string
} = {}): RestartInvocation {
  const argv = input.argv ?? process.argv
  const entry = argv[1]
  if (!entry) throw new Error("Cannot restart Furnace because its executable entrypoint is unknown.")
  return {
    command: input.execPath ?? process.execPath,
    args: [...(input.execArgv ?? process.execArgv), entry, ...argv.slice(2)],
  }
}

export function scheduleFurnaceRestart(deps: {
  exitProcess?: (code: number) => never | void
  invocation?: RestartInvocation
  schedule?: (listener: () => void) => void
  spawnProcess?: (command: string, args: string[], options: SpawnOptions) => Pick<ChildProcess, "unref">
} = {}): void {
  const invocation = deps.invocation ?? furnaceRestartInvocation()
  const exitProcess = deps.exitProcess ?? ((code) => process.exit(code))
  const schedule = deps.schedule ?? setImmediate
  const spawnProcess = deps.spawnProcess ?? spawn
  // The caller tears down the TUI immediately after scheduling. Waiting for
  // `beforeExit` is unsafe because an active stdin handle can keep the old
  // process alive forever, so hand off on the next event-loop turn instead.
  schedule(() => {
    const child = spawnProcess(invocation.command, invocation.args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
    })
    // The restarted Furnace owns the inherited terminal. Do not keep this old
    // process alive waiting for the new interactive session to finish.
    child.unref()
    exitProcess(0)
  })
}
