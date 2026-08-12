import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError } from 'zod';

export type ApiErrorBody = {
  code: string;
  message: string;
  details?: unknown;
};

export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function asyncRoute(
  handler: (request: Request, response: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (request, response, next) => {
    void handler(request, response, next).catch(next);
  };
}

export function notFoundHandler(_request: Request, response: Response): void {
  response.status(404).json({
    error: { code: 'NOT_FOUND', message: '请求的资源不存在' },
  });
}

export function errorHandler(
  error: unknown,
  _request: Request,
  response: Response,
  _next: NextFunction,
): void {
  if (error instanceof ZodError) {
    response.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: '请求参数无效',
        details: error.flatten(),
      },
    });
    return;
  }

  if (error instanceof AppError) {
    const body: ApiErrorBody = { code: error.code, message: error.message };
    if (error.details !== undefined) body.details = error.details;
    response.status(error.status).json({ error: body });
    return;
  }

  if (error instanceof SyntaxError && 'body' in error) {
    response.status(400).json({
      error: { code: 'INVALID_JSON', message: '请求正文不是有效的 JSON' },
    });
    return;
  }

  console.error('Unhandled request error', error instanceof Error ? error.stack : error);
  response.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: '服务器内部错误' },
  });
}
