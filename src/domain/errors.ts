// Error codes and HTTP status mapping exactly as specified in SDS Section 12.2 (Table 59).
export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'UNPROCESSABLE'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'
  | 'SERVICE_UNAVAILABLE';

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE: 422,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
};

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly status: number;
  public readonly details?: unknown[];

  constructor(code: ErrorCode, message: string, details?: unknown[]) {
    super(message);
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.details = details;
    Object.setPrototypeOf(this, AppError.prototype);
  }

  static validation(message: string, details?: unknown[]) {
    return new AppError('VALIDATION_ERROR', message, details);
  }
  static unauthenticated(message = 'Missing, expired, or invalid access token') {
    return new AppError('UNAUTHENTICATED', message);
  }
  static forbidden(message = 'Insufficient permission') {
    return new AppError('FORBIDDEN', message);
  }
  static notFound(message = 'Resource not found') {
    // Section 14.1: a resource in another org is never distinguished from true
    // absence — callers must always throw NOT_FOUND, never FORBIDDEN, for
    // cross-tenant lookups, so an attacker cannot even confirm the ID exists.
    return new AppError('NOT_FOUND', message);
  }
  static conflict(message: string, details?: unknown[]) {
    return new AppError('CONFLICT', message, details);
  }
  static unprocessable(message: string, details?: unknown[]) {
    return new AppError('UNPROCESSABLE', message, details);
  }
}
