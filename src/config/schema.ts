import { z } from "zod"

export const AutoContinueConfigSchema = z.object({
  text: z.string().min(1).default("继续"),
  delay: z.number().int().nonnegative().default(500),
  maxContinues: z.number().int().positive().default(5),
  windowMs: z.number().int().positive().default(60000),
  ignoredErrorTypes: z.array(z.string()).default(["MessageAbortedError"]),
})

export type AutoContinueConfig = z.infer<typeof AutoContinueConfigSchema>

export const AUTO_CONTINUE_DEFAULTS: AutoContinueConfig = {
  text: "继续",
  delay: 500,
  maxContinues: 5,
  windowMs: 60000,
  ignoredErrorTypes: ["MessageAbortedError"],
}
