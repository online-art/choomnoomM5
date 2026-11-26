import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import { type ClassroomStatePayload } from './src/shared/classroomData';
import {
  buildPublicState,
  handleClassroomApi,
  loadDb,
  resolveUploadedImagePath,
} from './server/classroomBackend';

const PORT = Number(process.env.PORT || 3000);

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '8mb' }));

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  function broadcastState(payload: ClassroomStatePayload) {
    const message = JSON.stringify({
      type: 'state:update',
      payload,
    });
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }

  wss.on('connection', async (ws) => {
    try {
      const db = await loadDb();
      ws.send(
        JSON.stringify({
          type: 'state:init',
          payload: buildPublicState(db, 'ws'),
        })
      );
    } catch {
      ws.close();
    }
  });

  // Serve uploaded images safely
  app.get('/api/uploads/:filename', (req, res) => {
    const resolved = resolveUploadedImagePath(req.params.filename);
    if ('error' in resolved) {
      res.status(resolved.status).json({ error: resolved.error });
      return;
    }
    res.sendFile(resolved.filePath);
  });

  app.all('/api/*', async (req, res) => {
    try {
      const result = await handleClassroomApi({
        method: req.method.toUpperCase(),
        pathname: req.path,
        authorization: req.headers.authorization,
        body: req.body && typeof req.body === 'object' ? req.body : {},
        realtimeMode: 'ws',
      });
      if (result.mutatedState) {
        broadcastState(result.mutatedState);
      }
      res.setHeader('Cache-Control', 'no-store');
      res.status(result.status).json(result.body);
    } catch (err) {
      console.error('API error:', err);
      res.status(500).json({ error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' });
    }
  });

  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distDir, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`AI Creative Classroom server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
