import type { QueuedPrompt } from "./ui/terminal-types.js"
import type { ImageAttachment } from "./utils/images.js"

export type PromptQueueInput = string | { hidden?: boolean; images?: ImageAttachment[]; source?: string; text: string }

export class PromptQueueStore {
  private counter = 0
  private readonly pausedSessions = new Set<string>()
  private readonly queues = new Map<string, QueuedPrompt[]>()

  get(sessionId: string): QueuedPrompt[] {
    let queue = this.queues.get(sessionId)
    if (!queue) {
      queue = []
      this.queues.set(sessionId, queue)
    }
    return queue
  }

  enqueue(sessionId: string, text: string, options: { hidden?: boolean; images?: ImageAttachment[]; source?: string } = {}): QueuedPrompt {
    const prompt: QueuedPrompt = {
      createdAt: Date.now(),
      hidden: options.hidden,
      id: `queue-${Date.now()}-${this.counter++}`,
      images: options.images,
      source: options.hidden ? options.source || "hidden_prompt" : undefined,
      text,
    }
    this.get(sessionId).push(prompt)
    return prompt
  }

  remove(sessionId: string, id: string): QueuedPrompt | undefined {
    const queue = this.get(sessionId)
    const index = queue.findIndex((prompt) => prompt.id === id)
    if (index < 0) return undefined
    const [removed] = queue.splice(index, 1)
    return removed
  }

  insert(sessionId: string, prompt: QueuedPrompt, index: number): QueuedPrompt {
    const queue = this.get(sessionId)
    const insertionIndex = Math.min(Math.max(0, index), queue.length)
    queue.splice(insertionIndex, 0, prompt)
    return prompt
  }

  isPaused(sessionId: string): boolean {
    return this.pausedSessions.has(sessionId)
  }

  pause(sessionId: string): void {
    this.pausedSessions.add(sessionId)
  }

  resume(sessionId: string): void {
    this.pausedSessions.delete(sessionId)
  }

  promote(sessionId: string, id: string): QueuedPrompt | undefined {
    const prompt = this.remove(sessionId, id)
    if (!prompt) return undefined
    this.get(sessionId).unshift(prompt)
    return prompt
  }

  unshiftActive(sessionId: string, input: PromptQueueInput, submittedImages?: ImageAttachment[]): QueuedPrompt {
    const promptText = typeof input === "string" ? input : input.text
    const hidden = typeof input === "string" ? false : Boolean(input.hidden)
    const source = typeof input === "string" ? undefined : input.source
    const images = typeof input === "string" ? submittedImages : input.images
    const prompt: QueuedPrompt = {
      createdAt: Date.now(),
      hidden,
      id: `active-${Date.now()}-${this.counter++}`,
      images,
      source,
      text: promptText,
    }
    this.get(sessionId).unshift(prompt)
    return prompt
  }
}
