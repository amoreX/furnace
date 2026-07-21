import assert from "node:assert/strict"
import test from "node:test"

const { furnaceTips, IDLE_TIP_INTERVAL_MS, IDLE_TIP_VISIBLE_MS, pickTip, TipScheduler } = await import("../../dist/ui/tips.js")

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

test("tip catalog contains the curated commands and conversation pin shortcut", () => {
  assert.equal(IDLE_TIP_VISIBLE_MS, 5000)
  assert.equal(IDLE_TIP_INTERVAL_MS, 10_000)
  const commands = furnaceTips.map((tip) => tip.command)
  for (const command of ["/fork", "/lofi", "/snow", "/caveman", "/stfu", "/pins", "Tab in /resume", "/init", "/theme", "Cost in /settings", "Tips in /settings", "/usage", "/change"]) {
    assert.equal(commands.includes(command), true, `missing tip: ${command}`)
  }
})

test("tip selection does not immediately repeat", () => {
  const tips = [
    { command: "/one", description: "one" },
    { command: "/two", description: "two" },
  ]
  assert.equal(pickTip(tips, "/one", () => 0)?.command, "/two")
  assert.equal(pickTip(tips, "/two", () => 0)?.command, "/one")
})

test("tip scheduler shows, hides, and suppresses ineligible tips", async () => {
  const displayed = []
  let eligible = false
  const scheduler = new TipScheduler({
    enabled: true,
    hideAfterMs: 4,
    isEligible: () => eligible,
    minWaitMs: 3,
    maxWaitMs: 3,
    random: () => 0,
    setTip: (tip) => displayed.push(tip?.command),
    tips: [{ command: "/tip", description: "toggle tips" }],
  })
  scheduler.start()
  await wait(5)
  assert.deepEqual(displayed, [])

  eligible = true
  await wait(5)
  assert.equal(displayed.includes("/tip"), true)
  await wait(5)
  assert.equal(displayed.includes(undefined), true)

  scheduler.setEnabled(false)
  const count = displayed.length
  await wait(5)
  assert.equal(displayed.length, count)
})
