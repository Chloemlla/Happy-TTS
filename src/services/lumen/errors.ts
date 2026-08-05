import crypto from "node:crypto";

/**
 * API error with structured HTTP response format.
 */
export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly reasonCode?: string;

  constructor(message: string, statusCode: number, reasonCode?: string) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.reasonCode = reasonCode;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static badRequest(message: string): ApiError {
    return new ApiError(message, 400);
  }

  static unauthorized(message: string): ApiError {
    return new ApiError(message, 401);
  }

  static forbidden(message: string, reasonCode?: string): ApiError {
    return new ApiError(message, 403, reasonCode);
  }

  static notFound(message: string): ApiError {
    return new ApiError(message, 404);
  }

  static conflict(message: string): ApiError {
    return new ApiError(message, 409);
  }

  static tooManyRequests(message: string): ApiError {
    return new ApiError(message, 429);
  }

  static internal(message: string): ApiError {
    return new ApiError(message, 500);
  }

  toResponse(): { error: { code: number; reasonCode?: string; message: string } } {
    const body: { code: number; reasonCode?: string; message: string } = {
      code: this.statusCode,
      message: this.message,
    };
    if (this.reasonCode) {
      body.reasonCode = this.reasonCode;
    }
    return { error: body };
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}