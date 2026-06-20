import assert from "node:assert/strict"
import { test } from "node:test"
import { shouldForceWebSearch } from "../dist/agent/loop.js"

test("current information prompts force websearch", () => {
  assert.equal(shouldForceWebSearch([{ role: "user", content: "latest FIFA news" }]), true)
  assert.equal(shouldForceWebSearch([{ role: "user", content: "what is the current Node.js release?" }]), true)
})

test("local repo prompts do not force websearch", () => {
  assert.equal(shouldForceWebSearch([{ role: "user", content: "latest changes in this repo" }]), false)
  assert.equal(shouldForceWebSearch([{ role: "user", content: "current git status" }]), false)
})
