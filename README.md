# @zhoudqa/oc-auto-continue

OpenCode plugin that automatically sends a continue message when a session encounters an error.

## How it works

1. Listens for `session.error` events and records the error
2. When the session becomes idle after an error, it auto-sends a configured message (default: "继续")
3. If the error was context-too-large, it compacts the session first before sending

## Install

```json
// opencode.jsonc
{
  "plugins": ["@zhoudqa/oc-auto-continue"]
}
```

## Configuration

Config file locations (loaded and merged, project overrides user):

- `~/.config/opencode/auto-continue.jsonc` — user-wide
- `.opencode/auto-continue.jsonc` — per-project

```jsonc
{
  // Text to send when continuing (default: "继续")
  "text": "继续",

  // Delay before auto-continue in ms (default: 1000)
  "delay": 1000,

  // Max auto-continue attempts per time window (default: 5)
  "maxContinues": 5,

  // Time window for rate limiting in ms (default: 60000)
  "windowMs": 60000,

  // Error type names to ignore (default: ["MessageAbortedError"])
  "ignoredErrorTypes": ["MessageAbortedError"],

  // Error message patterns that indicate context-too-large (default patterns)
  "contextTooLargePatterns": [
    "请求上下文过大",
    "context length",
    "too large",
    "maximum context",
    "token limit"
  ]
}
```
