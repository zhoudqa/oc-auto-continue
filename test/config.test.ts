import { describe, expect, test } from "bun:test"
import { AutoContinueConfigSchema, AUTO_CONTINUE_DEFAULTS } from "../src/config/schema.js"

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
