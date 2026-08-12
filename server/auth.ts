import type { RequestHandler } from 'express';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { revokeAuthenticatedSockets } from './authenticatedSockets.js';
import { config } from './config.js';
import {
  createAuthSession,
  deleteAuthSession,
  removeExpiredAuthSessions,
  verifyApplicationPassword,
} from './db.js';
import { AppError } from './errors.js';
import {
  AUTH_COOKIE,
  authenticationCookieOptions,
  createOpaqueToken,
  hashToken,
  requestIsAuthenticated,
  requestToken,
} from './security.js';
import { loginSchema } from './validation.js';

const sessionDurationMs = config.sessionDays * 24 * 60 * 60 * 1000;
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: (_request, response) => {
    response.status(429).json({
      error: { code: 'LOGIN_RATE_LIMITED', message: '登录尝试过于频繁，请稍后再试' },
    });
  },
});

export const authRouter = Router();

function revokeToken(token: string): void {
  const tokenHash = hashToken(token);
  deleteAuthSession(tokenHash);
  revokeAuthenticatedSockets(tokenHash);
}

authRouter.get('/session', ((request, response) => {
  response.json({ authenticated: requestIsAuthenticated(request) });
}) as RequestHandler);

authRouter.post('/login', loginLimiter, ((request, response) => {
  const input = loginSchema.parse(request.body);
  if (!verifyApplicationPassword(input.password)) {
    throw new AppError(401, 'INVALID_PASSWORD', '登录密码错误');
  }

  removeExpiredAuthSessions();
  const oldToken = requestToken(request);
  if (oldToken) revokeToken(oldToken);
  const token = createOpaqueToken();
  createAuthSession(hashToken(token), Date.now() + sessionDurationMs);
  response.cookie(AUTH_COOKIE, token, authenticationCookieOptions(sessionDurationMs));
  response.json({ authenticated: true });
}) as RequestHandler);

authRouter.post('/logout', ((request, response) => {
  const token = requestToken(request);
  if (token) revokeToken(token);
  response.clearCookie(AUTH_COOKIE, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'strict',
    path: '/',
  });
  response.status(204).end();
}) as RequestHandler);
