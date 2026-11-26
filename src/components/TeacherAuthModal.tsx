import React, { useState } from 'react';
import { Lock, ShieldCheck, X } from 'lucide-react';

interface TeacherAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  hasConfiguredPasscode: boolean;
  usesEnvPasscode: boolean;
  onAuthenticated: (token: string) => void;
}

export const TeacherAuthModal: React.FC<TeacherAuthModalProps> = ({
  isOpen,
  onClose,
  hasConfiguredPasscode,
  usesEnvPasscode,
  onAuthenticated,
}) => {
  const [passcode, setPasscode] = useState('');
  const [confirmPasscode, setConfirmPasscode] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const isSetupMode = !hasConfiguredPasscode && !usesEnvPasscode;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (isSetupMode) {
      if (passcode.trim().length < 4) {
        setError('กรุณาตั้งรหัสผ่านอย่างน้อย 4 ตัวอักษร');
        return;
      }
      if (passcode.trim() !== confirmPasscode.trim()) {
        setError('รหัสผ่านทั้งสองช่องไม่ตรงกัน');
        return;
      }
    }

    setSubmitting(true);
    try {
      const endpoint = isSetupMode ? '/api/teacher/setup' : '/api/teacher/login';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode: passcode.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'ไม่สามารถยืนยันตัวตนได้');
        return;
      }
      setPasscode('');
      setConfirmPasscode('');
      onAuthenticated(data.token);
      onClose();
    } catch {
      setError('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="teacher-auth-title"
    >
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-blue-200 bg-blue-50 text-blue-700">
              {isSetupMode ? <ShieldCheck className="h-5 w-5" /> : <Lock className="h-5 w-5" />}
            </div>
            <div>
              <h2 id="teacher-auth-title" className="text-lg font-bold text-slate-900">
                {isSetupMode ? 'ตั้งรหัสผ่านครูผู้สอนครั้งแรก' : 'เข้าสู่โหมดครูผู้สอน'}
              </h2>
              <p className="text-xs text-slate-500">
                {isSetupMode
                  ? 'กำหนดรหัสผ่านสำหรับให้คะแนน ตรวจงาน และมอบหมายใบงานใหม่'
                  : 'สำหรับตรวจงาน ให้คะแนน และปรับแก้สถานะการเข้าเรียน'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            aria-label="ปิดหน้าต่าง"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label htmlFor="teacher-passcode" className="block text-sm font-medium text-slate-700">
              {isSetupMode ? 'กำหนดรหัสผ่านครูผู้สอน (อย่างน้อย 4 ตัวอักษร)' : 'รหัสผ่านครูผู้สอน'}
            </label>
            <input
              id="teacher-passcode"
              type="password"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              placeholder="กรอกรหัสผ่าน..."
              autoFocus
              required
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 outline-none transition-colors focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15"
            />
          </div>

          {isSetupMode && (
            <div>
              <label htmlFor="teacher-passcode-confirm" className="block text-sm font-medium text-slate-700">
                ยืนยันรหัสผ่านอีกครั้ง
              </label>
              <input
                id="teacher-passcode-confirm"
                type="password"
                value={confirmPasscode}
                onChange={(e) => setConfirmPasscode(e.target.value)}
                placeholder="กรอกรหัสผ่านซ้ำอีกครั้ง..."
                required
                className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 outline-none transition-colors focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15"
              />
            </div>
          )}

          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-blue-700 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-800 disabled:opacity-60"
            >
              {submitting ? 'กำลังตรวจสอบ...' : isSetupMode ? 'บันทึกและเข้าสู่โหมดครู' : 'เข้าสู่ระบบ'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
