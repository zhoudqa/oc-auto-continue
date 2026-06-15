import { readFileSync, existsSync } from "node:fs"
import { resolve, join } from "node:path"
import { homedir } from "node:os"
import { parse as parseJsonc } from "jsonc-parser"
import {
  AutoContinueConfigSchema,
  AUTO_CONTINUE_DEFAULTS,
  type AutoContinueConfig,
} from "./config/schema.js"

function loadJsoncFile(filePath: string): Record<string, unknown> | null {
  if (!existsSync(filePath)) return null
  const raw = readFileSync(filePath, "utf-8")
  return parseJsonc(raw) as Record<string, unknown> | null
}

function deepMerge(
  base: Record<string, unknown>,
  override: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...base }
  for (const [key, value] of Object.entries(override)) {
    if (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      typeof result[key] === "object" &&
      result[key] !== null &&
      !Array.isArray(result[key])
    ) {
      result[key] = deepMerge(
        result[key] as Record<string, unknown>,
        value as Record<string, unknown>,
      )
    } else {
      result[key] = value
    }
  }
  return result
}

export function loadConfig(projectDir: string): AutoContinueConfig {
  const projectConfigPath = join(projectDir, ".opencode", "auto-continue.jsonc")
  const userConfigPath = resolve(homedir(), ".config", "opencode", "auto-continue.jsonc")

  const defaults = AUTO_CONTINUE_DEFAULTS as Record<string, unknown>

  const userConfig = loadJsoncFile(userConfigPath) ?? {}
  const projectConfig = loadJsoncFile(projectConfigPath) ?? {}

  const merged = deepMerge(
    deepMerge(defaults, userConfig),
    projectConfig,
  )

  const parsed = AutoContinueConfigSchema.safeParse(merged)
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join(", ")
    throw new Error(`Invalid auto-continue config: ${issues}`)
  }

  return parsed.data
}
