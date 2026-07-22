import { spawnSync } from "node:child_process"
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { homedir } from "node:os"
import { basename, dirname, join, posix, win32 } from "node:path"

const PACKAGE_NAME = "cook-furnace"
const INSTALLER_LOGO = [
  "███████╗██╗   ██╗██████╗ ███╗   ██╗ █████╗  ██████╗███████╗",
  "██╔════╝██║   ██║██╔══██╗████╗  ██║██╔══██╗██╔════╝██╔════╝",
  "█████╗  ██║   ██║██████╔╝██╔██╗ ██║███████║██║     █████╗  ",
  "██╔══╝  ██║   ██║██╔══██╗██║╚██╗██║██╔══██║██║     ██╔══╝  ",
  "██║     ╚██████╔╝██║  ██║██║ ╚████║██║  ██║╚██████╗███████╗",
  "╚═╝      ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═══╝╚═╝  ╚═╝ ╚═════╝╚══════╝",
] as const

type ProcessResult = {
  error?: Error
  signal?: NodeJS.Signals | null
  status: number | null
}

type Spawn = (
  command: string,
  args: string[],
  options: { env?: NodeJS.ProcessEnv; stdio: "ignore" | "inherit" },
) => ProcessResult

export type ManagedInstallPaths = {
  binDir: string
  launcherPath: string
  root: string
  versionsDir: string
}

export type ManagedInstallResult = {
  launcherPath: string
  pathChanged: boolean
  root: string
  version: string
}

export type ManagedInstallOptions = {
  env?: NodeJS.ProcessEnv
  homeDir?: string
  packageSpec?: string
  platform?: NodeJS.Platform
  root?: string
  showBanner?: boolean
  spawn?: Spawn
  stdout?: (message: string) => void
}

export function managedInstallPaths(options: {
  env?: NodeJS.ProcessEnv
  homeDir?: string
  platform?: NodeJS.Platform
  root?: string
} = {}): ManagedInstallPaths {
  const platform = options.platform ?? process.platform
  const env = options.env ?? process.env
  const home = options.homeDir ?? homedir()
  const path = platform === "win32" ? win32 : posix
  const root = options.root
    ?? (platform === "win32"
      ? path.join(env.LOCALAPPDATA || path.join(home, "AppData", "Local"), "Furnace")
      : path.join(env.XDG_DATA_HOME || path.join(home, ".local", "share"), "furnace"))
  const binDir = platform === "win32"
    ? path.join(root, "bin")
    : env.XDG_BIN_HOME || path.join(home, ".local", "bin")
  return {
    binDir,
    launcherPath: path.join(binDir, platform === "win32" ? "furnace.cmd" : "furnace"),
    root,
    versionsDir: path.join(root, "versions"),
  }
}

export function renderManagedLauncher(input: {
  cliPath: string
  platform: NodeJS.Platform
  root: string
}): string {
  if (input.platform === "win32") {
    return [
      "@echo off",
      "setlocal",
      `set "FURNACE_MANAGED_ROOT=${input.root}"`,
      'set "FURNACE_MANAGED_INSTALL=1"',
      `node "${input.cliPath}" %*`,
      "",
    ].join("\r\n")
  }
  return [
    "#!/bin/sh",
    `export FURNACE_MANAGED_ROOT=${shellQuote(input.root)}`,
    "export FURNACE_MANAGED_INSTALL=1",
    `exec node ${shellQuote(input.cliPath)} "$@"`,
    "",
  ].join("\n")
}

export function windowsUserPathScript(binDir: string): string {
  const escaped = binDir.replaceAll("'", "''")
  return [
    "$current=[Environment]::GetEnvironmentVariable('Path','User')",
    `$entry='${escaped}'`,
    "$parts=@($current -split ';' | Where-Object { $_ })",
    "$remaining=@($parts | Where-Object { $_.TrimEnd('\\') -ine $entry.TrimEnd('\\') })",
    "[Environment]::SetEnvironmentVariable('Path',((@($entry) + $remaining) -join ';'),'User')",
  ].join("; ")
}

export function renderManagedInstallBanner(): string {
  return `\n${INSTALLER_LOGO.join("\n")}\n\n`
}

export function installManagedFurnace(options: ManagedInstallOptions = {}): ManagedInstallResult {
  const platform = options.platform ?? process.platform
  const env = options.env ?? process.env
  const spawn = options.spawn ?? spawnSync
  const stdout = options.stdout ?? ((message: string) => process.stdout.write(message))
  const paths = managedInstallPaths(options)
  const path = platform === "win32" ? win32 : posix
  const packageSpec = options.packageSpec ?? `${PACKAGE_NAME}@latest`
  const staging = path.join(paths.versionsDir, `.install-${process.pid}-${Date.now()}`)
  const npm = platform === "win32" ? "npm.cmd" : "npm"

  if (options.showBanner) {
    stdout(renderManagedInstallBanner())
    stdout("  ◌ Preparing your Furnace installation\n")
  }
  mkdirSync(paths.versionsDir, { recursive: true })
  mkdirSync(paths.binDir, { recursive: true })
  if (options.showBanner) stdout(`  ◌ Installing ${packageSpec}\n`)
  const install = spawn(
    npm,
    ["install", "--prefix", staging, "--no-audit", "--no-fund", "--omit=dev", "--no-save", packageSpec],
    { env, stdio: "inherit" },
  )
  if (install.error) {
    rmSync(staging, { force: true, recursive: true })
    throw new Error(`Unable to run npm: ${install.error.message}`)
  }
  if (install.status !== 0) {
    rmSync(staging, { force: true, recursive: true })
    const detail = install.signal ? ` (${install.signal})` : ""
    throw new Error(`npm installation failed${detail}`)
  }

  const installedPackage = path.join(staging, "node_modules", PACKAGE_NAME, "package.json")
  let version: string
  try {
    const manifest = JSON.parse(readFileSync(installedPackage, "utf8")) as { version?: string }
    if (!manifest.version) throw new Error("missing version")
    version = manifest.version
  } catch {
    rmSync(staging, { force: true, recursive: true })
    throw new Error("The installed Furnace package did not contain a valid version.")
  }

  const versionRoot = path.join(paths.versionsDir, version)
  if (existsSync(versionRoot)) {
    rmSync(staging, { force: true, recursive: true })
  } else {
    renameSync(staging, versionRoot)
  }
  const cliPath = path.join(versionRoot, "node_modules", PACKAGE_NAME, "dist", "cli.js")
  if (!existsSync(cliPath)) throw new Error("The installed Furnace package did not contain dist/cli.js.")

  const launcher = renderManagedLauncher({ cliPath, platform, root: paths.root })
  if (options.showBanner) stdout("  ◌ Creating the persistent `furnace` command\n")
  const launcherTemp = `${paths.launcherPath}.tmp-${process.pid}`
  writeFileSync(launcherTemp, launcher, "utf8")
  if (platform !== "win32") chmodSync(launcherTemp, 0o755)
  rmSync(paths.launcherPath, { force: true })
  renameSync(launcherTemp, paths.launcherPath)

  const pathChanged = ensureManagedCommandPath({ ...options, env, platform, spawn, stdout })
  if (options.showBanner) stdout("  ✓ Furnace is ready\n\n")
  return { launcherPath: paths.launcherPath, pathChanged, root: paths.root, version }
}

export function ensureManagedCommandPath(options: ManagedInstallOptions = {}): boolean {
  const env = options.env ?? process.env
  const platform = options.platform ?? process.platform
  const spawn = options.spawn ?? spawnSync
  const stdout = options.stdout ?? ((message: string) => process.stdout.write(message))
  return ensureUserPath({
    env,
    paths: managedInstallPaths(options),
    platform,
    spawn,
    stdout,
  })
}

export function shouldBootstrapFromNpx(input: {
  env?: NodeJS.ProcessEnv
  packageRoot: string
  platform?: NodeJS.Platform
}): boolean {
  const env = input.env ?? process.env
  if (env.FURNACE_MANAGED_INSTALL === "1") return false
  if (existsSync(join(input.packageRoot, ".git"))) return false
  return env.npm_command === "exec"
    || env.npm_lifecycle_event === "npx"
    || /[/\\]_npx[/\\]/.test(input.packageRoot)
}

export function bootstrapFromNpx(options: ManagedInstallOptions & {
  packageRoot: string
  version: string
}): ManagedInstallResult | undefined {
  if (!shouldBootstrapFromNpx({
    env: options.env,
    packageRoot: options.packageRoot,
    platform: options.platform,
  })) return undefined
  const paths = managedInstallPaths(options)
  const path = (options.platform ?? process.platform) === "win32" ? win32 : posix
  const expectedCli = path.join(
    paths.versionsDir,
    options.version,
    "node_modules",
    PACKAGE_NAME,
    "dist",
    "cli.js",
  )
  if (existsSync(paths.launcherPath) && existsSync(expectedCli)) {
    const pathChanged = ensureManagedCommandPath(options)
    return pathChanged
      ? { launcherPath: paths.launcherPath, pathChanged, root: paths.root, version: options.version }
      : undefined
  }
  return installManagedFurnace({
    ...options,
    packageSpec: `${PACKAGE_NAME}@${options.version}`,
    showBanner: true,
  })
}

export function cleanupStaleManagedVersions(input: {
  currentVersion: string
  env?: NodeJS.ProcessEnv
  platform?: NodeJS.Platform
}): void {
  const env = input.env ?? process.env
  if (env.FURNACE_MANAGED_INSTALL !== "1" || !env.FURNACE_MANAGED_ROOT) return
  const platform = input.platform ?? process.platform
  const path = platform === "win32" ? win32 : posix
  const versionsDir = path.join(env.FURNACE_MANAGED_ROOT, "versions")
  let entries: string[]
  try {
    entries = readdirSync(versionsDir)
  } catch {
    return
  }
  for (const entry of entries) {
    if (entry === input.currentVersion || entry.startsWith(".install-")) continue
    try {
      rmSync(path.join(versionsDir, entry), { force: true, recursive: true })
    } catch {
      // A previous Windows version may still be locked; retry next launch.
    }
  }
}

function ensureUserPath(input: {
  env: NodeJS.ProcessEnv
  paths: ManagedInstallPaths
  platform: NodeJS.Platform
  spawn: Spawn
  stdout: (message: string) => void
}): boolean {
  const currentPath = input.env.PATH || input.env.Path || ""
  if (pathStartsWith(currentPath, input.paths.binDir, input.platform)) return false
  const separator = input.platform === "win32" ? ";" : ":"
  const remaining = currentPath
    .split(separator)
    .filter((entry) => !samePathEntry(entry, input.paths.binDir, input.platform))
  input.env.PATH = [input.paths.binDir, ...remaining].filter(Boolean).join(separator)

  if (input.platform === "win32") {
    const script = windowsUserPathScript(input.paths.binDir)
    const result = input.spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { env: input.env, stdio: "ignore" })
    if (result.status !== 0 || result.error) {
      input.stdout(`Add ${input.paths.binDir} to your User PATH, then reopen the terminal.\n`)
      return false
    }
    return true
  }

  const profile = shellProfile(input.env, input.paths.binDir)
  try {
    const existing = existsSync(profile.path) ? readFileSync(profile.path, "utf8") : ""
    if (!existing.includes(profile.line)) {
      const prefix = existing.length > 0 && !existing.endsWith("\n") ? "\n" : ""
      mkdirSync(dirname(profile.path), { recursive: true })
      writeFileSync(profile.path, `${existing}${prefix}\n# Furnace CLI\n${profile.line}\n`, "utf8")
    }
  } catch {
    input.stdout(`Add ${input.paths.binDir} to PATH, then reopen the terminal.\n`)
    return false
  }
  return true
}

function shellProfile(env: NodeJS.ProcessEnv, binDir: string): { line: string; path: string } {
  const shell = basename(env.SHELL || "")
  const home = env.HOME || homedir()
  if (shell === "fish") {
    return {
      line: `fish_add_path ${shellQuote(binDir)}`,
      path: posix.join(home, ".config", "fish", "conf.d", "furnace.fish"),
    }
  }
  return {
    line: `export PATH=${shellQuote(binDir)}:"$PATH"`,
    path: shell === "zsh"
      ? posix.join(home, ".zshrc")
      : shell === "bash"
        ? posix.join(home, ".bashrc")
        : posix.join(home, ".profile"),
  }
}

function pathStartsWith(value: string, entry: string, platform: NodeJS.Platform): boolean {
  const separator = platform === "win32" ? ";" : ":"
  const first = value.split(separator).find(Boolean) || ""
  return samePathEntry(first, entry, platform)
}

function samePathEntry(left: string, right: string, platform: NodeJS.Platform): boolean {
  const normalize = (part: string) => {
    const trimmed = part.trim().replace(/^"|"$/g, "").replace(/[\\/]+$/, "")
    return platform === "win32" ? trimmed.toLowerCase() : trimmed
  }
  return normalize(left) === normalize(right)
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`
}
