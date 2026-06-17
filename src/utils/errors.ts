export type ErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'VALIDATION_ERROR'
  | 'PAYLOAD_TOO_LARGE'
  | 'TEMPLATE_NOT_FOUND'
  | 'TEMPLATE_NOT_ALLOWED'
  | 'RENDER_FAILED'
  | 'JOB_NOT_FOUND'
  | 'JOB_EXPIRED'
  | 'INTERNAL_ERROR';

export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public statusCode = 500,
    public details?: unknown
  ) {
    super(message);
  }
}
