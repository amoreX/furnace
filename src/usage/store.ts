import { createHash } from "node:crypto"
import { mkdirSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import Database from "better-sqlite3"
import type { TurnUsage } from "../session/types.js"

export type UsageDay = {
  acceptedLines: number
  day: string
  costUsd: number
  completionTokens: number
  promptTokens: number
}

export type KeyUsageSummary = {
  acceptedLines: number
  costUsd: number
  completionTokens: number
  days: UsageDay[]
  promptTokens: number
  unknownCostTurns: number
}

export function usageKeyId(provider: string, apiKey: string): string | undefined {
  const key = apiKey.trim()
  if (!key) return undefined
  return createHash("sha256").update(provider).update("\0").update(key).digest("hex")
}

export function recordTurnUsage(input: {
  apiKey: string
  createdAt: number
  eventId: string
  provider: string
  usage?: TurnUsage
}): void {
  const keyId = usageKeyId(input.provider, input.apiKey)
  if (!keyId || !input.usage) return
  const usage = input.usage
  withUsageDatabase((db) => {
    db.prepare(
      `insert or ignore into usage_turns
       (event_id, key_id, provider, created_at, prompt_tokens, completion_tokens, cost_usd, cost_known)
       values (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      input.eventId,
      keyId,
      input.provider,
      input.createdAt,
      usage.promptTokens,
      usage.completionTokens,
      usage.costUsd ?? 0,
      usage.costUsd === null ? 0 : 1,
    )
  })
}

export function recordAcceptedLines(input: {
  apiKey: string
  createdAt: number
  eventId: string
  lines: number
  provider: string
}): void {
  const keyId = usageKeyId(input.provider, input.apiKey)
  const lines = Math.max(0, Math.floor(input.lines))
  if (!keyId || lines === 0) return
  withUsageDatabase((db) => {
    db.prepare(
      `insert or ignore into accepted_line_events (event_id, key_id, provider, created_at, lines)
       values (?, ?, ?, ?, ?)`,
    ).run(input.eventId, keyId, input.provider, input.createdAt, lines)
  })
}

export function removeAcceptedLines(eventId: string): void {
  withUsageDatabase((db) => {
    db.prepare("delete from accepted_line_events where event_id = ?").run(eventId)
  })
}

export function readKeyUsage(provider: string, apiKey: string, since?: number): KeyUsageSummary {
  const keyId = usageKeyId(provider, apiKey)
  if (!keyId) return emptySummary()
  return withUsageDatabase((db) => {
    const threshold = since ?? 0
    const turns = db.prepare(
      `select
         coalesce(sum(prompt_tokens), 0) as prompt_tokens,
         coalesce(sum(completion_tokens), 0) as completion_tokens,
         coalesce(sum(cost_usd), 0) as cost_usd,
         coalesce(sum(case when cost_known = 0 then 1 else 0 end), 0) as unknown_cost_turns
       from usage_turns where key_id = ? and created_at >= ?`,
    ).get(keyId, threshold) as {
      completion_tokens: number
      cost_usd: number
      prompt_tokens: number
      unknown_cost_turns: number
    }
    const lineTotal = db.prepare(
      "select coalesce(sum(lines), 0) as accepted_lines from accepted_line_events where key_id = ? and created_at >= ?",
    ).get(keyId, threshold) as { accepted_lines: number }
    const rows = db.prepare(
      `select day, sum(prompt_tokens) as prompt_tokens, sum(completion_tokens) as completion_tokens,
              sum(cost_usd) as cost_usd, sum(accepted_lines) as accepted_lines
       from (
         select date(created_at / 1000, 'unixepoch', 'localtime') as day,
                prompt_tokens, completion_tokens, cost_usd, 0 as accepted_lines
         from usage_turns where key_id = ? and created_at >= ?
         union all
         select date(created_at / 1000, 'unixepoch', 'localtime') as day,
                0, 0, 0, lines
         from accepted_line_events where key_id = ? and created_at >= ?
       )
       group by day order by day`,
    ).all(keyId, threshold, keyId, threshold) as Array<{
      accepted_lines: number
      completion_tokens: number
      cost_usd: number
      day: string
      prompt_tokens: number
    }>
    return {
      acceptedLines: lineTotal.accepted_lines,
      completionTokens: turns.completion_tokens,
      costUsd: turns.cost_usd,
      days: rows.map((row) => ({
        acceptedLines: row.accepted_lines,
        completionTokens: row.completion_tokens,
        costUsd: row.cost_usd,
        day: row.day,
        promptTokens: row.prompt_tokens,
      })),
      promptTokens: turns.prompt_tokens,
      unknownCostTurns: turns.unknown_cost_turns,
    }
  })
}

export function usageDatabasePath(): string {
  return join(homedir(), ".furnace", "usage.sqlite")
}

function withUsageDatabase<T>(run: (db: Database.Database) => T): T {
  const path = usageDatabasePath()
  mkdirSync(dirname(path), { recursive: true })
  const db = new Database(path)
  try {
    db.pragma("journal_mode = WAL")
    db.pragma("busy_timeout = 5000")
    db.exec(`
      create table if not exists usage_turns (
        event_id text primary key,
        key_id text not null,
        provider text not null,
        created_at integer not null,
        prompt_tokens integer not null,
        completion_tokens integer not null,
        cost_usd real not null,
        cost_known integer not null
      );
      create index if not exists usage_turns_key_created_idx on usage_turns(key_id, created_at);
      create table if not exists accepted_line_events (
        event_id text primary key,
        key_id text not null,
        provider text not null,
        created_at integer not null,
        lines integer not null
      );
      create index if not exists accepted_lines_key_created_idx on accepted_line_events(key_id, created_at);
    `)
    return run(db)
  } finally {
    db.close()
  }
}

function emptySummary(): KeyUsageSummary {
  return {
    acceptedLines: 0,
    completionTokens: 0,
    costUsd: 0,
    days: [],
    promptTokens: 0,
    unknownCostTurns: 0,
  }
}
