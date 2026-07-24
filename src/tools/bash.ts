import { execFile } from "node:child_process"
import { win32 } from "node:path"
import { promisify } from "node:util"
import { clamp, optionalNumber, requiredString } from "./common.js"
import type { ToolContext } from "./types.js"

const execFileAsync = promisify(execFile)

export type ShellInvocation = {
  args: string[]
  executable: string
}

export async function bashTool(args: unknown, context: ToolContext): Promise<string> {
  const command = requiredString(args, "command")
  const timeoutMs = clamp(optionalNumber(args, "timeoutMs") || 30_000, 1, 120_000)
  const invocations = shellInvocations(command)
  for (const [index, invocation] of invocations.entries()) {
    try {
      const { stdout, stderr } = await execFileAsync(invocation.executable, invocation.args, {
        cwd: context.cwd,
        timeout: timeoutMs,
        maxBuffer: 1024 * 1024,
      })
      return formatCommandResult(0, stdout, stderr)
    } catch (error) {
      const maybe = error && typeof error === "object"
        ? error as { code?: unknown; killed?: boolean; signal?: unknown; stderr?: unknown; stdout?: unknown }
        : undefined
      if (maybe?.code === "ENOENT" && index + 1 < invocations.length) continue
      if (maybe) {
        const code = typeof maybe.code === "number" ? maybe.code : maybe.killed ? "timeout" : "error"
        return formatCommandResult(code, String(maybe.stdout || ""), String(maybe.stderr || maybe.signal || ""))
      }
      throw error
    }
  }
  return formatCommandResult("error", "", "No supported shell executable was found.")
}

export function shellInvocations(
  command: string,
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): ShellInvocation[] {
  if (platform !== "win32") return [{ executable: "/bin/bash", args: ["-lc", command] }]

  const configuredPowerShell = env.FURNACE_WINDOWS_SHELL?.trim()
  const systemRoot = env.SystemRoot?.trim() || env.SYSTEMROOT?.trim()
  const powerShell = configuredPowerShell
    || (systemRoot
      ? win32.join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe")
      : "powershell.exe")
  const commandPrompt = env.ComSpec?.trim() || env.COMSPEC?.trim() || "cmd.exe"
  return [
    {
      executable: powerShell,
      args: ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", powerShellCommand(command)],
    },
    {
      executable: commandPrompt,
      args: ["/d", "/s", "/c", command],
    },
  ]
}

function powerShellCommand(command: string): string {
  return [
    "$ErrorActionPreference = 'Stop'",
    "& {",
    command,
    "}",
    "$furnaceSucceeded = $?",
    "$furnaceExitCode = $LASTEXITCODE",
    "if (-not $furnaceSucceeded) {",
    "  if ($null -ne $furnaceExitCode -and $furnaceExitCode -ne 0) { exit $furnaceExitCode }",
    "  exit 1",
    "}",
    "exit 0",
  ].join("\n")
}

function formatCommandResult(exitCode: number | string, stdout: string, stderr: string): string {
  const parts = [`exit_code: ${exitCode}`]
  if (stdout) parts.push(`stdout:\n${stdout}`)
  if (stderr) parts.push(`stderr:\n${stderr}`)
  return parts.join("\n")
}
