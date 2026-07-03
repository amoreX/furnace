#!/usr/bin/env node

const requiredMajor = 22
const current = process.versions.node
const currentMajor = Number(current.split(".")[0])

if (currentMajor !== requiredMajor) {
  console.error([
    `Furnace must run on Node ${requiredMajor}.x for native better-sqlite3 compatibility.`,
    `Current Node: ${current} (${process.execPath})`,
    "",
    "Fix:",
    "  nvm use",
    "  npm rebuild better-sqlite3",
    "",
    "Then retry your npm command.",
  ].join("\n"))
  process.exit(1)
}
