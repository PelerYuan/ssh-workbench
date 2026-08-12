import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import { authRouter } from './auth.js';
import { config, paths } from './config.js';
import { databaseIsHealthy, db } from './db.js';
import { errorHandler, notFoundHandler } from './errors.js';
import { requireAuthentication, requireTrustedOrigin } from './security.js';
import { sessionRouter } from './sessions.js';
import { sourceRouter } from './sources.js';
import { configureWebSocket } from './websocket.js';

const isEntryPoint = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);

export function createApplication() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  // upgrade-insecure-requests tells browsers to load sub-resources over HTTPS.
  // On a plain-HTTP deployment (COOKIE_SECURE=false) this blocks the JS bundle
  // from loading and produces a blank page. Pass useDefaults:false and supply
  // all directives manually so we can conditionally omit this one.
  const defaults = helmet.contentSecurityPolicy.getDefaultDirectives();
  const { 'upgrade-insecure-requests': _uir, ...baseDirectives } = defaults;
  const cspDirectives = config.cookieSecure
    ? defaults
    : baseDirectives;
  app.use(helmet({
    contentSecurityPolicy: config.isProduction
      ? { useDefaults: false, directives: cspDirectives }
      : false,
    crossOriginEmbedderPolicy: false,
  }));
  app.use(express.json({ limit: '1.2mb', strict: true }));

  app.get('/api/health', (_request, response) => {
    try {
      if (!databaseIsHealthy()) throw new Error('database returned an unexpected result');
      response.json({ status: 'ok' });
    } catch (error) {
      console.error('Health check failed', error);
      response.status(503).json({ status: 'unavailable' });
    }
  });

  app.use('/api/auth', requireTrustedOrigin, authRouter);
  app.use('/api/sources', requireAuthentication, requireTrustedOrigin, sourceRouter);
  app.use('/api/sessions', requireAuthentication, requireTrustedOrigin, sessionRouter);

  if (fs.existsSync(paths.staticFiles)) {
    app.use(express.static(paths.staticFiles, { index: false, maxAge: config.isProduction ? '1h' : 0 }));
    app.get('*', (request, response, next) => {
      if (request.path.startsWith('/api/') || request.path.startsWith('/ws/')) {
        next();
        return;
      }
      response.sendFile(path.join(paths.staticFiles, 'index.html'));
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

export function createServer() {
  const server = http.createServer(createApplication());
  const websocketServer = configureWebSocket(server);
  return { server, websocketServer };
}

if (isEntryPoint) {
  const { server, websocketServer } = createServer();
  server.listen(config.port, config.host, () => {
    console.log(`SSH Workbench listening on http://${config.host}:${config.port}`);
  });

  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`Received ${signal}; shutting down`);
    websocketServer.clients.forEach((client) => client.close(1012, 'server_restart'));
    websocketServer.close();
    server.close(() => {
      db.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
}
