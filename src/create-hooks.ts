import type { Hooks, PluginInput } from "@opencode-ai/plugin"
import type { AutoContinueConfig } from "./config/schema.js"

type ErrorData = { errorMessage: string }

export function createHooks(
  client: PluginInput["client"],
  config: AutoContinueConfig,
): Hooks {
  const erroredSessions = new Map<string, ErrorData>()
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

  function getErrorMessage(error: unknown): string {
    if (typeof error === "object" && error !== null) {
      const err = error as Record<string, unknown>
      const data = err.data
      if (typeof data === "object" && data !== null) {
        return typeof (data as Record<string, unknown>).message === "string"
          ? (data as Record<string, unknown>).message as string
          : ""
      }
    }
    return ""
  }

  return {
    event: async (input) => {
      const evt = input.event as { type: string; properties: Record<string, unknown> }
      const props = evt.properties

      if (evt.type === "session.error") {
        const sessionID = props.sessionID
        const error = props.error
        if (typeof sessionID !== "string" || !error) return

        const errorName = typeof error === "object" && error !== null
          ? String((error as Record<string, unknown>).name ?? "")
          : ""
        if (config.ignoredErrorTypes.includes(errorName)) return
        if (isContinueLoop(sessionID)) return

        erroredSessions.set(sessionID, { errorMessage: getErrorMessage(error) })
        return
      }

      if (evt.type === "session.status") {
        const status = props.status
        if (
          typeof status !== "object" || status === null ||
          (status as Record<string, unknown>).type !== "idle"
        ) return

        const sessionID = props.sessionID
        if (typeof sessionID !== "string") return
        if (!erroredSessions.has(sessionID)) return

        erroredSessions.delete(sessionID)
        incrementContinueCount(sessionID)

        setTimeout(async () => {
          try {
            await (client.session as any).prompt({
              path: { id: sessionID },
              body: {
                parts: [{ type: "text", text: config.text }],
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
