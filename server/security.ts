import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { config } from './config.js';
import { AppError } from './errors.js';
import { authSessionExists } from './db.js';

export const AUTH_COOKIE = 'ssh_workbench_session';

export function createOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('base64url');
}

export function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  const result: Record<string, string> = {};
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 1) continue;
    const name = part.slice(0, separator).trim();
    const rawValue = part.slice(separator + 1).trim();
    try {
      result[name] = decodeURIComponent(rawValue);
    } catch {
      // Ignore malformed cookies without invalidating other values in the header.
    }
  }
  return result;
}

export function requestToken(request: IncomingMessage): string | undefined {
  return parseCookies(request.headers.cookie)[AUTH_COOKIE];
}

export function authenticatedTokenHash(request: IncomingMessage): string | undefined {
  const token = requestToken(request);
  if (!token) return undefined;
  const tokenHash = hashToken(token);
  return authSessionExists(tokenHash) ? tokenHash : undefined;
}

export function requestIsAuthenticated(request: IncomingMessage): boolean {
  return Boolean(authenticatedTokenHash(request));
}

export function requireAuthentication(request: Request, _response: Response, next: NextFunction): void {
  if (!requestIsAuthenticated(request)) {
    next(new AppError(401, 'UNAUTHENTICATED', '请先登录'));
    return;
  }
  next();
}

function headerValue(header: string | string[] | undefined): string | undefined {
  return Array.isArray(header) ? header[0] : header;
}

function requestOrigin(request: IncomingMessage): string | undefined {
  return headerValue(request.headers.origin)?.replace(/\/$/, '');
}

function effectiveExpectedOrigin(request: IncomingMessage): string | undefined {
  const forwardedHost = config.trustProxy ? headerValue(request.headers['x-forwarded-host']) : undefined;
  const host = forwardedHost ?? headerValue(request.headers.host);
  if (!host) return undefined;
  const forwardedProto = config.trustProxy ? headerValue(request.headers['x-forwarded-proto'])?.split(',')[0]?.trim() : undefined;
  const protocol = forwardedProto ?? ('encrypted' in request.socket && request.socket.encrypted ? 'https' : 'http');
  return `${protocol}://${host}`;
}

export function originIsAllowed(request: IncomingMessage): boolean {
  const origin = requestOrigin(request);
  if (!origin) return false;
  if (config.allowedOrigins.includes(origin)) return true;
  return origin === effectiveExpectedOrigin(request);
}

export const requireTrustedOrigin: RequestHandler = (request, _response, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    next();
    return;
  }
  if (!originIsAllowed(request)) {
    next(new AppError(403, 'ORIGIN_REJECTED', '请求来源不受信任'));
    return;
  }
  next();
};

export function constantTimeStringEqual(left: string, right: string): boolean {
  const leftDigest = createHash('sha256').update(left, 'utf8').digest();
  const rightDigest = createHash('sha256').update(right, 'utf8').digest();
  return timingSafeEqual(leftDigest, rightDigest);
}

export function authenticationCookieOptions(maxAgeMs: number) {
  return {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'strict' as const,
    path: '/',
    maxAge: maxAgeMs,
  };
}
