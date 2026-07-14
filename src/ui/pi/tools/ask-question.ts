import { Text } from "@earendil-works/pi-tui"
import { normalizeAskQuestionRequest, type AskQuestionRequest } from "../../../questions.js"
import { getTextOutput } from "../render-utils.js"
import type { Theme } from "../theme.js"
import type { ToolDefinition } from "./types.js"

type AnsweredQuestion = {
  answer: string
  kind: "refused" | "selected" | "wrote"
  questionId: string
}

export function createAskQuestionToolDefinition(): ToolDefinition {
  return {
    name: "ask_question",
    label: "Ask question",
    renderCall(args, theme, context) {
      const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0)
      const request = safeRequest(args)
      if (!request) {
        text.setText(theme.fg("toolTitle", theme.bold("Ask question")))
        return text
      }
      const count = request.questions.length
      if (!context.isPartial) {
        text.setText(theme.fg("success", `✓ Asked ${count} question${count === 1 ? "" : "s"}`))
        return text
      }
      text.setText(renderQuestions(request, [], theme))
      return text
    },
    renderResult(result, _options, theme, context) {
      const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0)
      const request = safeRequest(context.args)
      const output = getTextOutput(result, false)
      if (!request) {
        text.setText(theme.fg("toolOutput", output))
        return text
      }
      text.setText(renderQuestions(request, parseAnswers(output), theme))
      return text
    },
  }
}

function safeRequest(args: unknown): AskQuestionRequest | undefined {
  try {
    return normalizeAskQuestionRequest(args)
  } catch {
    return undefined
  }
}

function parseAnswers(output: string): AnsweredQuestion[] {
  return output.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^([^:]+): user (selected|wrote|refused) "(.*)"$/)
    if (!match) return []
    return [{ answer: match[3], kind: match[2] as AnsweredQuestion["kind"], questionId: match[1] }]
  })
}

function renderQuestions(
  request: AskQuestionRequest,
  answers: AnsweredQuestion[],
  theme: Theme,
): string {
  return request.questions.flatMap((question, index) => {
    const questionAnswers = answers.filter((answer) => answer.questionId === question.id)
    const selected = new Set(questionAnswers.filter((answer) => answer.kind === "selected").map((answer) => answer.answer))
    const rows = [
      index > 0 ? "" : undefined,
      theme.fg("toolTitle", theme.bold(question.prompt)),
      ...question.options.map((option) => (
        selected.has(option.label)
          ? `${theme.fg("success", "[x]")} ${theme.fg("toolOutput", option.label)}`
          : `${theme.fg("muted", "[ ]")} ${theme.fg("dim", option.label)}`
      )),
    ].filter((row): row is string => row !== undefined)
    for (const answer of questionAnswers) {
      if (answer.kind === "wrote") rows.push(`${theme.fg("success", "[x]")} ${theme.fg("toolOutput", answer.answer)} ${theme.fg("muted", "(custom)")}`)
      if (answer.kind === "refused") rows.push(theme.fg("muted", "[-] Refused to answer"))
    }
    return rows
  }).join("\n")
}
