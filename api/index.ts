import fs from 'fs';
import type { IncomingMessage, ServerResponse } from 'http';
import { handleClassroomApi, resolveUploadedImagePath } from '../server/classroomBackend';

type VercelLikeRequest = IncomingMessage & {
  body?: unknown;
  query?: Record<string, string | string[] | undefined>;
};

const MAX_BODY_BYTES = 8 * 1024 * 1024; // 8 MB

async function parseJsonBody(req: VercelLikeRequest): Promise<Record<string, unknown>> {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
      return req.body as Record<string, unknown>;
    }
    if (typeof req.body === 'string') {
      try {
        const parsed = JSON.parse(req.body);
        return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
      } catch {
        return {};
      }
    }
  }

  return new Promise((resolve) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size <= MAX_BODY_BYTES) {
        chunks.push(chunk);
      }
    });
    req.on('end', () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }
      try {
        const text = Buffer.concat(chunks).toString('utf-8');
        const parsed = JSON.parse(text);
        resolve(parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {});
      } catch {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

function sendJson(res: ServerResponse, status: number, payload: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.end(JSON.stringify(payload));
}

export default async function handler(req: VercelLikeRequest, res: ServerResponse) {
  try {
    const method = (req.method || 'GET').toUpperCase();
    const rawPathParam = req.query?.__path;
    const pathFromQuery = Array.isArray(rawPathParam) ? rawPathParam.join('/') : rawPathParam;
    const parsedUrl = new URL(req.url || '/', 'http://localhost');
    const pathname = pathFromQuery
      ? `/api/${String(pathFromQuery).replace(/^\/+/, '')}`
      : parsedUrl.pathname;

    if (method === 'GET' && pathname.startsWith('/api/uploads/')) {
      const filename = pathname.slice('/api/uploads/'.length);
      const resolved = resolveUploadedImagePath(filename);
      if ('error' in resolved) {
        sendJson(res, resolved.status, { error: resolved.error });
        return;
      }
      const ext = filename.split('.').pop()?.toLowerCase();
      const contentType =
        ext === 'png'
          ? 'image/png'
          : ext === 'webp'
            ? 'image/webp'
            : ext === 'gif'
              ? 'image/gif'
              : 'image/jpeg';
      res.statusCode = 200;
      res.setHeader('Content-Type', contentType);
      res.end(fs.readFileSync(resolved.filePath));
      return;
    }

    const body = method === 'GET' || method === 'HEAD' ? {} : await parseJsonBody(req);
    const authHeader =
      typeof req.headers.authorization === 'string' ? req.headers.authorization : undefined;

    const result = await handleClassroomApi({
      method,
      pathname,
      authorization: authHeader,
      body,
      realtimeMode: 'polling',
    });

    sendJson(res, result.status, result.body);
  } catch (err) {
    console.error('Vercel API handler error:', err);
    sendJson(res, 500, { error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' });
  }
}
