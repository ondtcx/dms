import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';
import { AUDIT_REQUEST_ID_HEADER } from './audit.constants';
import { RequestContextService } from './request-context.service';

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(private readonly context: RequestContextService) {}

  use(request: Request, response: Response, next: NextFunction): void {
    const requestId = this.resolveRequestId(request);
    response.setHeader(AUDIT_REQUEST_ID_HEADER, requestId);

    this.context.run(
      {
        actor: null,
        ipAddress: this.resolveIpAddress(request),
        userAgent: request.headers['user-agent'] ?? null,
        requestId,
      },
      next,
    );
  }

  private resolveRequestId(request: Request): string {
    const header = request.headers[AUDIT_REQUEST_ID_HEADER];
    const candidate = Array.isArray(header) ? header[0] : header;
    return candidate?.trim() ? candidate.trim() : randomUUID();
  }

  private resolveIpAddress(request: Request): string | null {
    const forwarded = request.headers['x-forwarded-for'];
    const first = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    if (first) return first.split(',')[0].trim();
    return request.ip ?? request.socket?.remoteAddress ?? null;
  }
}
