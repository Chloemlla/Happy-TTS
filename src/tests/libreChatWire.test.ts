import {
  buildWireRequest,
  extractWireText,
  normalizeWire,
  wireStreamEvent,
  DEFAULT_CHAT_WIRE,
} from "../services/librechat/wire";

const BASE = { baseUrl: "https://api.example.com/", apiKey: "sk-test", model: "m1", temperature: 0.7 };

const MSGS = [
  { role: "user" as const, content: "你好" },
  { role: "assistant" as const, content: "在的" },
];

describe("normalizeWire", () => {
  it("非法/空值一律回退 openai-chat", () => {
    expect(normalizeWire(undefined)).toBe("openai-chat");
    expect(normalizeWire(null)).toBe("openai-chat");
    expect(normalizeWire("")).toBe("openai-chat");
    expect(normalizeWire("weird")).toBe("openai-chat");
    expect(normalizeWire(123 as unknown)).toBe(DEFAULT_CHAT_WIRE);
  });
  it("三个合法值原样返回", () => {
    expect(normalizeWire("openai-chat")).toBe("openai-chat");
    expect(normalizeWire("openai-responses")).toBe("openai-responses");
    expect(normalizeWire("anthropic")).toBe("anthropic");
  });
});

describe("buildWireRequest", () => {
  it("openai-chat 保持现状:URL/鉴权头/system 首位/max_tokens", () => {
    const spec = buildWireRequest({ ...BASE, wire: "openai-chat", system: "SYS", messages: MSGS, stream: false, maxTokens: 2048 });
    expect(spec.url).toBe("https://api.example.com/v1/chat/completions");
    expect(spec.headers.Authorization).toBe("Bearer sk-test");
    expect(spec.body.model).toBe("m1");
    expect(spec.body.messages).toEqual([
      { role: "system", content: "SYS" },
      { role: "user", content: "你好" },
      { role: "assistant", content: "在的" },
    ]);
    expect(spec.body.max_tokens).toBe(2048);
    expect(spec.body.stream).toBe(false);
    expect(spec.body.temperature).toBe(0.7);
    expect(spec.body).not.toHaveProperty("max_output_tokens");
  });

  it("openai-responses:instructions/input/max_output_tokens", () => {
    const spec = buildWireRequest({ ...BASE, wire: "openai-responses", system: "SYS", messages: MSGS, stream: true, maxTokens: 512 });
    expect(spec.url).toBe("https://api.example.com/v1/responses");
    expect(spec.headers.Authorization).toBe("Bearer sk-test");
    expect(spec.body.instructions).toBe("SYS");
    expect(spec.body.input).toEqual([
      { role: "user", content: "你好" },
      { role: "assistant", content: "在的" },
    ]);
    expect(spec.body.max_output_tokens).toBe(512);
    expect(spec.body.stream).toBe(true);
    expect(spec.body).not.toHaveProperty("max_tokens");
    expect(spec.body).not.toHaveProperty("messages");
  });

  it("anthropic:x-api-key/system 顶层/messages/max_tokens,无 Bearer", () => {
    const spec = buildWireRequest({ ...BASE, wire: "anthropic", system: "SYS", messages: MSGS, stream: false, maxTokens: 2048 });
    expect(spec.url).toBe("https://api.example.com/v1/messages");
    expect(spec.headers["x-api-key"]).toBe("sk-test");
    expect(spec.headers["anthropic-version"]).toBe("2023-06-01");
    expect(spec.headers).not.toHaveProperty("Authorization");
    expect(spec.body.system).toBe("SYS");
    expect(spec.body.messages).toEqual([
      { role: "user", content: "你好" },
      { role: "assistant", content: "在的" },
    ]);
    expect(spec.body.max_tokens).toBe(2048);
    expect(spec.body).not.toHaveProperty("instructions");
  });

  it("baseUrl 尾斜杠被归一(不产生双斜杠)", () => {
    const spec = buildWireRequest({ ...BASE, baseUrl: "https://api.example.com///", wire: "openai-chat", system: "", messages: [], stream: false, maxTokens: 100 });
    expect(spec.url).toBe("https://api.example.com/v1/chat/completions");
  });
});

describe("extractWireText", () => {
  it("openai-chat:choices[0].message.content", () => {
    expect(extractWireText("openai-chat", { choices: [{ message: { content: "好" } }] })).toBe("好");
    expect(extractWireText("openai-chat", {})).toBe("");
  });
  it("openai-responses:output message output_text 拼接", () => {
    const data = {
      output: [
        { type: "message", content: [{ type: "output_text", text: "前" }, { type: "output_text", text: "后" }] },
        { type: "function_call", name: "x" },
      ],
    };
    expect(extractWireText("openai-responses", data)).toBe("前后");
  });
  it("anthropic:content text 块拼接", () => {
    expect(extractWireText("anthropic", { content: [{ type: "text", text: "甲" }, { type: "text", text: "乙" }] })).toBe("甲乙");
  });
});

describe("wireStreamEvent", () => {
  it("openai-chat delta.content", () => {
    expect(wireStreamEvent("openai-chat", { choices: [{ delta: { content: "哎" } }] })).toEqual({ kind: "text", text: "哎" });
    expect(wireStreamEvent("openai-chat", { choices: [{ delta: {} }] })).toEqual({ kind: "none" });
  });
  it("anthropic content_block_delta.text_delta", () => {
    expect(wireStreamEvent("anthropic", { type: "content_block_delta", delta: { type: "text_delta", text: "哟" } })).toEqual({ kind: "text", text: "哟" });
    expect(wireStreamEvent("anthropic", { type: "message_stop" })).toEqual({ kind: "none" });
    expect(wireStreamEvent("anthropic", { type: "content_block_start" })).toEqual({ kind: "none" });
  });
  it("openai-responses response.output_text.delta", () => {
    expect(wireStreamEvent("openai-responses", { type: "response.output_text.delta", delta: "嗨" })).toEqual({ kind: "text", text: "嗨" });
    expect(wireStreamEvent("openai-responses", { type: "response.completed" })).toEqual({ kind: "none" });
  });
});
