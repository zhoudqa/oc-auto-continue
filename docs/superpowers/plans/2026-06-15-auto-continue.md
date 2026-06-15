# Auto-Continue Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an OpenCode plugin that automatically sends "继续" when sessions encounter errors (rate limiting, timeouts, auth errors, etc.), removing the need for manual intervention.

**Architecture:** Event-driven opencode plugin using the `event` hook. Monitors `session.error` events, flags sessions as errored, then on next `session.status(idle)` sends a "继续" text message via `client.session.prompt()`. Per-session state tracking with loop protection.

**Tech Stack:** TypeScript (ESNext, Strict Mode), Bun, `@opencode-ai/plugin ^1.4.0`, `@opencode-ai/sdk ^1.4.0`, Zod, jsonc-parser

---

### File Structure

```
auto-continue/
├── package.json
├── tsconfig.json
├── .gitignore
├── src/
│   ├── index.ts              # Plugin entry: PluginModule
│   ├── config.ts             # Config loading (project + user level)
│   ├── config/
│   │   └── schema.ts         # Zod schema + defaults
│   └── create-hooks.ts       # Event hook logic
├── test/
│   ├── config.test.ts        # Config schema + loader tests
│   └── create-hooks.test.ts  # Hook state machine tests
```

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`

- [ ] **Step 1: Create package.json**

Write `package.json`:

```json
{
  "name": "@zhoudqa/auto-continue",
  "version": "0.0.1",
  "description": "OpenCode plugin that auto-sends continue on session errors",
  "main": "./dist/index.js",
  "types": "dist/index.d.ts",
  "type": "module",
  "files": ["dist"],
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "test": "bun test",
    "clean": "rm -rf dist"
  },
  "license": "MIT",
  "dependencies": {
    "jsonc-parser": "^3.3.1",
    "zod": "^3.23.0"
  },
  "peerDependencies": {
    "@opencode-ai/plugin": "^1.4.0",
    "@opencode-ai/sdk": "^1.4.0"
  },
  "devDependencies": {
    "@opencode-ai/plugin": "^1.4.0",
    "@opencode-ai/sdk": "^1.4.0",
    "bun-types": "1.3.11",
    "typescript": "^5.7.3"
  }
}
```

Note: `@opencode-ai/plugin` and `@opencode-ai/sdk` are peerDependencies (the host opencode installation provides them) but also devDependencies for type checking.

- [ ] **Step 2: Create tsconfig.json**

Write `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "types": ["bun-types"],
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

- [ ] **Step 3: Create .gitignore**

Write `.gitignore`:

```
node_modules/
dist/
*.log
.DS_Store
```

- [ ] **Step 4: Install dependencies**

Run: `bun install`
Expected: Dependencies installed, `node_modules/` created.

- [ ] **Step 5: Commit**

```bash
git add package.json tsconfig.json .gitignore bun.lock
git commit -m "chore: scaffold auto-continue project"
```

---

### Task 2: Config Schema

**Files:**
- Create: `src/config/schema.ts`
- Create: `test/config.test.ts`

- [ ] **Step 1: Write the failing test**

Write `test/config.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/config.test.ts`
Expected: FAIL — import errors for missing module.

- [ ] **Step 3: Write implementation**

Write `src/config/schema.ts`:

```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test test/config.test.ts`
Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/config/schema.ts test/config.test.ts
git commit -m "feat: add config schema with zod validation"
```

---

### Task 3: Config Loader

**Files:**
- Create: `src/config.ts`
- Modify: `test/config.test.ts` (append tests)

- [ ] **Step 1: Write the failing test**

Append to `test/config.test.ts`:

```typescript
import { loadConfig } from "../src/config.js"
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/config.test.ts`
Expected: 3 new tests FAIL (import error for missing module).

- [ ] **Step 3: Write implementation**

Write `src/config.ts`:

```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test test/config.test.ts`
Expected: All 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/config.ts test/config.test.ts
git commit -m "feat: add config loader with JSONC support"
```

---

### Task 4: Event Hook Logic

**Files:**
- Create: `src/create-hooks.ts`
- Create: `test/create-hooks.test.ts`

This is the core logic. The hook function:

1. Receives events from the opencode event system
2. On `session.error`: records the session as errored (with dedup by error message)
3. On `session.status({ type: "idle" })`: if session is flagged as errored, sends "继续" via `client.session.prompt()`
4. Tracks continue count per session within a rolling time window to prevent infinite loops

- [ ] **Step 1: Write the failing test**

Write `test/create-hooks.test.ts`:

```typescript
import { describe, expect, test, beforeEach, jest } from "bun:test"
import { createHooks } from "../src/create-hooks.js"
import { AUTO_CONTINUE_DEFAULTS, type AutoContinueConfig } from "../src/config/schema.js"

type MockPrompt = {
  path: { id: string }
  body: { parts: { type: string; text: string }[] }
}

function makeClient() {
  const calls: MockPrompt[] = []
  const prompt = async (opts: MockPrompt) => {
    calls.push(opts)
    return { data: undefined, error: undefined, response: new Response() }
  }
  return { session: { prompt } as typeof prompt, calls }
}

function makeEvent(type: string, properties: Record<string, unknown>) {
  return { event: { type, properties } } as any
}

describe("createHooks", () => {
  let client: ReturnType<typeof makeClient>
  let hooks: ReturnType<typeof createHooks>

  beforeEach(() => {
    client = makeClient()
    hooks = createHooks(client as any, AUTO_CONTINUE_DEFAULTS)
  })

  test("should send continue on error followed by idle", async () => {
    await hooks.event!(makeEvent("session.error", {
      sessionID: "sess-1",
      error: { name: "ApiError", data: { message: "rate limited", isRetryable: true } },
    }))
    await hooks.event!(makeEvent("session.status", {
      sessionID: "sess-1",
      status: { type: "idle" },
    }))

    // delay is 500ms, wait a bit
    await new Promise((r) => setTimeout(r, 600))

    expect(client.calls.length).toBe(1)
    expect(client.calls[0].path.id).toBe("sess-1")
    expect(client.calls[0].body.parts[0].text).toBe("继续")
  })

  test("should NOT send continue if session became idle without error", async () => {
    await hooks.event!(makeEvent("session.status", {
      sessionID: "sess-1",
      status: { type: "idle" },
    }))

    await new Promise((r) => setTimeout(r, 600))
    expect(client.calls.length).toBe(0)
  })

  test("should NOT send continue for MessageAbortedError", async () => {
    await hooks.event!(makeEvent("session.error", {
      sessionID: "sess-1",
      error: { name: "MessageAbortedError", data: { message: "aborted" } },
    }))
    await hooks.event!(makeEvent("session.status", {
      sessionID: "sess-1",
      status: { type: "idle" },
    }))

    await new Promise((r) => setTimeout(r, 600))
    expect(client.calls.length).toBe(0)
  })

  test("should NOT send continue if sessionID is missing", async () => {
    await hooks.event!(makeEvent("session.error", {
      error: { name: "ApiError", data: { message: "err" } },
    }))
    await hooks.event!(makeEvent("session.status", {
      sessionID: "sess-1",
      status: { type: "idle" },
    }))

    await new Promise((r) => setTimeout(r, 600))
    expect(client.calls.length).toBe(0)
  })

  test("should NOT send continue if error is missing", async () => {
    await hooks.event!(makeEvent("session.error", {
      sessionID: "sess-1",
    }))

    await new Promise((r) => setTimeout(r, 600))
    expect(client.calls.length).toBe(0)
  })

  test("should deduplicate same error for same session", async () => {
    await hooks.event!(makeEvent("session.error", {
      sessionID: "sess-1",
      error: { name: "ApiError", data: { message: "rate limited" } },
    }))
    await hooks.event!(makeEvent("session.error", {
      sessionID: "sess-1",
      error: { name: "ApiError", data: { message: "rate limited" } },
    }))
    await hooks.event!(makeEvent("session.status", {
      sessionID: "sess-1",
      status: { type: "idle" },
    }))

    await new Promise((r) => setTimeout(r, 600))
    // Should only send once
    expect(client.calls.length).toBe(1)
  })

  test("should track separate sessions independently", async () => {
    await hooks.event!(makeEvent("session.error", {
      sessionID: "sess-1",
      error: { name: "ApiError", data: { message: "err" } },
    }))
    // sess-2 idle without error should not trigger
    await hooks.event!(makeEvent("session.status", {
      sessionID: "sess-2",
      status: { type: "idle" },
    }))
    await hooks.event!(makeEvent("session.status", {
      sessionID: "sess-1",
      status: { type: "idle" },
    }))

    await new Promise((r) => setTimeout(r, 600))
    expect(client.calls.length).toBe(1)
    expect(client.calls[0].path.id).toBe("sess-1")
  })

  test("should stop after maxContinues in time window", async () => {
    const cfg: AutoContinueConfig = { ...AUTO_CONTINUE_DEFAULTS, maxContinues: 2, delay: 10 }
    const localHooks = createHooks(client as any, cfg)

    // First error+idle → should continue
    await localHooks.event!(makeEvent("session.error", {
      sessionID: "sess-1",
      error: { name: "ApiError", data: { message: "err1" } },
    }))
    await localHooks.event!(makeEvent("session.status", {
      sessionID: "sess-1",
      status: { type: "idle" },
    }))

    // Second error+idle → should continue
    await localHooks.event!(makeEvent("session.error", {
      sessionID: "sess-1",
      error: { name: "ApiError", data: { message: "err2" } },
    }))
    await localHooks.event!(makeEvent("session.status", {
      sessionID: "sess-1",
      status: { type: "idle" },
    }))

    // Third error+idle → should NOT continue (hit maxContinues=2)
    await localHooks.event!(makeEvent("session.error", {
      sessionID: "sess-1",
      error: { name: "ApiError", data: { message: "err3" } },
    }))
    await localHooks.event!(makeEvent("session.status", {
      sessionID: "sess-1",
      status: { type: "idle" },
    }))

    await new Promise((r) => setTimeout(r, 50))
    expect(client.calls.length).toBe(2)
  })

  test("should handle non-error events gracefully", async () => {
    await hooks.event!(makeEvent("message.updated", { info: { id: "msg-1" } }))
    await hooks.event!(makeEvent("session.status", {
      sessionID: "sess-1",
      status: { type: "busy" },
    }))
    await new Promise((r) => setTimeout(r, 100))
    expect(client.calls.length).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/create-hooks.test.ts`
Expected: FAIL — import error for missing module.

- [ ] **Step 3: Write implementation**

Write `src/create-hooks.ts`:

```typescript
import type { Hooks, PluginInput } from "@opencode-ai/plugin"
import type {
  EventSessionError,
  EventSessionStatus,
  ApiError,
  ProviderAuthError,
  UnknownError,
  MessageOutputLengthError,
  MessageAbortedError,
} from "@opencode-ai/sdk"
import type { AutoContinueConfig } from "./config/schema.js"

type SessionErrorData = {
  errorMessage: string
}

export function createHooks(
  client: PluginInput["client"],
  config: AutoContinueConfig,
): Hooks {
  const erroredSessions = new Map<string, SessionErrorData>()
  const continueCounts = new Map<string, { count: number; windowStart: number }>()

  function isContinueLoop(sessionID: string): boolean {
    const entry = continueCounts.get(sessionID)
    if (!entry) return false
    if (Date.now() - entry.windowStart > config.windowMs) {
      continueCounts.delete(sessionID)
      return false
    }
    return entry.count >= config.maxContinues
  }

  function incrementContinueCount(sessionID: string): void {
    const entry = continueCounts.get(sessionID)
    if (entry && Date.now() - entry.windowStart <= config.windowMs) {
      entry.count++
    } else {
      continueCounts.set(sessionID, { count: 1, windowStart: Date.now() })
    }
  }

  function isIgnoredErrorType(errorName: string): boolean {
    return config.ignoredErrorTypes.includes(errorName)
  }

  function isSessionErrorEvent(event: {
    type: string
    properties: Record<string, unknown>
  }): event is EventSessionError & { properties: { sessionID: string; error: NonNullable<EventSessionError["properties"]["error"]> } } {
    if (event.type !== "session.error") return false
    const props = event.properties as EventSessionError["properties"]
    return typeof props.sessionID === "string" && props.error !== undefined
  }

  function isSessionIdleEvent(event: {
    type: string
    properties: Record<string, unknown>
  }): event is EventSessionStatus & { properties: { sessionID: string; status: { type: "idle" } } } {
    if (event.type !== "session.status") return false
    const props = event.properties as EventSessionStatus["properties"]
    return (
      typeof props.sessionID === "string" &&
      typeof props.status === "object" &&
      props.status !== null &&
      (props.status as { type: string }).type === "idle"
    )
  }

  return {
    event: async (input) => {
      const event = input.event as unknown as {
        type: string
        properties: Record<string, unknown>
      }

      if (isSessionErrorEvent(event)) {
        if (isIgnoredErrorType(event.properties.error.name)) return
        if (isContinueLoop(event.properties.sessionID)) return

        erroredSessions.set(event.properties.sessionID, {
          errorMessage: getErrorMessage(event.properties.error),
        })
        return
      }

      if (isSessionIdleEvent(event)) {
        const sessionID = event.properties.sessionID
        if (!erroredSessions.has(sessionID)) return

        erroredSessions.delete(sessionID)
        incrementContinueCount(sessionID)

        setTimeout(async () => {
          try {
            await client.session.prompt({
              path: { id: sessionID },
              body: {
                parts: [{ type: "text" as const, text: config.text }],
              },
            })
          } catch {
            // Ignore send failures
          }
        }, config.delay)
      }
    },
  }
}

function getErrorMessage(
  error:
    | ApiError
    | ProviderAuthError
    | UnknownError
    | MessageOutputLengthError
    | MessageAbortedError,
): string {
  if ("data" in error && typeof error.data === "object" && error.data !== null) {
    return "message" in error.data ? String(error.data.message) : ""
  }
  return ""
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test test/create-hooks.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/create-hooks.ts test/create-hooks.test.ts
git commit -m "feat: add event hook logic for auto-continue"
```

---

### Task 5: Plugin Entry Point

**Files:**
- Create: `src/index.ts`

- [ ] **Step 1: Write implementation**

Write `src/index.ts`:

```typescript
import type { PluginModule, Plugin } from "@opencode-ai/plugin"
import { loadConfig } from "./config.js"
import { createHooks } from "./create-hooks.js"

const serverPlugin: Plugin = async (input) => {
  const config = loadConfig(input.directory)
  const hooks = createHooks(input.client, config)
  return { ...hooks }
}

const pluginModule: PluginModule = {
  id: "auto-continue",
  server: serverPlugin,
}

export default pluginModule
```

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: No errors.

- [ ] **Step 3: Build**

Run: `bun run build`
Expected: `dist/index.js`, `dist/config.js`, `dist/create-hooks.js`, `dist/config/schema.js` + declaration files created.

- [ ] **Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat: add plugin entry point"
```

---

### Task 6: Build and Verify

- [ ] **Step 1: Run full test suite**

Run: `bun test`
Expected: All tests PASS.

- [ ] **Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: No errors.

- [ ] **Step 3: Run clean build**

```bash
bun run clean && bun run build
```
Expected: `dist/` directory created with all `.js`, `.d.ts`, `.d.ts.map`, `.js.map` files.

- [ ] **Step 4: Verify plugin exports**

```bash
node -e "import('./dist/index.js').then(m => console.log('id:', m.default.id, 'server:', typeof m.default.server))"
```
Expected: `id: auto-continue server: function`
