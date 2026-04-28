export class TtsRequestError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly retryable: boolean;

  constructor(statusCode: number, message: string, code = "TTS_REQUEST_ERROR", retryable = false) {
    super(message);
    this.name = "TtsRequestError";
    this.statusCode = statusCode;
    this.code = code;
    this.retryable = retryable;
  }
}

export class TtsGenerationError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly retryable: boolean;

  constructor(message: string, statusCode = 502, code = "TTS_GENERATION_FAILED", retryable = true) {
    super(message);
    this.name = "TtsGenerationError";
    this.statusCode = statusCode;
    this.code = code;
    this.retryable = retryable;
  }
}

