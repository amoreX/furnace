import { spawn, spawnSync, type ChildProcess } from "node:child_process"
import process from "node:process"

export const defaultLofiStreamUrl = "https://ice1.somafm.com/groovesalad-128-mp3"

export type LofiToggleResult = {
  enabled: boolean
  message: string
  status: string
}

type Playback = {
  canStop: boolean
  label: string
  process?: ChildProcess
}

export class LofiPlayer {
  private playback?: Playback

  isEnabled(): boolean {
    return Boolean(this.playback)
  }

  toggle(): LofiToggleResult {
    if (this.playback) return this.stop()
    return this.start()
  }

  start(): LofiToggleResult {
    if (this.playback) {
      return {
        enabled: true,
        message: `Lofi is already on (${this.playback.label}).`,
        status: this.playback.label,
      }
    }

    const streamUrl = process.env.FURNACE_LOFI_URL || defaultLofiStreamUrl
    const playback = startPlayback(streamUrl)
    this.playback = playback
    const stopHint = playback.canStop ? "Run /lofi again to stop it." : "Close the opened player/browser tab to stop it."
    return {
      enabled: true,
      message: `Lofi on: ${playback.label}. ${stopHint}`,
      status: playback.label,
    }
  }

  stop(): LofiToggleResult {
    const playback = this.playback
    this.playback = undefined
    if (!playback) {
      return {
        enabled: false,
        message: "Lofi is already off.",
        status: "off",
      }
    }

    if (playback.canStop && playback.process?.pid) {
      stopProcess(playback.process)
      return {
        enabled: false,
        message: "Lofi off.",
        status: "off",
      }
    }

    return {
      enabled: false,
      message: "Lofi UI off. The stream was opened externally; close that player/browser tab to stop the music.",
      status: "off",
    }
  }
}

function startPlayback(streamUrl: string): Playback {
  const player = detectPlayer()
  if (player === "mpv") return spawnPlayer("mpv", ["--no-video", "--really-quiet", streamUrl], "mpv")
  if (player === "ffplay") return spawnPlayer("ffplay", ["-nodisp", "-loglevel", "quiet", streamUrl], "ffplay")
  if (player === "afplay") {
    return spawnPlayer("/bin/sh", ["-lc", `curl -L --silent ${shellQuote(streamUrl)} | afplay -`], "afplay")
  }
  if (player === "open") {
    spawn("open", [streamUrl], { detached: true, stdio: "ignore" }).unref()
    return { canStop: false, label: "browser" }
  }
  return { canStop: false, label: "no local player found" }
}

function detectPlayer(): "afplay" | "ffplay" | "mpv" | "open" | undefined {
  for (const candidate of ["mpv", "ffplay", "afplay", "open"] as const) {
    if (hasCommand(candidate)) return candidate
  }
  return undefined
}

function hasCommand(command: string): boolean {
  return spawnSync("/bin/sh", ["-lc", `command -v ${shellQuote(command)}`], { stdio: "ignore" }).status === 0
}

function spawnPlayer(command: string, args: string[], label: string): Playback {
  const child = spawn(command, args, {
    detached: true,
    stdio: "ignore",
  })
  child.unref()
  return { canStop: true, label, process: child }
}

function stopProcess(child: ChildProcess): void {
  if (!child.pid) return
  try {
    process.kill(-child.pid, "SIGTERM")
  } catch {
    try {
      child.kill("SIGTERM")
    } catch {
      // Best effort: playback should never crash the TUI.
    }
  }
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`
}
