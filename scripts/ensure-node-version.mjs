#!/usr/bin/env node

const requiredMajor = 22
const current = process.versions.node
const currentMajor = Number(current.split(".")[0])

if (currentMajor !== requiredMajor) {
  const versionManagerHint = process.platform === "win32"
    ? "  Install Node 22 with nvm-windows, Volta, or the Node.js installer."
    : "  Run `nvm use` (or select Node 22 with your version manager)."
  console.error([
    `Furnace must run on Node ${requiredMajor}.x for native better-sqlite3 compatibility.`,
    `Current Node: ${current} (${process.execPath})`,
    "",
    "Fix:",
    versionManagerHint,
    "  npm rebuild better-sqlite3",
    "",
    "Then retry your npm command.",
  ].join("\n"))
  process.exit(1)
}
