import { Request, Response, NextFunction } from 'express';
import { IdempotencyService } from '../services/idempotencyService';

// Shared instance across the server lifecycle
export const globalIdempotencyService = new IdempotencyService();

export function idempotencyMiddleware(req: Request, res: Response, next: NextFunction) {
  // Only apply to mutation methods
  if (req.method !== 'POST' && req.method !== 'PUT' && req.method !== 'PATCH' && req.method !== 'DELETE') {
    return next();
  }

  const idempotencyKey = (req.headers['idempotency-key'] || req.headers['x-request-id']) as string;
  
  if (!idempotencyKey) {
    return next();
  }

  // Namespace by tenant to prevent cross-tenant key collision attacks
  const tenantId = (req as any).tenantId || req.headers['x-tenant-id'] || 'global';
  const namespacedKey = `${tenantId}:${idempotencyKey}`;

  const status = globalIdempotencyService.beginRequest(namespacedKey);

  if (status === 'IN_PROGRESS') {
    return res.status(409).json({ error: 'Conflict: Request is already processing.' });
  }

  if (status === 'COMPLETED') {
    const cached = globalIdempotencyService.getResponse(namespacedKey);
    if (cached) {
      for (const [k, v] of Object.entries(cached.headers)) {
        res.setHeader(k, v);
      }
      return res.status(cached.statusCode).send(cached.body);
    }
  }

  // Intercept response to cache upon success
  const originalSend = res.send;
  res.send = function (body?: any) {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      globalIdempotencyService.finishRequest(namespacedKey, {
        statusCode: res.statusCode,
        body,
        headers: res.getHeaders()
      });
    } else {
      globalIdempotencyService.failRequest(namespacedKey);
    }
    return originalSend.call(this, body);
  };

  next();
}