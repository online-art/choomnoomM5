import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  STUDENTS,
  SESSION_WEEKS,
  INITIAL_ASSIGNMENTS,
  getBangkokNowInfo,
  type Assignment,
  type AttendanceRecord,
  type Submission,
  type ClassroomStatePayload,
} from '../src/shared/classroomData';

export interface PersistedDb {
  assignments: Assignment[];
  attendance: Record<string, AttendanceRecord>;
  submissions: Record<string, Submission>;
  teacherPasscodeHash: string | null; // format: saltHex:hashHex
  sessionSecret?: string;
}

export type StorageMode = 'local_fs' | 'kv' | 'ephemeral_tmp';

const IS_SERVERLESS = Boolean(
  process.env.VERCEL === '1' ||
    process.env.VERCEL_ENV ||
    process.env.AWS_LAMBDA_FUNCTION_NAME
);

const KV_URL = (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '').trim();
const KV_TOKEN = (process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '').trim();
const KV_KEY = 'ai_creative_classroom:db_v1';

export const STORAGE_MODE: StorageMode =
  KV_URL && KV_TOKEN ? 'kv' : IS_SERVERLESS ? 'ephemeral_tmp' : 'local_fs';

const DATA_DIR =
  STORAGE_MODE === 'ephemeral_tmp'
    ? path.resolve('/tmp', 'ai-classroom-data')
    : path.resolve(process.cwd(), 'data');
const UPLOADS_DIR = path.resolve(DATA_DIR, 'uploads');
const DB_FILE = path.resolve(DATA_DIR, 'classroom-db.json');

function ensureDataDirs() {
  if (STORAGE_MODE === 'kv') return;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  } catch {
    // Ignore directory creation errors if read-only
  }
}

ensureDataDirs();

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
    sessionSecret: crypto.randomBytes(32).toString('hex'),
  };
}

function normalizeDb(parsed: Partial<PersistedDb> | null | undefined): PersistedDb {
  const db: PersistedDb = {
    assignments:
      Array.isArray(parsed?.assignments) && parsed.assignments.length > 0
        ? parsed.assignments
        : structuredClone(INITIAL_ASSIGNMENTS),
    attendance:
      parsed?.attendance && typeof parsed.attendance === 'object' ? parsed.attendance : {},
    submissions:
      parsed?.submissions && typeof parsed.submissions === 'object' ? parsed.submissions : {},
    teacherPasscodeHash:
      typeof parsed?.teacherPasscodeHash === 'string' ? parsed.teacherPasscodeHash : null,
    sessionSecret:
      typeof parsed?.sessionSecret === 'string' && parsed.sessionSecret.length >= 16
        ? parsed.sessionSecret
        : crypto.randomBytes(32).toString('hex'),
  };

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
}

let memoryFallbackDb: PersistedDb | null = null;

export async function loadDb(): Promise<PersistedDb> {
  if (STORAGE_MODE === 'kv') {
    try {
      const res = await fetch(`${KV_URL}/get/${encodeURIComponent(KV_KEY)}`, {
        headers: {
          Authorization: `Bearer ${KV_TOKEN}`,
        },
        cache: 'no-store',
      });
      if (res.ok) {
        const json = (await res.json()) as { result?: string | null };
        if (typeof json.result === 'string' && json.result.length > 0) {
          const parsed = JSON.parse(json.result) as Partial<PersistedDb>;
          return normalizeDb(parsed);
        }
      }
    } catch {
      // Fall through to fresh DB if KV is momentarily unavailable
    }
    const fresh = createInitialDb();
    await saveDb(fresh);
    return fresh;
  }

  try {
    if (!fs.existsSync(DB_FILE)) {
      const fresh = memoryFallbackDb ?? createInitialDb();
      memoryFallbackDb = fresh;
      ensureDataDirs();
      fs.writeFileSync(DB_FILE, JSON.stringify(fresh, null, 2), 'utf-8');
      return fresh;
    }
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<PersistedDb>;
    const db = normalizeDb(parsed);
    memoryFallbackDb = db;
    return db;
  } catch {
    if (memoryFallbackDb) return memoryFallbackDb;
    const fresh = createInitialDb();
    memoryFallbackDb = fresh;
    return fresh;
  }
}

export async function saveDb(db: PersistedDb): Promise<void> {
  memoryFallbackDb = db;

  if (STORAGE_MODE === 'kv') {
    const res = await fetch(`${KV_URL}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${KV_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(['SET', KV_KEY, JSON.stringify(db)]),
    });
    if (!res.ok) {
      throw new Error(`KV save failed (${res.status})`);
    }
    return;
  }

  try {
    ensureDataDirs();
    const tmpFile = `${DB_FILE}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(db, null, 2), 'utf-8');
    fs.renameSync(tmpFile, DB_FILE);
  } catch {
    // Keep memoryFallbackDb if disk write fails
  }
}

function getTokenSecret(db: PersistedDb): string {
  const envSecret = (process.env.SESSION_SECRET || '').trim();
  if (envSecret) return envSecret;

  const envPasscode = (process.env.TEACHER_PASSCODE || '').trim();
  if (envPasscode) {
    return crypto.createHash('sha256').update(`classroom-token:${envPasscode}`).digest('hex');
  }

  if (STORAGE_MODE !== 'ephemeral_tmp' && db.sessionSecret) {
    return db.sessionSecret;
  }

  // Deterministic across ephemeral serverless containers when no SESSION_SECRET/KV is configured
  const hostSeed =
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    process.env.VERCEL_URL ||
    'ai-creative-classroom-default-secret';
  return crypto.createHash('sha256').update(`classroom-fallback:${hostSeed}`).digest('hex');
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

function signTeacherToken(db: PersistedDb): string {
  const secret = getTokenSecret(db);
  const payload = Buffer.from(
    JSON.stringify({ role: 'teacher', exp: Date.now() + 12 * 60 * 60 * 1000 })
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifyTeacherToken(authHeader: string | undefined, db: PersistedDb): boolean {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return false;
  const token = authHeader.slice('Bearer '.length).trim();
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return false;
  const secret = getTokenSecret(db);
  const expectedSig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
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

export function buildPublicState(
  db: PersistedDb,
  realtimeMode: 'ws' | 'polling'
): ClassroomStatePayload {
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
    realtimeMode,
    storageMode: STORAGE_MODE,
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

  // On serverless (Vercel / KV), store compressed Data URL directly so images never 404 across containers
  if (STORAGE_MODE !== 'local_fs') {
    return { imageUrl: dataUrl };
  }

  ensureDataDirs();
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

export function resolveUploadedImagePath(
  filename: string
): { error: string; status: number } | { filePath: string } {
  if (!/^[a-zA-Z0-9_-]+\.(png|jpg|jpeg|webp|gif)$/.test(filename)) {
    return { status: 400, error: 'ชื่อไฟล์ไม่ถูกต้อง' };
  }
  const resolvedPath = path.resolve(UPLOADS_DIR, filename);
  if (!resolvedPath.startsWith(UPLOADS_DIR + path.sep)) {
    return { status: 403, error: 'ไม่อนุญาตให้เข้าถึงไฟล์' };
  }
  if (!fs.existsSync(resolvedPath)) {
    return { status: 404, error: 'ไม่พบไฟล์ภาพ' };
  }
  return { filePath: resolvedPath };
}

export interface ApiResult {
  status: number;
  body: unknown;
  mutatedState?: ClassroomStatePayload;
}

export async function handleClassroomApi(params: {
  method: string;
  pathname: string;
  authorization?: string;
  body?: Record<string, unknown>;
  realtimeMode: 'ws' | 'polling';
}): Promise<ApiResult> {
  const { method, pathname, authorization, body = {}, realtimeMode } = params;
  const db = await loadDb();

  if (method === 'GET' && pathname === '/api/state') {
    return {
      status: 200,
      body: buildPublicState(db, realtimeMode),
    };
  }

  if (method === 'POST' && pathname === '/api/checkin') {
    const studentId = sanitizeShortText(body.studentId, 20);
    const student = STUDENTS.find((s) => s.id === studentId);
    if (!student) {
      return { status: 400, body: { error: 'ไม่พบข้อมูลนักเรียนที่เลือก' } };
    }

    const nowInfo = getBangkokNowInfo(new Date());
    if (!nowInfo.isThursday) {
      return {
        status: 403,
        body: {
          error: `ไม่สามารถเช็คชื่อได้: วันนี้${nowInfo.weekdayThai} เปิดเช็คชื่อเฉพาะวันพฤหัสบดี เวลา 14:55 – 15:50 น.`,
          serverNowBangkok: nowInfo,
        },
      };
    }

    if (!nowInfo.currentWeek) {
      return {
        status: 403,
        body: {
          error: 'วันพฤหัสบดีนี้ไม่อยู่ในช่วง 20 สัปดาห์ของตารางชุมนุม',
          serverNowBangkok: nowInfo,
        },
      };
    }

    if (nowInfo.currentWeek.isFreeCredit) {
      return {
        status: 200,
        body: {
          message: `สัปดาห์ที่ ${nowInfo.currentWeek.week} (${nowInfo.currentWeek.thaiLabel}) ระบบบันทึกมาเรียนฟรีทุกคนแล้ว`,
          state: buildPublicState(db, realtimeMode),
        },
      };
    }

    if (!nowInfo.isWithinCheckinWindow) {
      return {
        status: 403,
        body: {
          error: `อยู่นอกเวลาเช็คชื่อ (${nowInfo.timeHHMM} น.) — เช็คชื่อได้เฉพาะ 14:55 – 15:50 น. นอกเวลาระบบบันทึกเป็นขาด/ไม่เข้าชุมนุม`,
          serverNowBangkok: nowInfo,
        },
      };
    }

    const key = `${student.id}_${nowInfo.currentWeek.week}`;
    const existing = db.attendance[key];
    if (existing && existing.status === 'present') {
      return {
        status: 200,
        body: {
          message: `${student.name} เช็คชื่อสัปดาห์ที่ ${nowInfo.currentWeek.week} เรียบร้อยแล้ว`,
          state: buildPublicState(db, realtimeMode),
        },
      };
    }

    db.attendance[key] = {
      studentId: student.id,
      week: nowInfo.currentWeek.week,
      status: 'present',
      checkedAt: new Date().toISOString(),
      source: 'self_checkin',
    };
    await saveDb(db);
    const nextState = buildPublicState(db, realtimeMode);
    return {
      status: 200,
      mutatedState: nextState,
      body: {
        message: `เช็คชื่อสำเร็จ! ${student.name} (สัปดาห์ที่ ${nowInfo.currentWeek.week} เวลา ${nowInfo.timeHHMM} น.)`,
        state: nextState,
      },
    };
  }

  if (method === 'POST' && pathname === '/api/submissions') {
    const studentId = sanitizeShortText(body.studentId, 20);
    const assignmentId = sanitizeShortText(body.assignmentId, 60);
    const promptText = sanitizeShortText(body.promptText, 4000);
    const imageDataUrl = typeof body.imageDataUrl === 'string' ? body.imageDataUrl : '';
    const imageOriginalName = sanitizeShortText(body.imageOriginalName, 160);
    const rawAnswers = body.answers && typeof body.answers === 'object' ? body.answers : {};

    const student = STUDENTS.find((s) => s.id === studentId);
    if (!student) {
      return { status: 400, body: { error: 'กรุณาเลือกชื่อนักเรียนก่อนส่งงาน' } };
    }
    const assignment = db.assignments.find((a) => a.id === assignmentId && a.isPublished);
    if (!assignment) {
      return { status: 404, body: { error: 'ไม่พบใบงานที่ต้องการส่ง หรือใบงานยังไม่เปิดรับส่ง' } };
    }

    const key = `${assignment.id}_${student.id}`;
    const existing = db.submissions[key];

    let finalImageUrl = existing?.imageUrl ?? null;
    let finalImageName = existing?.imageOriginalName ?? null;

    if (imageDataUrl) {
      const saved = saveUploadedBase64Image(imageDataUrl);
      if ('error' in saved) {
        return { status: 400, body: { error: saved.error } };
      }
      finalImageUrl = saved.imageUrl;
      finalImageName = imageOriginalName || 'uploaded-image';
    }

    if (!finalImageUrl) {
      return { status: 400, body: { error: 'กรุณาแนบไฟล์ภาพผลงานก่อนกดส่งใบงาน' } };
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
    await saveDb(db);
    const nextState = buildPublicState(db, realtimeMode);
    return {
      status: 200,
      mutatedState: nextState,
      body: {
        message: `ส่ง${assignment.title} เรียบร้อยแล้ว`,
        submission,
        state: nextState,
      },
    };
  }

  if (method === 'POST' && pathname === '/api/teacher/setup') {
    const envPasscode = (process.env.TEACHER_PASSCODE || '').trim();
    if (envPasscode) {
      return {
        status: 409,
        body: { error: 'ระบบตั้งรหัสครูผู้สอนผ่านตัวแปรสภาพแวดล้อมไว้แล้ว' },
      };
    }
    if (db.teacherPasscodeHash) {
      return {
        status: 409,
        body: { error: 'ตั้งค่ารหัสผ่านครูผู้สอนไปแล้ว กรุณาเข้าสู่ระบบด้วยรหัสเดิม' },
      };
    }
    const passcode = typeof body.passcode === 'string' ? body.passcode.trim() : '';
    if (passcode.length < 4 || passcode.length > 64) {
      return {
        status: 400,
        body: { error: 'รหัสผ่านครูผู้สอนต้องมีความยาว 4–64 ตัวอักษร' },
      };
    }

    db.teacherPasscodeHash = hashPasscode(passcode);
    await saveDb(db);
    const nextState = buildPublicState(db, realtimeMode);
    const token = signTeacherToken(db);
    return {
      status: 200,
      mutatedState: nextState,
      body: { token, message: 'ตั้งค่ารหัสผ่านครูผู้สอนและเข้าสู่ระบบสำเร็จ', state: nextState },
    };
  }

  if (method === 'POST' && pathname === '/api/teacher/login') {
    const passcode = typeof body.passcode === 'string' ? body.passcode.trim() : '';
    const envPasscode = (process.env.TEACHER_PASSCODE || '').trim();

    if (envPasscode) {
      const a = Buffer.from(passcode);
      const b = Buffer.from(envPasscode);
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        return { status: 401, body: { error: 'รหัสผ่านครูผู้สอนไม่ถูกต้อง' } };
      }
      return { status: 200, body: { token: signTeacherToken(db) } };
    }

    if (!db.teacherPasscodeHash) {
      return { status: 400, body: { error: 'ยังไม่ได้ตั้งค่ารหัสผ่านครูผู้สอน' } };
    }

    if (!verifyPasscodeHash(passcode, db.teacherPasscodeHash)) {
      return { status: 401, body: { error: 'รหัสผ่านครูผู้สอนไม่ถูกต้อง' } };
    }

    return { status: 200, body: { token: signTeacherToken(db) } };
  }

  if (method === 'POST' && pathname === '/api/teacher/grade') {
    if (!verifyTeacherToken(authorization, db)) {
      return { status: 401, body: { error: 'กรุณาเข้าสู่ระบบครูผู้สอน' } };
    }
    const assignmentId = sanitizeShortText(body.assignmentId, 60);
    const studentId = sanitizeShortText(body.studentId, 20);
    const feedback = sanitizeShortText(body.feedback, 1000);
    const rawScore = body.score;

    const assignment = db.assignments.find((a) => a.id === assignmentId);
    const student = STUDENTS.find((s) => s.id === studentId);
    if (!assignment || !student) {
      return { status: 400, body: { error: 'ข้อมูลใบงานหรือนักเรียนไม่ถูกต้อง' } };
    }

    let score: number | null = null;
    if (rawScore !== null && rawScore !== '' && rawScore !== undefined) {
      const num = Number(rawScore);
      if (!Number.isFinite(num) || num < 0 || num > assignment.maxScore) {
        return { status: 400, body: { error: `คะแนนต้องอยู่ระหว่าง 0 ถึง ${assignment.maxScore}` } };
      }
      score = Math.round(num * 10) / 10;
    }

    const key = `${assignment.id}_${student.id}`;
    const existing = db.submissions[key];
    if (!existing) {
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

    await saveDb(db);
    const nextState = buildPublicState(db, realtimeMode);
    return {
      status: 200,
      mutatedState: nextState,
      body: { message: 'บันทึกคะแนนเรียบร้อยแล้ว', state: nextState },
    };
  }

  if (method === 'POST' && pathname === '/api/teacher/attendance') {
    if (!verifyTeacherToken(authorization, db)) {
      return { status: 401, body: { error: 'กรุณาเข้าสู่ระบบครูผู้สอน' } };
    }
    const studentId = sanitizeShortText(body.studentId, 20);
    const week = Number(body.week);
    const status =
      body.status === 'present' ? 'present' : body.status === 'absent' ? 'absent' : null;

    if (!STUDENTS.some((s) => s.id === studentId)) {
      return { status: 400, body: { error: 'ไม่พบนักเรียน' } };
    }
    if (!SESSION_WEEKS.some((w) => w.week === week)) {
      return { status: 400, body: { error: 'ไม่พบสัปดาห์ที่ระบุ' } };
    }
    if (!status) {
      return { status: 400, body: { error: 'สถานะต้องเป็น present หรือ absent' } };
    }

    const key = `${studentId}_${week}`;
    db.attendance[key] = {
      studentId,
      week,
      status,
      checkedAt: new Date().toISOString(),
      source: 'teacher',
    };
    await saveDb(db);
    const nextState = buildPublicState(db, realtimeMode);
    return {
      status: 200,
      mutatedState: nextState,
      body: { message: 'อัปเดตสถานะการเข้าเรียนแล้ว', state: nextState },
    };
  }

  if (method === 'POST' && pathname === '/api/teacher/assignments') {
    if (!verifyTeacherToken(authorization, db)) {
      return { status: 401, body: { error: 'กรุณาเข้าสู่ระบบครูผู้สอน' } };
    }
    const title = sanitizeShortText(body.title, 180);
    const subtitle = sanitizeShortText(body.subtitle, 240);
    const mission = sanitizeShortText(body.mission, 1500);
    const description = sanitizeShortText(body.description, 1500);
    const samplePrompt = sanitizeShortText(body.samplePrompt, 1500);
    const maxScore = Number(body.maxScore);

    if (!title || !mission) {
      return { status: 400, body: { error: 'กรุณาระบุชื่อใบงานและคำชี้แจงภารกิจ' } };
    }
    if (!Number.isFinite(maxScore) || maxScore <= 0 || maxScore > 100) {
      return { status: 400, body: { error: 'คะแนนเต็มต้องอยู่ระหว่าง 1 ถึง 100' } };
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
    await saveDb(db);
    const nextState = buildPublicState(db, realtimeMode);
    return {
      status: 200,
      mutatedState: nextState,
      body: {
        message: 'มอบหมายใบงานใหม่แบบเรียลไทม์แล้ว',
        assignment: newAssignment,
        state: nextState,
      },
    };
  }

  if (method === 'PATCH' && pathname.startsWith('/api/teacher/assignments/')) {
    if (!verifyTeacherToken(authorization, db)) {
      return { status: 401, body: { error: 'กรุณาเข้าสู่ระบบครูผู้สอน' } };
    }
    const id = pathname.slice('/api/teacher/assignments/'.length);
    const idx = db.assignments.findIndex((a) => a.id === id);
    if (idx === -1) {
      return { status: 404, body: { error: 'ไม่พบใบงาน' } };
    }
    if (typeof body.isPublished === 'boolean') {
      db.assignments[idx].isPublished = body.isPublished;
    }
    if (typeof body.maxScore === 'number' && body.maxScore > 0 && body.maxScore <= 100) {
      db.assignments[idx].maxScore = Math.round(body.maxScore);
    }
    await saveDb(db);
    const nextState = buildPublicState(db, realtimeMode);
    return {
      status: 200,
      mutatedState: nextState,
      body: { message: 'อัปเดตใบงานแล้ว', state: nextState },
    };
  }

  return {
    status: 404,
    body: { error: 'ไม่พบ API ที่ร้องขอ' },
  };
}
