import { describe, expect, test, beforeEach } from "bun:test"
import { createHooks } from "../src/create-hooks.js"
import { AUTO_CONTINUE_DEFAULTS, type AutoContinueConfig } from "../src/config/schema.js"

function makeClient() {
  const calls: Array<{ path: { id: string }; body: { parts: Array<{ type: string; text: string }> } }> = []
  const prompt = async (opts: any) => {
    calls.push({ path: opts.path, body: opts.body })
    return { data: undefined, error: undefined, response: new Response() }
  }
  return { session: { prompt }, calls }
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
    expect(client.calls.length).toBe(1)
  })

  test("should track separate sessions independently", async () => {
    await hooks.event!(makeEvent("session.error", {
      sessionID: "sess-1",
      error: { name: "ApiError", data: { message: "err" } },
    }))
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

    await localHooks.event!(makeEvent("session.error", {
      sessionID: "sess-1",
      error: { name: "ApiError", data: { message: "err1" } },
    }))
    await localHooks.event!(makeEvent("session.status", {
      sessionID: "sess-1",
      status: { type: "idle" },
    }))

    await localHooks.event!(makeEvent("session.error", {
      sessionID: "sess-1",
      error: { name: "ApiError", data: { message: "err2" } },
    }))
    await localHooks.event!(makeEvent("session.status", {
      sessionID: "sess-1",
      status: { type: "idle" },
    }))

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
