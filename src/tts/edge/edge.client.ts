import { WebSocket } from "ws";
import { TtsGenerationError } from "../tts.errors";
import { generateEdgeMuid, generateEdgeSecMsGec, parseEdgeClockSkewSeconds } from "./edge.drm";
import {
  EDGE_ACCEPT_LANGUAGE,
  EDGE_AUDIO_CONTENT_TYPE,
  EDGE_MAX_HANDSHAKE_ATTEMPTS,
  EDGE_ORIGIN,
  EDGE_SEC_MS_GEC_VERSION,
  EDGE_SYNTHESIS_TIMEOUT_MS,
  EDGE_TRUSTED_CLIENT_TOKEN,
  EDGE_USER_AGENT,
  EDGE_VOICE_LIST_TIMEOUT_MS,
  buildEdgeSpeechConfigMessage,
  buildEdgeSsmlMessage,
  buildEdgeVoiceListUrl,
  createEdgeConnectionId,
  createEdgeRequestId,
} from "./edge.protocol";

/** 便于测试注入的 WebSocket 最小接口。 */
export interface EdgeWebSocketLike {
  on(event: "open", listener: () => void): unknown;
  on(event: "message", listener: (data: unknown, isBinary: boolean) => void): unknown;
  on(event: "error", listener: (error: Error) => void): unknown;
  on(event: "close", listener: (code: number, reason: unknown) => void): unknown;
  on(
    event: "unexpected-response",
    listener: (request: unknown, response: EdgeHandshakeResponse) => void,
  ): unknown;
  send(data: string): void;
  close(): void;
  terminate(): void;
}

export interface EdgeHandshakeResponse {
  statusCode?: number;
  headers: { get?(name: string): string | null } & Record<string, unknown>;
}

export interface EdgeWebSocketOptions {
  headers: Record<string, string>;
}

export type EdgeWebSocketFactory = (url: string, options: EdgeWebSocketOptions) => EdgeWebSocketLike;

export interface EdgeSynthesisInput {
  text: string;
  voice: string;
  speed: number;
  baseUrl: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface EdgeSynthesisResult {
  audio: Buffer;
  contentType: string;
}

/** 握手被上游以 HTTP 状态码拒绝（403 通常意味着本机时钟偏差）。 */
class EdgeHandshakeError extends TtsGenerationError {
  constructor(
    public readonly upstreamStatusCode: number,
    message: string,
  ) {
    super(
      message,
      502,
      upstreamStatusCode === 403 ? "TTS_UPSTREAM_AUTH_FAILED" : "TTS_UPSTREAM_UNAVAILABLE",
      upstreamStatusCode === 403,
    );
    this.name = "EdgeHandshakeError";
  }
}

function readEdgeHeader(headers: string, name: string): string | null {
  const match = new RegExp(`^${name}:\\s*(.+)$`, "im").exec(headers);
  return match ? (match[1] as string).trim() : null;
}

function toBuffer(data: unknown): Buffer {
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  if (Array.isArray(data)) return Buffer.concat(data as Buffer[]);
  return Buffer.from(String(data), "utf8");
}

export class EdgeTtsClient {
  /** 累积的时钟偏移（秒），源自上游 Date 头；与参考实现一致采用累加而非覆盖。 */
  private clockSkewSeconds = 0;

  constructor(
    private readonly createSocket: EdgeWebSocketFactory = (url, options) =>
      new WebSocket(url, options) as unknown as EdgeWebSocketLike,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  public getClockSkewSeconds(): number {
    return this.clockSkewSeconds;
  }

  public async synthesize(input: EdgeSynthesisInput): Promise<EdgeSynthesisResult> {
    let lastError: unknown = null;

    for (let attempt = 0; attempt < EDGE_MAX_HANDSHAKE_ATTEMPTS; attempt += 1) {
      try {
        return await this.runTurn(input);
      } catch (error) {
        if (!(error instanceof EdgeHandshakeError) || error.upstreamStatusCode !== 403) {
          throw error;
        }
        lastError = error;
        const corrected = await this.refreshClockSkewFromVoiceList(input.baseUrl);
        if (!corrected) throw error;
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new TtsGenerationError("微软语音握手失败", 502, "TTS_UPSTREAM_UNAVAILABLE", true);
  }

  public async fetchVoiceCatalog(baseUrl: string): Promise<unknown> {
    const url = this.buildVoiceListUrl(baseUrl);
    let response = await this.requestVoiceList(url);
    if (response.status === 403) {
      const skew = parseEdgeClockSkewSeconds(readDateHeader(response.headers));
      if (skew) {
        this.clockSkewSeconds += skew;
        response = await this.requestVoiceList(this.buildVoiceListUrl(baseUrl));
      }
    }
    if (!response.ok) {
      throw new TtsGenerationError(
        `微软语音音色列表请求失败（${response.status}）`,
        response.status >= 500 ? 502 : 400,
        "TTS_UPSTREAM_UNAVAILABLE",
        true,
      );
    }
    return response.json();
  }

  private buildVoiceListUrl(baseUrl: string): string {
    const params = new URLSearchParams({
      trustedclienttoken: EDGE_TRUSTED_CLIENT_TOKEN,
      "Sec-MS-GEC": generateEdgeSecMsGec(Date.now(), this.clockSkewSeconds),
      "Sec-MS-GEC-Version": EDGE_SEC_MS_GEC_VERSION,
    });
    return `${buildEdgeVoiceListUrl(baseUrl)}?${params.toString()}`;
  }

  private requestVoiceList(url: string): Promise<Response> {
    return this.fetchImpl(url, {
      method: "GET",
      headers: {
        "User-Agent": EDGE_USER_AGENT,
        "Accept-Language": EDGE_ACCEPT_LANGUAGE,
        Cookie: `muid=${generateEdgeMuid()};`,
      },
      signal: AbortSignal.timeout(EDGE_VOICE_LIST_TIMEOUT_MS),
    });
  }

  private async refreshClockSkewFromVoiceList(baseUrl: string): Promise<boolean> {
    try {
      const response = await this.requestVoiceList(this.buildVoiceListUrl(baseUrl));
      const skew = parseEdgeClockSkewSeconds(readDateHeader(response.headers));
      if (!skew) return false;
      this.clockSkewSeconds += skew;
      return true;
    } catch {
      return false;
    }
  }

  private buildConnectionUrl(baseUrl: string): string {
    const params = new URLSearchParams({
      TrustedClientToken: EDGE_TRUSTED_CLIENT_TOKEN,
      ConnectionId: createEdgeConnectionId(),
      "Sec-MS-GEC": generateEdgeSecMsGec(Date.now(), this.clockSkewSeconds),
      "Sec-MS-GEC-Version": EDGE_SEC_MS_GEC_VERSION,
    });
    return `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}${params.toString()}`;
  }

  private runTurn(input: EdgeSynthesisInput): Promise<EdgeSynthesisResult> {
    const url = this.buildConnectionUrl(input.baseUrl);
    const timeoutMs = input.timeoutMs ?? EDGE_SYNTHESIS_TIMEOUT_MS;

    return new Promise<EdgeSynthesisResult>((resolve, reject) => {
      const chunks: Buffer[] = [];
      let contentType = EDGE_AUDIO_CONTENT_TYPE;
      let settled = false;
      let socket: EdgeWebSocketLike | null = null;
      let timer: ReturnType<typeof setTimeout> | null = null;

      const onAbort = () => finish(new TtsGenerationError("微软语音合成已取消", 499, "TTS_ABORTED", false));

      const finish = (error?: Error, value?: EdgeSynthesisResult) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        input.signal?.removeEventListener("abort", onAbort);
        try {
          socket?.close();
        } catch {
          /* 连接已断开 */
        }
        if (error) reject(error);
        else resolve(value as EdgeSynthesisResult);
      };

      if (input.signal?.aborted) {
        finish(new TtsGenerationError("微软语音合成已取消", 499, "TTS_ABORTED", false));
        return;
      }
      input.signal?.addEventListener("abort", onAbort);

      timer = setTimeout(() => {
        finish(new TtsGenerationError("微软语音合成超时，请稍后重试", 504, "TTS_UPSTREAM_TIMEOUT", true));
      }, timeoutMs);

      try {
        socket = this.createSocket(url, {
          headers: {
            Pragma: "no-cache",
            "Cache-Control": "no-cache",
            Origin: EDGE_ORIGIN,
            "User-Agent": EDGE_USER_AGENT,
            "Accept-Encoding": "gzip, deflate, br",
            "Accept-Language": EDGE_ACCEPT_LANGUAGE,
            Cookie: `muid=${generateEdgeMuid()};`,
          },
        });
      } catch (error) {
        finish(
          new TtsGenerationError(
            `微软语音连接失败：${error instanceof Error ? error.message : String(error)}`,
            502,
            "TTS_UPSTREAM_UNAVAILABLE",
            true,
          ),
        );
        return;
      }

      socket.on("unexpected-response", (_request, response) => {
        const statusCode = Number(response?.statusCode ?? 0) || 502;
        finish(
          new EdgeHandshakeError(
            statusCode,
            statusCode === 403
              ? "微软语音拒绝握手（时钟偏差）"
              : `微软语音握手失败（${statusCode}）`,
          ),
        );
      });

      socket.on("error", (error) => {
        finish(
          new TtsGenerationError(
            `微软语音连接异常：${error instanceof Error ? error.message : String(error)}`,
            502,
            "TTS_UPSTREAM_UNAVAILABLE",
            true,
          ),
        );
      });

      socket.on("close", () => {
        finish(
          new TtsGenerationError("微软语音连接提前关闭，未收到完整音频", 502, "TTS_EMPTY_PROVIDER_RESPONSE", true),
        );
      });

      socket.on("message", (data, isBinary) => {
        if (isBinary) {
          const buffer = toBuffer(data);
          if (buffer.length < 2) return;
          const headerLength = buffer.readUInt16BE(0);
          const headers = buffer.subarray(2, 2 + headerLength).toString("utf8");
          const payload = buffer.subarray(2 + headerLength);
          const path = readEdgeHeader(headers, "Path");
          const frameContentType = readEdgeHeader(headers, "Content-Type");
          const isAudio = path === "audio" || (!path && /^audio\//i.test(frameContentType ?? ""));
          if (isAudio && payload.length > 0) {
            chunks.push(payload);
            if (frameContentType) contentType = frameContentType;
          }
          return;
        }

        const text = toBuffer(data).toString("utf8");
        const separator = text.indexOf("\r\n\r\n");
        const headers = separator >= 0 ? text.slice(0, separator) : text;
        if (readEdgeHeader(headers, "Path") !== "turn.end") return;

        if (!chunks.length) {
          finish(new TtsGenerationError("微软语音未返回音频数据", 502, "TTS_EMPTY_PROVIDER_RESPONSE", true));
          return;
        }
        finish(undefined, { audio: Buffer.concat(chunks), contentType });
      });

      socket.on("open", () => {
        try {
          socket?.send(buildEdgeSpeechConfigMessage());
          socket?.send(
            buildEdgeSsmlMessage(input.text, input.voice, input.speed, {
              requestId: createEdgeRequestId(),
            }),
          );
        } catch (error) {
          finish(
            new TtsGenerationError(
              `微软语音请求发送失败：${error instanceof Error ? error.message : String(error)}`,
              502,
              "TTS_UPSTREAM_UNAVAILABLE",
              true,
            ),
          );
        }
      });
    });
  }
}

function readDateHeader(headers: Response["headers"]): string | null {
  if (!headers || typeof headers.get !== "function") return null;
  return headers.get("date");
}
