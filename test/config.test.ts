import { describe, expect, test } from "bun:test"
import { AutoContinueConfigSchema, AUTO_CONTINUE_DEFAULTS } from "../src/config/schema.js"
import { loadConfig } from "../src/config.js"
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"

describe("AutoContinueConfigSchema", () => {
  test("should accept valid full config", () => {
    const result = AutoContinueConfigSchema.safeParse({
      text: "continue",
      delay: 1000,
      maxContinues: 3,
      windowMs: 30000,
      ignoredErrorTypes: ["MessageAbortedError", "SomeError"],
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.text).toBe("continue")
      expect(result.data.delay).toBe(1000)
      expect(result.data.maxContinues).toBe(3)
      expect(result.data.windowMs).toBe(30000)
      expect(result.data.ignoredErrorTypes).toEqual(["MessageAbortedError", "SomeError"])
    }
  })

  test("should accept empty config (use defaults)", () => {
    const result = AutoContinueConfigSchema.safeParse({})
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.text).toBe("继续")
      expect(result.data.delay).toBe(500)
      expect(result.data.maxContinues).toBe(5)
      expect(result.data.windowMs).toBe(60000)
      expect(result.data.ignoredErrorTypes).toEqual(["MessageAbortedError"])
    }
  })

  test("should reject negative delay", () => {
    const result = AutoContinueConfigSchema.safeParse({ delay: -1 })
    expect(result.success).toBe(false)
  })

  test("should reject zero maxContinues", () => {
    const result = AutoContinueConfigSchema.safeParse({ maxContinues: 0 })
    expect(result.success).toBe(false)
  })

  test("defaults should match AUTO_CONTINUE_DEFAULTS", () => {
    expect(AUTO_CONTINUE_DEFAULTS).toEqual({
      text: "继续",
      delay: 500,
      maxContinues: 5,
      windowMs: 60000,
      ignoredErrorTypes: ["MessageAbortedError"],
    })
  })
})

describe("loadConfig", () => {
  test("should return defaults when no config files exist", () => {
    const dir = mkdtempSync(join(tmpdir(), "ac-test-"))
    const config = loadConfig(dir)
    expect(config).toEqual(AUTO_CONTINUE_DEFAULTS)
  })

  test("should load project-level config", () => {
    const dir = mkdtempSync(join(tmpdir(), "ac-test-"))
    const opencodeDir = join(dir, ".opencode")
    mkdirSync(opencodeDir, { recursive: true })
    writeFileSync(join(opencodeDir, "auto-continue.jsonc"), JSON.stringify({ text: "go on", delay: 2000 }))

    const config = loadConfig(dir)
    expect(config.text).toBe("go on")
    expect(config.delay).toBe(2000)
    // Other fields stay at defaults
    expect(config.maxContinues).toBe(5)
  })

  test("should reject invalid config", () => {
    const dir = mkdtempSync(join(tmpdir(), "ac-test-"))
    const opencodeDir = join(dir, ".opencode")
    mkdirSync(opencodeDir, { recursive: true })
    writeFileSync(join(opencodeDir, "auto-continue.jsonc"), JSON.stringify({ maxContinues: -1 }))

    expect(() => loadConfig(dir)).toThrow()
  })
})
