import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  Copy,
  FileImage,
  Plus,
  Send,
  Sparkles,
  Upload,
  Wand2,
  X,
  Eye,
  Award,
} from 'lucide-react';
import {
  type Assignment,
  type ClassroomStatePayload,
  type Submission,
} from '../shared/classroomData';

interface AssignmentsViewProps {
  state: ClassroomStatePayload;
  selectedStudentId: string;
  onSelectStudent: (studentId: string) => void;
  teacherToken: string | null;
  onStateUpdated: (next: ClassroomStatePayload) => void;
  onNotify: (msg: string, tone: 'success' | 'error') => void;
}

async function compressImageFileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('ไม่สามารถอ่านไฟล์ภาพได้'));
    reader.onload = () => {
      const rawUrl = String(reader.result || '');
      if (file.size <= 1.5 * 1024 * 1024) {
        resolve(rawUrl);
        return;
      }
      const img = new Image();
      img.onerror = () => resolve(rawUrl);
      img.onload = () => {
        const maxDim = 1600;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const ratio = Math.min(maxDim / width, maxDim / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(rawUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.86));
      };
      img.src = rawUrl;
    };
    reader.readAsDataURL(file);
  });
}

export const AssignmentsView: React.FC<AssignmentsViewProps> = ({
  state,
  selectedStudentId,
  onSelectStudent,
  teacherToken,
  onStateUpdated,
  onNotify,
}) => {
  const publishedAssignments = useMemo(
    () => state.assignments.filter((a) => teacherToken || a.isPublished),
    [state.assignments, teacherToken]
  );

  const [activeAssignmentId, setActiveAssignmentId] = useState<string>(
    publishedAssignments[0]?.id ?? 'worksheet-1'
  );
  const activeAssignment: Assignment | undefined =
    publishedAssignments.find((a) => a.id === activeAssignmentId) ?? publishedAssignments[0];

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [promptText, setPromptText] = useState('');
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [pendingUploadDataUrl, setPendingUploadDataUrl] = useState<string | null>(null);
  const [pendingFileName, setPendingFileName] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<{ url: string; title: string } | null>(null);

  // Teacher modal for creating real-time assignment
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newSubtitle, setNewSubtitle] = useState('');
  const [newMission, setNewMission] = useState('');
  const [newSamplePrompt, setNewSamplePrompt] = useState('');
  const [newMaxScore, setNewMaxScore] = useState('20');
  const [creatingAssignment, setCreatingAssignment] = useState(false);

  // Teacher inline grading state
  const [gradeDrafts, setGradeDrafts] = useState<Record<string, { score: string; feedback: string }>>({});
  const [savingGradeKey, setSavingGradeKey] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const existingSubmission: Submission | undefined = useMemo(() => {
    if (!activeAssignment || !selectedStudentId) return undefined;
    return state.submissions[`${activeAssignment.id}_${selectedStudentId}`];
  }, [activeAssignment, selectedStudentId, state.submissions]);

  // Sync form when switching assignment or student
  useEffect(() => {
    if (!activeAssignment) return;
    if (existingSubmission) {
      setAnswers(existingSubmission.answers || {});
      setPromptText(existingSubmission.promptText || '');
      setImagePreviewUrl(existingSubmission.imageUrl);
      setPendingUploadDataUrl(null);
      setPendingFileName(existingSubmission.imageOriginalName || '');
    } else {
      const blank: Record<string, string> = {};
      for (const f of activeAssignment.fields) {
        blank[f.key] = f.options?.[0] ?? '';
      }
      setAnswers(blank);
      setPromptText('');
      setImagePreviewUrl(null);
      setPendingUploadDataUrl(null);
      setPendingFileName('');
    }
  }, [activeAssignment?.id, selectedStudentId, existingSubmission?.submittedAt]);

  const assignmentSubmissions = useMemo(() => {
    if (!activeAssignment) return [];
    return state.students
      .map((student) => ({
        student,
        submission: state.submissions[`${activeAssignment.id}_${student.id}`] ?? null,
      }))
      .sort((a, b) => {
        if (a.submission && !b.submission) return -1;
        if (!a.submission && b.submission) return 1;
        return a.student.order - b.student.order;
      });
  }, [activeAssignment, state.students, state.submissions]);

  const submittedCount = assignmentSubmissions.filter((x) => x.submission !== null).length;

  async function handleFileSelect(file: File | undefined) {
    if (!file) return;
    if (!/^image\/(png|jpeg|jpg|webp|gif)$/i.test(file.type)) {
      onNotify('กรุณาเลือกไฟล์ภาพนามสกุล PNG, JPG, WEBP หรือ GIF เท่านั้น', 'error');
      return;
    }
    try {
      const dataUrl = await compressImageFileToDataUrl(file);
      setPendingUploadDataUrl(dataUrl);
      setImagePreviewUrl(dataUrl);
      setPendingFileName(file.name);
    } catch {
      onNotify('ไม่สามารถอ่านไฟล์ภาพที่เลือกได้', 'error');
    }
  }

  function handleBuildWorksheet2Prompt() {
    const parts = [
      answers.subject ? `ตัวแบบหลัก: ${answers.subject}` : '',
      answers.setting ? `ฉากหรือสถานที่: ${answers.setting}` : '',
      answers.style ? `รูปแบบภาพ: ${answers.style}` : '',
      answers.palette ? `โทนสี: ${answers.palette}` : '',
      answers.mood ? `บรรยากาศ: ${answers.mood}` : '',
    ].filter(Boolean);
    if (parts.length === 0) {
      onNotify('กรุณากรอกองค์ประกอบข้อ 1–5 อย่างน้อย 1 ช่องก่อนรวม Prompt', 'error');
      return;
    }
    setPromptText(`สร้างภาพหัวข้อ "โรงเรียนในฝัน" — ${parts.join(', ')}`);
  }

  async function handleCopySamplePrompt(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setPromptText((prev) => (prev.trim() ? prev : text));
      onNotify('คัดลอกตัวอย่าง Prompt แล้ว', 'success');
    } catch {
      setPromptText(text);
      onNotify('นำตัวอย่าง Prompt ลงในช่องเขียนคำสั่งแล้ว', 'success');
    }
  }

  async function handleSubmitAssignment(e: React.FormEvent) {
    e.preventDefault();
    if (!activeAssignment) return;
    if (!selectedStudentId) {
      onNotify('กรุณาเลือกชื่อนักเรียนก่อนส่งใบงาน', 'error');
      return;
    }
    if (!pendingUploadDataUrl && !existingSubmission?.imageUrl) {
      onNotify('กรุณาแนบไฟล์ภาพผลงานก่อนกดส่งใบงาน', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: selectedStudentId,
          assignmentId: activeAssignment.id,
          answers,
          promptText,
          imageDataUrl: pendingUploadDataUrl || '',
          imageOriginalName: pendingFileName || existingSubmission?.imageOriginalName || '',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        onNotify(data.error || 'ส่งใบงานไม่สำเร็จ', 'error');
        return;
      }
      if (data.state) onStateUpdated(data.state);
      setPendingUploadDataUrl(null);
      onNotify(data.message || 'ส่งใบงานเรียบร้อยแล้ว', 'success');
    } catch {
      onNotify('เกิดข้อผิดพลาดในการส่งใบงาน', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSaveGrade(studentId: string, assignment: Assignment) {
    if (!teacherToken) return;
    const key = `${assignment.id}_${studentId}`;
    const existing = state.submissions[key];
    const draft = gradeDrafts[key] ?? {
      score: existing?.score !== null && existing?.score !== undefined ? String(existing.score) : '',
      feedback: existing?.feedback ?? '',
    };

    setSavingGradeKey(key);
    try {
      const res = await fetch('/api/teacher/grade', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${teacherToken}`,
        },
        body: JSON.stringify({
          assignmentId: assignment.id,
          studentId,
          score: draft.score === '' ? null : Number(draft.score),
          feedback: draft.feedback,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        onNotify(data.error || 'บันทึกคะแนนไม่สำเร็จ', 'error');
        return;
      }
      if (data.state) onStateUpdated(data.state);
      onNotify('บันทึกคะแนนและข้อเสนอแนะเรียบร้อยแล้ว', 'success');
    } catch {
      onNotify('เกิดข้อผิดพลาดในการบันทึกคะแนน', 'error');
    } finally {
      setSavingGradeKey(null);
    }
  }

  async function handleCreateAssignment(e: React.FormEvent) {
    e.preventDefault();
    if (!teacherToken) return;
    setCreatingAssignment(true);
    try {
      const res = await fetch('/api/teacher/assignments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${teacherToken}`,
        },
        body: JSON.stringify({
          title: newTitle,
          subtitle: newSubtitle,
          mission: newMission,
          samplePrompt: newSamplePrompt,
          maxScore: Number(newMaxScore) || 20,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        onNotify(data.error || 'สร้างใบงานไม่สำเร็จ', 'error');
        return;
      }
      if (data.state) onStateUpdated(data.state);
      if (data.assignment?.id) setActiveAssignmentId(data.assignment.id);
      setNewTitle('');
      setNewSubtitle('');
      setNewMission('');
      setNewSamplePrompt('');
      setNewMaxScore('20');
      setShowCreateModal(false);
      onNotify('มอบหมายใบงานใหม่แบบเรียลไทม์แล้ว', 'success');
    } catch {
      onNotify('เกิดข้อผิดพลาดในการสร้างใบงาน', 'error');
    } finally {
      setCreatingAssignment(false);
    }
  }

  return (
    <section className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start">
        {/* Left Sidebar: Assignment List */}
        <aside className="space-y-3 lg:col-span-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-slate-900">รายการใบงานทั้งหมด</h2>
              <p className="text-xs text-slate-500">
                รวม {publishedAssignments.reduce((acc, a) => acc + a.maxScore, 0)} คะแนน · ส่งภาพแบบเรียลไทม์
              </p>
            </div>
            {teacherToken && (
              <button
                type="button"
                onClick={() => setShowCreateModal(true)}
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-blue-700 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-800"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>มอบหมายงานใหม่</span>
              </button>
            )}
          </div>

          <div className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white">
            {publishedAssignments.map((assignment) => {
              const isSelected = activeAssignment?.id === assignment.id;
              const studentSub = selectedStudentId
                ? state.submissions[`${assignment.id}_${selectedStudentId}`]
                : undefined;
              const countForAssignment = state.students.filter(
                (s) => Boolean(state.submissions[`${assignment.id}_${s.id}`])
              ).length;

              return (
                <button
                  key={assignment.id}
                  type="button"
                  onClick={() => setActiveAssignmentId(assignment.id)}
                  className={`block w-full p-4 text-left transition-colors ${
                    isSelected ? 'bg-blue-50/70' : 'bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                    <span className="font-mono font-medium tabular-nums">
                      ใบงานที่ {assignment.order} · {assignment.maxScore} คะแนน
                    </span>
                    <span className="tabular-nums">ส่งแล้ว {countForAssignment}/20</span>
                  </div>
                  <div
                    className={`mt-1 text-sm font-semibold ${
                      isSelected ? 'text-blue-800' : 'text-slate-900'
                    }`}
                  >
                    {assignment.title.replace(/^ใบงานที่ \d+\s*:\s*/, '')}
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-slate-600">{assignment.subtitle}</p>
                  {selectedStudentId && (
                    <div className="mt-2 flex items-center gap-1.5 text-xs font-medium">
                      {studentSub ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          ส่งแล้ว
                          {studentSub.score !== null ? ` · ได้ ${studentSub.score}/${assignment.maxScore} คะแนน` : ' · รอครูตรวจ'}
                        </span>
                      ) : (
                        <span className="text-amber-700">ยังไม่ได้ส่งงานนี้</span>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </aside>

        {/* Right Main Column: Active Worksheet + Submission + Real-Time Gallery */}
        {activeAssignment && (
          <div className="space-y-6 lg:col-span-8">
            {/* Worksheet Instructions */}
            <div className="rounded-xl border border-slate-200 bg-white p-6">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                <span>ใบงานที่ {activeAssignment.order}</span>
                <span className="font-mono font-semibold text-blue-700 tabular-nums">
                  คะแนนเต็ม {activeAssignment.maxScore} คะแนน
                </span>
              </div>
              <h3 className="mt-1.5 text-xl font-bold text-slate-900">{activeAssignment.title}</h3>
              <p className="mt-1 text-sm font-medium text-blue-800">{activeAssignment.subtitle}</p>
              <p className="mt-3 text-sm leading-relaxed text-slate-700">
                {activeAssignment.mission}
              </p>

              {activeAssignment.steps && activeAssignment.steps.length > 0 && (
                <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-semibold text-slate-700">
                    ขั้นตอน / องค์ประกอบที่ต้องมี
                  </div>
                  <ul className="mt-2 grid grid-cols-1 gap-1.5 text-sm text-slate-700 sm:grid-cols-2">
                    {activeAssignment.steps.map((step, i) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ul>
                </div>
              )}

              {activeAssignment.samplePrompt && (
                <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                      <Sparkles className="h-3.5 w-3.5 text-blue-700" />
                      ตัวอย่าง Prompt สำหรับสั่ง ChatGPT สร้างภาพ
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopySamplePrompt(activeAssignment.samplePrompt || '')}
                      className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100"
                    >
                      <Copy className="h-3 w-3" />
                      คัดลอกตัวอย่าง Prompt
                    </button>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-slate-800">
                    “{activeAssignment.samplePrompt}”
                  </p>
                </div>
              )}

              {activeAssignment.sampleImageUrl && (
                <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
                  <img
                    src={activeAssignment.sampleImageUrl}
                    alt="ภาพตัวอย่างประกอบใบงานที่ 1 โลกในจินตนาการของฉัน"
                    referrerPolicy="no-referrer"
                    className="h-56 w-full object-cover sm:h-64"
                  />
                  <div className="border-t border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                    ภาพตัวอย่างอ้างอิง: เมืองแห่งอนาคตสไตล์ 3D สมจริง
                  </div>
                </div>
              )}
            </div>

            {/* Student Submission Form */}
            <form
              onSubmit={handleSubmitAssignment}
              className="rounded-xl border border-slate-200 bg-white p-6 space-y-5"
            >
              <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h4 className="text-base font-bold text-slate-900">ส่งใบงานพร้อมแนบไฟล์ภาพ</h4>
                  <p className="text-xs text-slate-500">
                    เลือกชื่อตนเอง กรอกรายละเอียด Prompt และอัปโหลดภาพผลงานที่สร้างจาก ChatGPT
                  </p>
                </div>
                {existingSubmission && (
                  <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>
                      ส่งแล้ว
                      {existingSubmission.score !== null
                        ? ` · คะแนน ${existingSubmission.score}/${activeAssignment.maxScore}`
                        : ' · รอครูให้คะแนน'}
                    </span>
                  </div>
                )}
              </div>

              {existingSubmission?.feedback && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3.5 text-sm text-blue-900">
                  <span className="font-semibold">ความเห็นจากครูผู้สอน:</span>{' '}
                  {existingSubmission.feedback}
                </div>
              )}

              <div>
                <label htmlFor="submission-student" className="block text-sm font-semibold text-slate-700">
                  เลือกชื่อผู้ส่งงาน *
                </label>
                <select
                  id="submission-student"
                  value={selectedStudentId}
                  onChange={(e) => onSelectStudent(e.target.value)}
                  required
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15"
                >
                  <option value="">-- กรุณาเลือกชื่อนักเรียน (20 คน) --</option>
                  {state.students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.order}. [{s.id}] {s.name} ({s.grade}/{s.room} เลขที่ {s.number})
                    </option>
                  ))}
                </select>
              </div>

              {/* Dynamic Worksheet Fields */}
              {activeAssignment.fields.length > 0 && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {activeAssignment.fields.map((field) => (
                    <div
                      key={field.key}
                      className={field.multiline ? 'sm:col-span-2' : ''}
                    >
                      <label
                        htmlFor={`field-${field.key}`}
                        className="block text-xs font-semibold text-slate-700"
                      >
                        {field.label}
                      </label>
                      {field.options ? (
                        <select
                          id={`field-${field.key}`}
                          value={answers[field.key] ?? ''}
                          onChange={(e) =>
                            setAnswers((prev) => ({ ...prev, [field.key]: e.target.value }))
                          }
                          className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-600"
                        >
                          {field.options.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      ) : field.multiline ? (
                        <textarea
                          id={`field-${field.key}`}
                          rows={2}
                          value={answers[field.key] ?? ''}
                          onChange={(e) =>
                            setAnswers((prev) => ({ ...prev, [field.key]: e.target.value }))
                          }
                          placeholder={field.placeholder}
                          className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-600"
                        />
                      ) : (
                        <input
                          id={`field-${field.key}`}
                          type="text"
                          value={answers[field.key] ?? ''}
                          onChange={(e) =>
                            setAnswers((prev) => ({ ...prev, [field.key]: e.target.value }))
                          }
                          placeholder={field.placeholder}
                          className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-600"
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Prompt Text */}
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label htmlFor="prompt-full-text" className="block text-sm font-semibold text-slate-700">
                    Prompt ฉบับสมบูรณ์ / คำสั่งที่ใช้สร้างภาพ
                  </label>
                  {activeAssignment.id === 'worksheet-2' && (
                    <button
                      type="button"
                      onClick={handleBuildWorksheet2Prompt}
                      className="inline-flex items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-100"
                    >
                      <Wand2 className="h-3.5 w-3.5" />
                      รวมข้อ 1–5 เป็น Prompt ฉบับสมบูรณ์
                    </button>
                  )}
                </div>
                <textarea
                  id="prompt-full-text"
                  rows={3}
                  value={promptText}
                  onChange={(e) => setPromptText(e.target.value)}
                  placeholder="วางคำสั่ง Prompt ที่นักเรียนใช้สร้างภาพใน ChatGPT..."
                  className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-600"
                />
              </div>

              {/* Image Upload */}
              <div>
                <label className="block text-sm font-semibold text-slate-700">
                  แนบไฟล์ภาพผลงาน (PNG, JPG, WEBP, GIF) *
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  onChange={(e) => handleFileSelect(e.target.files?.[0])}
                />

                {imagePreviewUrl ? (
                  <div className="mt-2 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                    <div className="relative flex max-h-80 items-center justify-center bg-slate-900/5 p-2">
                      <img
                        src={imagePreviewUrl}
                        alt="ตัวอย่างภาพผลงานที่แนบ"
                        referrerPolicy="no-referrer"
                        className="max-h-72 rounded object-contain"
                      />
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-white px-3.5 py-2.5 text-xs">
                      <span className="truncate font-medium text-slate-700">
                        {pendingFileName || 'ไฟล์ภาพที่ส่งไว้'}
                      </span>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="inline-flex items-center gap-1.5 font-semibold text-blue-700 hover:underline"
                      >
                        <Upload className="h-3.5 w-3.5" />
                        เปลี่ยนไฟล์ภาพ
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="mt-2 flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center transition-colors hover:border-blue-500 hover:bg-blue-50/40"
                  >
                    <FileImage className="h-8 w-8 text-slate-400" />
                    <div className="text-sm font-semibold text-slate-700">
                      คลิกเพื่อเลือกรูปภาพผลงานจากเครื่อง
                    </div>
                    <div className="text-xs text-slate-500">
                      รองรับไฟล์ PNG, JPG, WEBP, GIF (ปรับขนาดอัตโนมัติสำหรับมือถือ)
                    </div>
                  </button>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-800 disabled:opacity-60"
                >
                  <Send className="h-4 w-4" />
                  <span>
                    {submitting
                      ? 'กำลังส่งงาน...'
                      : existingSubmission
                        ? 'อัปเดตงานที่ส่งแล้ว'
                        : 'ส่งใบงานแบบเรียลไทม์'}
                  </span>
                </button>
              </div>
            </form>

            {/* Real-time Classroom Submissions Gallery & Teacher Grading */}
            <div className="rounded-xl border border-slate-200 bg-white p-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-base font-bold text-slate-900">
                    ผลงานนักเรียนที่ส่งแล้ว — ใบงานที่ {activeAssignment.order}
                  </h4>
                  <p className="text-xs text-slate-500">
                    อัปเดตแบบเรียลไทม์ทันทีเมื่อมีนักเรียนส่งภาพ ({submittedCount}/20 คน)
                  </p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                {assignmentSubmissions
                  .filter((item) => teacherToken || item.submission !== null)
                  .map(({ student, submission }) => {
                    const key = `${activeAssignment.id}_${student.id}`;
                    const draft = gradeDrafts[key] ?? {
                      score:
                        submission?.score !== null && submission?.score !== undefined
                          ? String(submission.score)
                          : '',
                      feedback: submission?.feedback ?? '',
                    };
                    const isSaving = savingGradeKey === key;

                    return (
                      <div
                        key={student.id}
                        className="flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-white"
                      >
                        {submission?.imageUrl ? (
                          <button
                            type="button"
                            onClick={() =>
                              setLightboxImage({
                                url: submission.imageUrl!,
                                title: `${student.name} — ${activeAssignment.title}`,
                              })
                            }
                            className="group relative h-44 w-full overflow-hidden bg-slate-100"
                          >
                            <img
                              src={submission.imageUrl}
                              alt={`ผลงานของ ${student.name}`}
                              referrerPolicy="no-referrer"
                              className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                            />
                            <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-md bg-slate-900/75 px-2 py-1 text-[11px] font-medium text-white">
                              <Eye className="h-3 w-3" />
                              ดูภาพใหญ่
                            </span>
                          </button>
                        ) : (
                          <div className="flex h-24 items-center justify-center bg-slate-50 text-xs text-slate-400">
                            ยังไม่ได้แนบไฟล์ภาพ
                          </div>
                        )}

                        <div className="flex flex-1 flex-col justify-between p-3.5">
                          <div>
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="text-sm font-semibold text-slate-900">
                                  {student.name}
                                </div>
                                <div className="text-xs text-slate-500 tabular-nums">
                                  {student.id} · {student.grade}/{student.room} เลขที่ {student.number}
                                </div>
                              </div>
                              {submission?.score !== null && submission?.score !== undefined ? (
                                <span className="inline-flex items-center gap-1 font-mono text-xs font-bold text-emerald-700 tabular-nums">
                                  <Award className="h-3.5 w-3.5" />
                                  {submission.score}/{activeAssignment.maxScore}
                                </span>
                              ) : submission ? (
                                <span className="text-xs font-medium text-amber-700">รอตรวจ</span>
                              ) : (
                                <span className="text-xs text-slate-400">ยังไม่ส่ง</span>
                              )}
                            </div>

                            {submission?.promptText && (
                              <p className="mt-2 line-clamp-2 text-xs text-slate-600">
                                Prompt: {submission.promptText}
                              </p>
                            )}
                          </div>

                          {teacherToken && (
                            <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                              <div className="flex items-center gap-2">
                                <label className="text-xs font-medium text-slate-600 whitespace-nowrap">
                                  คะแนน (/{activeAssignment.maxScore}):
                                </label>
                                <input
                                  type="number"
                                  min={0}
                                  max={activeAssignment.maxScore}
                                  step="0.5"
                                  value={draft.score}
                                  onChange={(e) =>
                                    setGradeDrafts((prev) => ({
                                      ...prev,
                                      [key]: { ...draft, score: e.target.value },
                                    }))
                                  }
                                  className="w-20 rounded border border-slate-300 px-2 py-1 font-mono text-xs tabular-nums outline-none focus:border-blue-600"
                                />
                                <button
                                  type="button"
                                  disabled={isSaving}
                                  onClick={() => handleSaveGrade(student.id, activeAssignment)}
                                  className="ml-auto rounded bg-blue-700 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
                                >
                                  {isSaving ? 'บันทึก...' : 'บันทึกคะแนน'}
                                </button>
                              </div>
                              <input
                                type="text"
                                value={draft.feedback}
                                onChange={(e) =>
                                  setGradeDrafts((prev) => ({
                                    ...prev,
                                    [key]: { ...draft, feedback: e.target.value },
                                  }))
                                }
                                placeholder="ข้อเสนอแนะถึงนักเรียน..."
                                className="w-full rounded border border-slate-200 px-2.5 py-1.5 text-xs outline-none focus:border-blue-600"
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>

              {!teacherToken && submittedCount === 0 && (
                <div className="rounded-lg border border-dashed border-slate-200 py-10 text-center text-sm text-slate-500">
                  ยังไม่มีนักเรียนส่งผลงานสำหรับใบงานนี้ — เป็นคนแรกที่แนบภาพผลงานได้เลย
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Lightbox Modal */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4"
          onClick={() => setLightboxImage(null)}
        >
          <div
            className="max-h-[90vh] max-w-4xl overflow-hidden rounded-xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div className="truncate text-sm font-semibold text-slate-900">
                {lightboxImage.title}
              </div>
              <button
                type="button"
                onClick={() => setLightboxImage(null)}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
                aria-label="ปิดภาพ"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="bg-slate-900/5 p-3">
              <img
                src={lightboxImage.url}
                alt={lightboxImage.title}
                referrerPolicy="no-referrer"
                className="max-h-[75vh] w-auto rounded object-contain"
              />
            </div>
          </div>
        </div>
      )}

      {/* Teacher Create Assignment Modal */}
      {showCreateModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">มอบหมายใบงานใหม่แบบเรียลไทม์</h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateAssignment} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700">ชื่อใบงาน *</label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="เช่น ใบงานที่ 6 : สร้างภาพสินค้าในฝัน"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-600"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700">หัวข้อสั้น</label>
                <input
                  type="text"
                  value={newSubtitle}
                  onChange={(e) => setNewSubtitle(e.target.value)}
                  placeholder="ภารกิจให้นักเรียนปฏิบัติ"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-600"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700">รายละเอียดภารกิจ *</label>
                <textarea
                  rows={3}
                  required
                  value={newMission}
                  onChange={(e) => setNewMission(e.target.value)}
                  placeholder="อธิบายสิ่งที่นักเรียนต้องทำและแนบไฟล์ภาพ"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-600"
                />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700">
                    ตัวอย่าง Prompt (ถ้ามี)
                  </label>
                  <input
                    type="text"
                    value={newSamplePrompt}
                    onChange={(e) => setNewSamplePrompt(e.target.value)}
                    placeholder="ตัวอย่างคำสั่ง Prompt"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">คะแนนเต็ม *</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    required
                    value={newMaxScore}
                    onChange={(e) => setNewMaxScore(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm tabular-nums outline-none focus:border-blue-600"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={creatingAssignment}
                  className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
                >
                  {creatingAssignment ? 'กำลังเผยแพร่...' : 'เผยแพร่ใบงานทันที'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
};
