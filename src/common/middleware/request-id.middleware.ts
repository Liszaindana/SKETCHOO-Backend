import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export function requestIdMiddleware(
  request: Request & { requestId?: string },
  response: Response,
  next: NextFunction,
) {
  const requestId = request.headers['x-request-id'];
  request.requestId =
    typeof requestId === 'string' && /^[\w.-]{1,128}$/.test(requestId)
      ? requestId
      : randomUUID();
  response.setHeader('x-request-id', request.requestId);
  next();
}
