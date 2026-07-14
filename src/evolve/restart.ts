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
  replaceProcess?: (command: string, args: string[], env: NodeJS.ProcessEnv) => never | void
  schedule?: (listener: () => void) => void
} = {}): void {
  const invocation = deps.invocation ?? furnaceRestartInvocation()
  const exitProcess = deps.exitProcess ?? ((code) => process.exit(code))
  const replaceProcess = deps.replaceProcess ?? ((command, args, env) => {
    const execve = process.execve
    if (!execve) throw new Error("This Node.js runtime does not support in-place process replacement.")
    return execve(command, args, env)
  })
  const schedule = deps.schedule ?? setImmediate
  // The caller tears down the TUI immediately after scheduling. Waiting for
  // `beforeExit` is unsafe because an active stdin handle can keep the old
  // process alive forever. Replacing this process also preserves its terminal
  // process group, so the shell cannot reclaim input during the handoff.
  schedule(() => {
    try {
      replaceProcess(invocation.command, [invocation.command, ...invocation.args], process.env)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      process.stderr.write(`Could not restart Furnace: ${message}\n`)
      exitProcess(1)
    }
  })
}
