#!/usr/bin/env node

import { Command } from "commander"
import { loadConfig } from "./config.js"
import { streamOpenRouterResponse, type OpenRouterMessage } from "./openrouter.js"
import {
  clearScreen,
  readPrompt,
  renderAssistantStart,
  renderAssistantToken,
  renderDone,
  renderError,
} from "./ui/terminal.js"

const program = new Command()

program
  .name("furnace")
  .description("A from-scratch harness for agentic coding.")
  .argument("[prompt...]", "prompt to send to the model")
  .option("-p, --print <prompt>", "run a single prompt without opening the input area")
  .option("--no-clear", "do not clear the terminal before rendering")
  .version("0.0.0")
  .action(async (promptParts: string[], options: { print?: string; clear: boolean }) => {
    try {
      const config = await loadConfig()
      const cwd = process.cwd()
      const prompt = options.print || promptParts.join(" ") || (await promptForInput(cwd, config.model, options.clear))

      if (!prompt.trim()) {
        process.stdout.write("No prompt provided.\n")
        process.exitCode = 1
        return
      }

      const messages: OpenRouterMessage[] = [
        { role: "system", content: config.systemPrompt },
        { role: "user", content: prompt },
      ]

      renderAssistantStart(prompt)

      for await (const token of streamOpenRouterResponse(config, messages)) {
        renderAssistantToken(token)
      }

      renderDone()
    } catch (error) {
      renderError(error)
      process.exitCode = 1
    }
  })

await program.parseAsync()

async function promptForInput(cwd: string, model: string, shouldClear: boolean): Promise<string> {
  if (shouldClear) clearScreen()
  return readPrompt({ cwd, model })
}
