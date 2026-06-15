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
