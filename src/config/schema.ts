import { z } from "zod"

export const AutoContinueConfigSchema = z.object({
  text: z.string().min(1).default("继续"),
  delay: z.number().int().nonnegative().default(1000),
  maxContinues: z.number().int().positive().default(5),
  windowMs: z.number().int().positive().default(60000),
  ignoredErrorTypes: z.array(z.string()).default(["MessageAbortedError"]),
  contextTooLargePatterns: z.array(z.string()).default([
    "请求上下文过大",
    "context length",
    "too large",
    "maximum context",
    "token limit",
  ]),
})

export type AutoContinueConfig = z.infer<typeof AutoContinueConfigSchema>

export const AUTO_CONTINUE_DEFAULTS: AutoContinueConfig = {
  text: "继续",
  delay: 1000,
  maxContinues: 5,
  windowMs: 60000,
  ignoredErrorTypes: ["MessageAbortedError"],
  contextTooLargePatterns: [
    "请求上下文过大",
    "context length",
    "too large",
    "maximum context",
    "token limit",
  ],
}
