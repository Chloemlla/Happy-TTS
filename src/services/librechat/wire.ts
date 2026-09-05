/**
 * LibreChat 通道线格式(wire)抽象:请求构建 + 响应解析的纯函数层。
 *
 * 三种可配置格式:
 *  - openai-chat:      OpenAI Chat Completions(POST /v1/chat/completions)—— 现状默认
 *  - openai-responses: OpenAI Responses API(POST /v1/responses)
 *  - anthropic:        Anthropic Messages API(POST /v1/messages)
 *
 * 本模块不发起任何网络请求、不读 env/DB,只做确定性的构造与解析,便于单测钉住。
 * 实际 axios 调用留在 libreChatService,按 provider.wire 分派到这里。
 */

export const CHAT_WIRE_FORMATS = ["openai-chat", "openai-responses", "anthropic"] as const;

export type ChatWireFormat = (typeof CHAT_WIRE_FORMATS)[number];

export const DEFAULT_CHAT_WIRE: ChatWireFormat = "openai-chat";

export function isChatWireFormat(value: unknown): value is ChatWireFormat {
  return typeof value === "string" && (CHAT_WIRE_FORMATS as readonly string[]).includes(value);
}

/** 空/非法一律回退默认(openai-chat),保证老数据零迁移、行为不变。 */
export function normalizeWire(value: unknown): ChatWireFormat {
  return isChatWireFormat(value) ? value : DEFAULT_CHAT_WIRE;
}

/** 上层已归一为 system/user/assistant;openai-chat 依赖 system 拼回 messages 首位。 */
export interface WireChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface WireBuildInput {
  baseUrl: string;
  apiKey: string;
  model: string;
  wire: ChatWireFormat;
  /** 顶层 system 提示;openai-chat 会拼回 messages[0] 以保持现状请求体逐字节一致。 */
  system: string;
  /** 用户/助手上下文(不含 system)。 */
  messages: WireChatMessage[];
  temperature: number;
  stream: boolean;
  maxTokens: number;
}

export interface WireRequestSpec {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

function joinEndpoint(baseUrl: string, path: string): string {
  return `${String(baseUrl || "").replace(/\/+$/, "")}${path}`;
}

/** 单条正文提取(openai-chat 现状 / anthropic content blocks / responses output)。 */
export function extractWireText(wire: ChatWireFormat, payload: unknown): string {
  const data = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  if (wire === "openai-responses") {
    const output = Array.isArray(data.output) ? data.output : [];
    const parts: string[] = [];
    for (const item of output) {
      const it = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      if (it.type !== "message") continue;
      const content = Array.isArray(it.content) ? it.content : [];
      for (const block of content) {
        const b = block && typeof block === "object" ? (block as Record<string, unknown>) : {};
        if (b.type === "output_text" && typeof b.text === "string") parts.push(b.text);
      }
    }
    return parts.join("");
  }
  if (wire === "anthropic") {
    const content = Array.isArray(data.content) ? data.content : [];
    const parts: string[] = [];
    for (const block of content) {
      const b = block && typeof block === "object" ? (block as Record<string, unknown>) : {};
      if (b.type === "text" && typeof b.text === "string") parts.push(b.text);
    }
    return parts.join("");
  }
  const choices = Array.isArray(data.choices) ? data.choices : [];
  const first = choices[0] && typeof choices[0] === "object" ? (choices[0] as Record<string, unknown>) : {};
  const message = first.message && typeof first.message === "object" ? (first.message as Record<string, unknown>) : {};
  return typeof message.content === "string" ? message.content : "";
}

/**
 * 构造一次上游请求。openai-chat 输出与改造前逐字节一致:
 * messages 首位为 system,body 固定含 model/messages/temperature/stream/max_tokens。
 */
export function buildWireRequest(input: WireBuildInput): WireRequestSpec {
  const { baseUrl, apiKey, model, wire, system, messages, temperature, stream, maxTokens } = input;
  if (wire === "openai-responses") {
    return {
      url: joinEndpoint(baseUrl, "/v1/responses"),
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: {
        model,
        instructions: system,
        input: messages.map((m) => ({ role: m.role, content: m.content })),
        ...(temperature === undefined ? {} : { temperature }),
        stream,
        max_output_tokens: maxTokens,
      },
    };
  }
  if (wire === "anthropic") {
    return {
      url: joinEndpoint(baseUrl, "/v1/messages"),
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: {
        model,
        max_tokens: maxTokens,
        system,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        ...(temperature === undefined ? {} : { temperature }),
        stream,
      },
    };
  }
  return {
    url: joinEndpoint(baseUrl, "/v1/chat/completions"),
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: {
      model,
      messages: [{ role: "system", content: system }, ...messages.map((m) => ({ role: m.role, content: m.content }))],
      temperature,
      stream,
      max_tokens: maxTokens,
    },
  };
}

export type WireStreamEvent = { kind: "text"; text: string } | { kind: "none" };

/**
 * 流式:把一个 SSE 的 data JSON(已 JSON.parse)按格式转成文本增量或空。
 * 结束事件(message_stop / response.completed)同样返回 none——流以 socket end 收尾,
 * 与 openai-chat 的 [DONE] 语义保持一致(那也在 socket end 前由上层跳过)。
 */
export function wireStreamEvent(wire: ChatWireFormat, obj: unknown): WireStreamEvent {
  const o = obj && typeof obj === "object" ? (obj as Record<string, unknown>) : {};
  if (wire === "openai-responses") {
    if (o.type === "response.output_text.delta" && typeof o.delta === "string") {
      return { kind: "text", text: o.delta };
    }
    return { kind: "none" };
  }
  if (wire === "anthropic") {
    if (
      o.type === "content_block_delta" &&
      o.delta &&
      typeof o.delta === "object" &&
      (o.delta as Record<string, unknown>).type === "text_delta" &&
      typeof (o.delta as Record<string, unknown>).text === "string"
    ) {
      return { kind: "text", text: (o.delta as Record<string, unknown>).text as string };
    }
    return { kind: "none" };
  }
  const choices = Array.isArray(o.choices) ? o.choices : [];
  const first = choices[0] && typeof choices[0] === "object" ? (choices[0] as Record<string, unknown>) : {};
  const delta = first.delta && typeof first.delta === "object" ? (first.delta as Record<string, unknown>) : {};
  return typeof delta.content === "string" ? { kind: "text", text: delta.content } : { kind: "none" };
}
