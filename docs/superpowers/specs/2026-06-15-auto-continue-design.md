# Auto-Continue: OpenCode 插件设计文档

## 概述

在公司内网使用 OpenCode 时，模型限流、网络超时等错误频繁发生，每次都需要人工输入"继续"才能恢复。Auto-Continue 插件自动检测 OpenCode 会话错误，无需人工干预地发送"继续"消息。

## 架构

插件运行在 OpenCode 服务端进程中，是一个标准 `@opencode-ai/plugin` 插件。

### 事件驱动状态机

```
                    ┌──────────────┐
       session.error │              │ session.status(idle)
     ───────────────>│  ERRORED     │─────────────────> 发"继续"
                    │              │
                    └──────────────┘
```

- **入口**：`event` hook 监听 `session.error` 和 `session.status` 两个事件
- **状态跟踪**：内存 `Map<sessionID, { errorMessage: string }>`
- **发送机制**：`client.session.prompt()` 发送文本消息

### 核心流程

```
session.error → 标记 errored=true → session.status(idle) → session.prompt("继续") → 清标志
```

## 配置

### 配置 Schema

```typescript
interface AutoContinueConfig {
  text: string                    // 发送的文本，默认 "继续"
  delay: number                   // idle 后等待毫秒数，默认 500
  maxContinues: number            // 连续最大次数防循环，默认 5
  windowMs: number                // 连续次数统计窗口（毫秒），默认 60000
  ignoredErrorTypes: string[]     // 忽略的错误类型，默认 ["MessageAbortedError"]
}
```

### 配置加载

优先级（高→低）：

1. 项目配置 `.opencode/auto-continue.jsonc`
2. 用户配置 `~/.config/opencode/auto-continue.jsonc`
3. 插件内置默认值

## 错误类型处理

| 错误类型 | 是否自动继续 | 说明 |
|---------|------------|------|
| ApiError (isRetryable=true) | ✅ | 限流、超时等可重试错误 |
| ApiError (isRetryable=false) | ✅ | 也自动继续，尝试恢复 |
| ProviderAuthError | ✅ | 认证问题，发送继续尝试恢复 |
| MessageOutputLengthError | ✅ | 输出超长后继续 |
| UnknownError | ✅ | 未知错误也继续 |
| MessageAbortedError | ❌ | 用户主动中断，不自动继续 |

### 错误去重

对同一个 session 的连续相同错误消息（按 `error.data.message` 比较），只触发一次 auto-continue。

### 循环保护

- 统计 `windowMs` 内的连续 auto-continue 次数
- 达到 `maxContinues` 后暂停 auto-continue
- 需要用户手动发送一次消息后重置计数

## 边界情况

- **启动时已存在的 session**：不处理历史错误，只从插件加载后的新事件开始
- **连续错误循环**：`maxContinues` 保护
- **多个 session 并发**：每个 session 独立跟踪状态
- **插件卸载**：内存状态自动释放

## 项目结构

```
auto-continue/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # 插件入口 PluginModule
│   ├── create-hooks.ts       # 创建 event hook
│   ├── config.ts             # 配置加载
│   └── config/
│       └── schema.ts         # Zod schema
```

## 文件职责

### src/index.ts

- `serverPlugin` 函数：加载配置 → 创建 hooks → 返回
- `pluginModule` 导出：id 为 `"auto-continue"`

### src/create-hooks.ts

- 维护 `erroredSessions` 状态 Map
- 维护 `continueCounts` 计数 Map
- 返回 `event` hook 实现

### src/config.ts

- 读取 `.opencode/auto-continue.jsonc`（项目级）
- 读取 `~/.config/opencode/auto-continue.jsonc`（用户级）
- 解析 JSONC 后合并、校验

### src/config/schema.ts

- Zod schema 定义
- 默认值常量

## 安装与配置

```bash
# 安装
bun add @scope/auto-continue
```

OpenCode 配置（`.opencode/config.json`）：

```json
{
  "plugin": ["./auto-continue/dist/index.js"]
}
```

可选配置（`.opencode/auto-continue.jsonc`）：

```jsonc
{
  "text": "继续",
  "delay": 500,
  "maxContinues": 5,
  "windowMs": 60000,
  "ignoredErrorTypes": ["MessageAbortedError"]
}
```

不配置则全部使用默认值。
