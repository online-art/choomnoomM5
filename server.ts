import 'dotenv/config';
import express from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import {
  STUDENTS,
  SESSION_WEEKS,
  INITIAL_ASSIGNMENTS,
  getBangkokNowInfo,
  type Assignment,
  type AttendanceRecord,
  type Submission,
  type ClassroomStatePayload,
} from './src/shared/classroomData.ts';

const PORT = 3000;
const DATA_DIR = path.resolve(process.cwd(), 'data');
const UPLOADS_DIR = path.resolve(DATA_DIR, 'uploads');
const DB_FILE = path.resolve(DATA_DIR, 'classroom-db.json');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

interface PersistedDb {
  assignments: Assignment[];
  attendance: Record<string, AttendanceRecord>;
  submissions: Record<string, Submission>;
  teacherPasscodeHash: string | null; // format: saltHex:hashHex
}

const TOKEN_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

function createInitialDb(): PersistedDb {
  const attendance: Record<string, AttendanceRecord> = {};
  for (const week of SESSION_WEEKS) {
    if (week.isFreeCredit) {
      for (const student of STUDENTS) {
        attendance[`${student.id}_${week.week}`] = {
          studentId: student.id,
          week: week.week,
          status: 'present',
          checkedAt: `${week.date}T15:00:00+07:00`,
          source: 'free_credit',
        };
      }
    }
  }

  return {
    assignments: structuredClone(INITIAL_ASSIGNMENTS),
    attendance,
    submissions: {},
    teacherPasscodeHash: null,
  };
}

function loadDb(): PersistedDb {
  if (!fs.existsSync(DB_FILE)) {
    const fresh = createInitialDb();
    fs.writeFileSync(DB_FILE, JSON.stringify(fresh, null, 2), 'utf-8');
    return fresh;
  }
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<PersistedDb>;
    const db: PersistedDb = {
      assignments: Array.isArray(parsed.assignments) && parsed.assignments.length > 0
        ? parsed.assignments
        : structuredClone(INITIAL_ASSIGNMENTS),
      attendance: parsed.attendance && typeof parsed.attendance === 'object' ? parsed.attendance : {},
      submissions: parsed.submissions && typeof parsed.submissions === 'object' ? parsed.submissions : {},
      teacherPasscodeHash: typeof parsed.teacherPasscodeHash === 'string' ? parsed.teacherPasscodeHash : null,
    };

    // Ensure free credit weeks 1-3 remain initialized for all 20 students
    for (const week of SESSION_WEEKS) {
      if (week.isFreeCredit) {
        for (const student of STUDENTS) {
          const key = `${student.id}_${week.week}`;
          if (!db.attendance[key]) {
            db.attendance[key] = {
              studentId: student.id,
              week: week.week,
              status: 'present',
              checkedAt: `${week.date}T15:00:00+07:00`,
              source: 'free_credit',
            };
          }
        }
      }
    }
    return db;
  } catch {
    const fresh = createInitialDb();
    fs.writeFileSync(DB_FILE, JSON.stringify(fresh, null, 2), 'utf-8');
    return fresh;
  }
}

let db: PersistedDb = loadDb();

function saveDb() {
  const tmpFile = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(db, null, 2), 'utf-8');
  fs.renameSync(tmpFile, DB_FILE);
}

function hashPasscode(passcode: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(passcode, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPasscodeHash(passcode: string, stored: string): boolean {
  const [salt, expectedHex] = stored.split(':');
  if (!salt || !expectedHex) return false;
  const actualBuf = crypto.scryptSync(passcode, salt, 64);
  const expectedBuf = Buffer.from(expectedHex, 'hex');
  if (actualBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(actualBuf, expectedBuf);
}

function signTeacherToken(): string {
  const payload = Buffer.from(
    JSON.stringify({ role: 'teacher', exp: Date.now() + 12 * 60 * 60 * 1000 })
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifyTeacherToken(authHeader: string | undefined): boolean {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return false;
  const token = authHeader.slice('Bearer '.length).trim();
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return false;
  const expectedSig = crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length) return false;
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return false;
  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8')) as {
      role?: string;
      exp?: number;
    };
    return decoded.role === 'teacher' && typeof decoded.exp === 'number' && decoded.exp > Date.now();
  } catch {
    return false;
  }
}

function getPublicState(): ClassroomStatePayload {
  const envPasscode = (process.env.TEACHER_PASSCODE || '').trim();
  return {
    students: STUDENTS,
    weeks: SESSION_WEEKS,
    assignments: db.assignments,
    attendance: db.attendance,
    submissions: db.submissions,
    teacherAuth: {
      hasConfiguredPasscode: Boolean(envPasscode || db.teacherPasscodeHash),
      usesEnvPasscode: Boolean(envPasscode),
    },
    serverNowBangkok: getBangkokNowInfo(new Date()),
  };
}

const MIME_TO_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

function saveUploadedBase64Image(dataUrl: string): { imageUrl: string } | { error: string } {
  const match = /^data:(image\/(?:png|jpeg|jpg|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) {
    return { error: 'รองรับเฉพาะไฟล์ภาพ PNG, JPG, WEBP หรือ GIF เท่านั้น' };
  }
  const mime = match[1].toLowerCase();
  const ext = MIME_TO_EXT[mime];
  if (!ext) {
    return { error: 'ชนิดไฟล์ภาพไม่ถูกต้อง' };
  }
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES) {
    return { error: 'ขนาดไฟล์ภาพต้องไม่เกิน 5 MB' };
  }
  const safeFilename = `work_${Date.now()}_${crypto.randomBytes(6).toString('hex')}.${ext}`;
  const targetPath = path.resolve(UPLOADS_DIR, safeFilename);
  if (!targetPath.startsWith(UPLOADS_DIR + path.sep)) {
    return { error: 'เส้นทางไฟล์ไม่ถูกต้อง' };
  }
  fs.writeFileSync(targetPath, buffer);
  return { imageUrl: `/api/uploads/${safeFilename}` };
}

function sanitizeShortText(val: unknown, maxLen: number): string {
  if (typeof val !== 'string') return '';
  return val.trim().slice(0, maxLen);
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '8mb' }));

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  function broadcastState() {
    const message = JSON.stringify({
      type: 'state:update',
      payload: getPublicState(),
    });
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }

  wss.on('connection', (ws) => {
    ws.send(
      JSON.stringify({
        type: 'state:init',
        payload: getPublicState(),
      })
    );
  });

  // Serve uploaded images safely
  app.get('/api/uploads/:filename', (req, res) => {
    const filename = req.params.filename;
    if (!/^[a-zA-Z0-9_-]+\.(png|jpg|jpeg|webp|gif)$/.test(filename)) {
      res.status(400).json({ error: 'ชื่อไฟล์ไม่ถูกต้อง' });
      return;
    }
    const resolvedPath = path.resolve(UPLOADS_DIR, filename);
    if (!resolvedPath.startsWith(UPLOADS_DIR + path.sep)) {
      res.status(403).json({ error: 'ไม่อนุญาตให้เข้าถึงไฟล์' });
      return;
    }
    if (!fs.existsSync(resolvedPath)) {
      res.status(404).json({ error: 'ไม่พบไฟล์ภาพ' });
      return;
    }
    res.sendFile(resolvedPath);
  });

  app.get('/api/state', (_req, res) => {
    res.json(getPublicState());
  });

  // Student self check-in
  app.post('/api/checkin', (req, res) => {
    const studentId = sanitizeShortText(req.body?.studentId, 20);
    const student = STUDENTS.find((s) => s.id === studentId);
    if (!student) {
      res.status(400).json({ error: 'ไม่พบข้อมูลนักเรียนที่เลือก' });
      return;
    }

    const nowInfo = getBangkokNowInfo(new Date());
    if (!nowInfo.isThursday) {
      res.status(403).json({
        error: `ไม่สามารถเช็คชื่อได้: วันนี้${nowInfo.weekdayThai} เปิดเช็คชื่อเฉพาะวันพฤหัสบดี เวลา 14:55 – 15:50 น.`,
        serverNowBangkok: nowInfo,
      });
      return;
    }

    if (!nowInfo.currentWeek) {
      res.status(403).json({
        error: 'วันพฤหัสบดีนี้ไม่อยู่ในช่วง 20 สัปดาห์ของตารางชุมนุม',
        serverNowBangkok: nowInfo,
      });
      return;
    }

    if (nowInfo.currentWeek.isFreeCredit) {
      res.status(200).json({
        message: `สัปดาห์ที่ ${nowInfo.currentWeek.week} (${nowInfo.currentWeek.thaiLabel}) ระบบบันทึกมาเรียนฟรีทุกคนแล้ว`,
        state: getPublicState(),
      });
      return;
    }

    if (!nowInfo.isWithinCheckinWindow) {
      res.status(403).json({
        error: `อยู่นอกเวลาเช็คชื่อ (${nowInfo.timeHHMM} น.) — เช็คชื่อได้เฉพาะ 14:55 – 15:50 น. นอกเวลาระบบบันทึกเป็นขาด/ไม่เข้าชุมนุม`,
        serverNowBangkok: nowInfo,
      });
      return;
    }

    const key = `${student.id}_${nowInfo.currentWeek.week}`;
    const existing = db.attendance[key];
    if (existing && existing.status === 'present') {
      res.json({
        message: `${student.name} เช็คชื่อสัปดาห์ที่ ${nowInfo.currentWeek.week} เรียบร้อยแล้ว`,
        state: getPublicState(),
      });
      return;
    }

    db.attendance[key] = {
      studentId: student.id,
      week: nowInfo.currentWeek.week,
      status: 'present',
      checkedAt: new Date().toISOString(),
      source: 'self_checkin',
    };
    saveDb();
    broadcastState();

    res.json({
      message: `เช็คชื่อสำเร็จ! ${student.name} (สัปดาห์ที่ ${nowInfo.currentWeek.week} เวลา ${nowInfo.timeHHMM} น.)`,
      state: getPublicState(),
    });
  });

  // Student assignment submission (real-time with image attachment)
  app.post('/api/submissions', (req, res) => {
    const studentId = sanitizeShortText(req.body?.studentId, 20);
    const assignmentId = sanitizeShortText(req.body?.assignmentId, 60);
    const promptText = sanitizeShortText(req.body?.promptText, 4000);
    const imageDataUrl = typeof req.body?.imageDataUrl === 'string' ? req.body.imageDataUrl : '';
    const imageOriginalName = sanitizeShortText(req.body?.imageOriginalName, 160);
    const rawAnswers = req.body?.answers && typeof req.body.answers === 'object' ? req.body.answers : {};

    const student = STUDENTS.find((s) => s.id === studentId);
    if (!student) {
      res.status(400).json({ error: 'กรุณาเลือกชื่อนักเรียนก่อนส่งงาน' });
      return;
    }
    const assignment = db.assignments.find((a) => a.id === assignmentId && a.isPublished);
    if (!assignment) {
      res.status(404).json({ error: 'ไม่พบใบงานที่ต้องการส่ง หรือใบงานยังไม่เปิดรับส่ง' });
      return;
    }

    const key = `${assignment.id}_${student.id}`;
    const existing = db.submissions[key];

    let finalImageUrl = existing?.imageUrl ?? null;
    let finalImageName = existing?.imageOriginalName ?? null;

    if (imageDataUrl) {
      const saved = saveUploadedBase64Image(imageDataUrl);
      if ('error' in saved) {
        res.status(400).json({ error: saved.error });
        return;
      }
      finalImageUrl = saved.imageUrl;
      finalImageName = imageOriginalName || 'uploaded-image';
    }

    if (!finalImageUrl) {
      res.status(400).json({ error: 'กรุณาแนบไฟล์ภาพผลงานก่อนกดส่งใบงาน' });
      return;
    }

    const cleanAnswers: Record<string, string> = {};
    for (const field of assignment.fields) {
      cleanAnswers[field.key] = sanitizeShortText(
        (rawAnswers as Record<string, unknown>)[field.key],
        1500
      );
    }

    const submission: Submission = {
      id: existing?.id ?? `sub_${assignment.id}_${student.id}`,
      assignmentId: assignment.id,
      studentId: student.id,
      answers: cleanAnswers,
      promptText,
      imageUrl: finalImageUrl,
      imageOriginalName: finalImageName,
      score: existing?.score ?? null,
      feedback: existing?.feedback ?? '',
      submittedAt: new Date().toISOString(),
      gradedAt: existing?.gradedAt ?? null,
    };

    db.submissions[key] = submission;
    saveDb();
    broadcastState();

    res.json({
      message: `ส่ง${assignment.title} เรียบร้อยแล้ว`,
      submission,
      state: getPublicState(),
    });
  });

  // Teacher one-time passcode setup (when TEACHER_PASSCODE env is unset and no hash exists)
  app.post('/api/teacher/setup', (req, res) => {
    const envPasscode = (process.env.TEACHER_PASSCODE || '').trim();
    if (envPasscode) {
      res.status(409).json({ error: 'ระบบตั้งรหัสครูผู้สอนผ่านตัวแปรสภาพแวดล้อมไว้แล้ว' });
      return;
    }
    if (db.teacherPasscodeHash) {
      res.status(409).json({ error: 'ตั้งค่ารหัสผ่านครูผู้สอนไปแล้ว กรุณาเข้าสู่ระบบด้วยรหัสเดิม' });
      return;
    }
    const passcode = typeof req.body?.passcode === 'string' ? req.body.passcode.trim() : '';
    if (passcode.length < 4 || passcode.length > 64) {
      res.status(400).json({ error: 'รหัสผ่านครูผู้สอนต้องมีความยาว 4–64 ตัวอักษร' });
      return;
    }

    db.teacherPasscodeHash = hashPasscode(passcode);
    saveDb();
    broadcastState();

    const token = signTeacherToken();
    res.json({ token, message: 'ตั้งค่ารหัสผ่านครูผู้สอนและเข้าสู่ระบบสำเร็จ' });
  });

  // Teacher login
  app.post('/api/teacher/login', (req, res) => {
    const passcode = typeof req.body?.passcode === 'string' ? req.body.passcode.trim() : '';
    const envPasscode = (process.env.TEACHER_PASSCODE || '').trim();

    if (envPasscode) {
      const a = Buffer.from(passcode);
      const b = Buffer.from(envPasscode);
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        res.status(401).json({ error: 'รหัสผ่านครูผู้สอนไม่ถูกต้อง' });
        return;
      }
      res.json({ token: signTeacherToken() });
      return;
    }

    if (!db.teacherPasscodeHash) {
      res.status(400).json({ error: 'ยังไม่ได้ตั้งค่ารหัสผ่านครูผู้สอน' });
      return;
    }

    if (!verifyPasscodeHash(passcode, db.teacherPasscodeHash)) {
      res.status(401).json({ error: 'รหัสผ่านครูผู้สอนไม่ถูกต้อง' });
      return;
    }

    res.json({ token: signTeacherToken() });
  });

  // Teacher: Grade submission
  app.post('/api/teacher/grade', (req, res) => {
    if (!verifyTeacherToken(req.headers.authorization)) {
      res.status(401).json({ error: 'กรุณาเข้าสู่ระบบครูผู้สอน' });
      return;
    }
    const assignmentId = sanitizeShortText(req.body?.assignmentId, 60);
    const studentId = sanitizeShortText(req.body?.studentId, 20);
    const feedback = sanitizeShortText(req.body?.feedback, 1000);
    const rawScore = req.body?.score;

    const assignment = db.assignments.find((a) => a.id === assignmentId);
    const student = STUDENTS.find((s) => s.id === studentId);
    if (!assignment || !student) {
      res.status(400).json({ error: 'ข้อมูลใบงานหรือนักเรียนไม่ถูกต้อง' });
      return;
    }

    let score: number | null = null;
    if (rawScore !== null && rawScore !== '' && rawScore !== undefined) {
      const num = Number(rawScore);
      if (!Number.isFinite(num) || num < 0 || num > assignment.maxScore) {
        res.status(400).json({ error: `คะแนนต้องอยู่ระหว่าง 0 ถึง ${assignment.maxScore}` });
        return;
      }
      score = Math.round(num * 10) / 10;
    }

    const key = `${assignment.id}_${student.id}`;
    const existing = db.submissions[key];
    if (!existing) {
      // Allow teacher to record score directly even if physical/offline submission
      db.submissions[key] = {
        id: `sub_${assignment.id}_${student.id}`,
        assignmentId: assignment.id,
        studentId: student.id,
        answers: {},
        promptText: '',
        imageUrl: null,
        imageOriginalName: null,
        score,
        feedback,
        submittedAt: new Date().toISOString(),
        gradedAt: new Date().toISOString(),
      };
    } else {
      db.submissions[key] = {
        ...existing,
        score,
        feedback,
        gradedAt: new Date().toISOString(),
      };
    }

    saveDb();
    broadcastState();
    res.json({ message: 'บันทึกคะแนนเรียบร้อยแล้ว', state: getPublicState() });
  });

  // Teacher: Override attendance for a student & week
  app.post('/api/teacher/attendance', (req, res) => {
    if (!verifyTeacherToken(req.headers.authorization)) {
      res.status(401).json({ error: 'กรุณาเข้าสู่ระบบครูผู้สอน' });
      return;
    }
    const studentId = sanitizeShortText(req.body?.studentId, 20);
    const week = Number(req.body?.week);
    const status = req.body?.status === 'present' ? 'present' : req.body?.status === 'absent' ? 'absent' : null;

    if (!STUDENTS.some((s) => s.id === studentId)) {
      res.status(400).json({ error: 'ไม่พบนักเรียน' });
      return;
    }
    if (!SESSION_WEEKS.some((w) => w.week === week)) {
      res.status(400).json({ error: 'ไม่พบสัปดาห์ที่ระบุ' });
      return;
    }
    if (!status) {
      res.status(400).json({ error: 'สถานะต้องเป็น present หรือ absent' });
      return;
    }

    const key = `${studentId}_${week}`;
    db.attendance[key] = {
      studentId,
      week,
      status,
      checkedAt: new Date().toISOString(),
      source: 'teacher',
    };
    saveDb();
    broadcastState();
    res.json({ message: 'อัปเดตสถานะการเข้าเรียนแล้ว', state: getPublicState() });
  });

  // Teacher: Create new real-time assignment
  app.post('/api/teacher/assignments', (req, res) => {
    if (!verifyTeacherToken(req.headers.authorization)) {
      res.status(401).json({ error: 'กรุณาเข้าสู่ระบบครูผู้สอน' });
      return;
    }
    const title = sanitizeShortText(req.body?.title, 180);
    const subtitle = sanitizeShortText(req.body?.subtitle, 240);
    const mission = sanitizeShortText(req.body?.mission, 1500);
    const description = sanitizeShortText(req.body?.description, 1500);
    const samplePrompt = sanitizeShortText(req.body?.samplePrompt, 1500);
    const maxScore = Number(req.body?.maxScore);

    if (!title || !mission) {
      res.status(400).json({ error: 'กรุณาระบุชื่อใบงานและคำชี้แจงภารกิจ' });
      return;
    }
    if (!Number.isFinite(maxScore) || maxScore <= 0 || maxScore > 100) {
      res.status(400).json({ error: 'คะแนนเต็มต้องอยู่ระหว่าง 1 ถึง 100' });
      return;
    }

    const nextOrder = db.assignments.reduce((max, a) => Math.max(max, a.order), 0) + 1;
    const newAssignment: Assignment = {
      id: `worksheet-${Date.now()}`,
      order: nextOrder,
      title,
      subtitle: subtitle || 'ภารกิจมอบหมายเพิ่มเติมแบบเรียลไทม์',
      mission,
      description: description || mission,
      samplePrompt: samplePrompt || undefined,
      fields: [
        {
          key: 'notes',
          label: 'คำอธิบายผลงาน / แนวคิด',
          placeholder: 'อธิบายแนวคิดหรือขั้นตอนการสร้างภาพของนักเรียน',
          multiline: true,
        },
      ],
      maxScore: Math.round(maxScore),
      isPublished: true,
      createdAt: new Date().toISOString(),
    };

    db.assignments.push(newAssignment);
    saveDb();
    broadcastState();
    res.json({ message: 'มอบหมายใบงานใหม่แบบเรียลไทม์แล้ว', assignment: newAssignment, state: getPublicState() });
  });

  // Teacher: Toggle assignment visibility / publish status
  app.patch('/api/teacher/assignments/:id', (req, res) => {
    if (!verifyTeacherToken(req.headers.authorization)) {
      res.status(401).json({ error: 'กรุณาเข้าสู่ระบบครูผู้สอน' });
      return;
    }
    const id = req.params.id;
    const idx = db.assignments.findIndex((a) => a.id === id);
    if (idx === -1) {
      res.status(404).json({ error: 'ไม่พบใบงาน' });
      return;
    }
    if (typeof req.body?.isPublished === 'boolean') {
      db.assignments[idx].isPublished = req.body.isPublished;
    }
    if (typeof req.body?.maxScore === 'number' && req.body.maxScore > 0 && req.body.maxScore <= 100) {
      db.assignments[idx].maxScore = Math.round(req.body.maxScore);
    }
    saveDb();
    broadcastState();
    res.json({ message: 'อัปเดตใบงานแล้ว', state: getPublicState() });
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
