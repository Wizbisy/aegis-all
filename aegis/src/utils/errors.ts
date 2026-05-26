/**
 * Base application error.
 * Includes HTTP status, a machine-readable code, and optional structured metadata.
 */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code = 'APP_ERROR',
    public readonly metadata: Record<string, unknown> = {},
    public readonly expose = true,
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

/** 400 Bad Request: Invalid input or state */
export class ValidationError extends AppError {
  constructor(message: string, metadata: Record<string, unknown> = {}) {
    super(400, message, 'VALIDATION_ERROR', metadata);
  }
}

/** 401 Unauthorized: Missing or invalid credentials */
export class AuthError extends AppError {
  constructor(message = 'Authentication required') {
    super(401, message, 'UNAUTHORIZED');
  }
}

/** 403 Forbidden: Insufficient permissions */
export class ForbiddenError extends AppError {
  constructor(message = 'Permission denied') {
    super(403, message, 'FORBIDDEN');
  }
}

/** 404 Not Found: Resource does not exist */
export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super(404, `${resource} ${id ? `(${id}) ` : ''}not found`, 'NOT_FOUND', { resource, id });
  }
}

/** 409 Conflict: Resource state conflict or idempotency failure */
export class ConflictError extends AppError {
  constructor(message: string, code = 'CONFLICT') {
    super(409, message, code);
  }
}

/** 429 Too Many Requests: Rate limit exceeded */
export class RateLimitError extends AppError {
  constructor(message = 'Rate limit exceeded', metadata: Record<string, unknown> = {}) {
    super(429, message, 'RATE_LIMITED', metadata);
  }
}

/** 502/503/504: External service or infrastructure failure */
export class InfrastructureError extends AppError {
  constructor(message: string, code = 'INFRASTRUCTURE_ERROR', metadata: Record<string, unknown> = {}) {
    super(502, message, code, metadata);
  }
}

/**
 * Maps any error (AppError or native) to a consistent HTTP response structure.
 */
export function toHttpError(error: unknown) {
  if (error instanceof AppError) {
    return {
      status: error.status,
      body: {
        success: false,
        error: error.expose ? error.message : 'Internal server error',
        code: error.code,
        ...(Object.keys(error.metadata).length > 0 ? { metadata: error.metadata } : {}),
      },
    };
  }

  if (error && typeof error === 'object' && 'name' in error && error.name === 'ZodError') {
    return {
      status: 400,
      body: {
        success: false,
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        metadata: { issues: (error as any).issues },
      },
    };
  }

  return {
    status: 500,
    body: {
      success: false,
      error: 'Internal server error',
      code: 'INTERNAL_SERVER_ERROR',
    },
  };
}

/**
 * Helper to wrap Circle SDK errors into standardized AppErrors.
 */
export function mapCircleError(err: any): Error {
  const code = err?.response?.data?.code || err?.code || 'CIRCLE_ERROR';
  const message = err?.response?.data?.message || err?.message || 'Unknown Circle error';
  const status = err?.response?.status || 502;

  if (status === 404) return new NotFoundError('Circle resource');
  if (status === 401 || status === 403) return new AuthError('Circle API authentication failed');
  if (status === 429) return new RateLimitError('Circle API rate limit exceeded');
  
  return new InfrastructureError(`Circle API error: ${message}`, `CIRCLE_${String(code).toUpperCase()}`);
}
