import React, { useMemo, useState } from 'react';
import { CheckCircle2, Clock, Search, UserCheck, XCircle, AlertTriangle } from 'lucide-react';
import {
  type BangkokNowInfo,
  type ClassroomStatePayload,
  type Student,
  computeStudentAttendanceSummary,
} from '../shared/classroomData';

interface AttendanceCheckinViewProps {
  state: ClassroomStatePayload;
  nowBangkok: BangkokNowInfo;
  selectedStudentId: string;
  onSelectStudent: (studentId: string) => void;
  teacherToken: string | null;
  onStateUpdated: (next: ClassroomStatePayload) => void;
  onNotify: (msg: string, tone: 'success' | 'error') => void;
}

const ROOM_FILTERS = [
  { id: 'all', label: 'ทุกห้อง (20 คน)' },
  { id: '8', label: 'ม.5/8' },
  { id: '9', label: 'ม.5/9' },
  { id: '13', label: 'ม.5/13' },
  { id: '14', label: 'ม.5/14' },
];

export const AttendanceCheckinView: React.FC<AttendanceCheckinViewProps> = ({
  state,
  nowBangkok,
  selectedStudentId,
  onSelectStudent,
  teacherToken,
  onStateUpdated,
  onNotify,
}) => {
  const [roomFilter, setRoomFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [checkingStudentId, setCheckingStudentId] = useState<string | null>(null);
  const [teacherSelectedWeek, setTeacherSelectedWeek] = useState<number>(
    nowBangkok.currentWeek?.week ?? 4
  );

  const filteredStudents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return state.students.filter((s) => {
      if (roomFilter !== 'all' && s.room !== roomFilter) return false;
      if (!q) return true;
      return s.id.includes(q) || s.name.toLowerCase().includes(q);
    });
  }, [state.students, roomFilter, searchQuery]);

  const activeWeek = nowBangkok.currentWeek;
  const displayWeekNumber = teacherToken ? teacherSelectedWeek : activeWeek?.week ?? 4;
  const displayWeekObj =
    state.weeks.find((w) => w.week === displayWeekNumber) ?? state.weeks[3];

  async function handleSelfCheckIn(student: Student) {
    onSelectStudent(student.id);
    setCheckingStudentId(student.id);
    try {
      const res = await fetch('/api/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: student.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        onNotify(data.error || 'ไม่สามารถเช็คชื่อได้', 'error');
        return;
      }
      if (data.state) onStateUpdated(data.state);
      onNotify(data.message || `เช็คชื่อ ${student.name} สำเร็จ`, 'success');
    } catch {
      onNotify('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์เพื่อเช็คชื่อได้', 'error');
    } finally {
      setCheckingStudentId(null);
    }
  }

  async function handleTeacherToggleAttendance(
    student: Student,
    week: number,
    nextStatus: 'present' | 'absent'
  ) {
    if (!teacherToken) return;
    setCheckingStudentId(student.id);
    try {
      const res = await fetch('/api/teacher/attendance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${teacherToken}`,
        },
        body: JSON.stringify({ studentId: student.id, week, status: nextStatus }),
      });
      const data = await res.json();
      if (!res.ok) {
        onNotify(data.error || 'ไม่สามารถอัปเดตการเช็คชื่อได้', 'error');
        return;
      }
      if (data.state) onStateUpdated(data.state);
      onNotify(
        `บันทึก "${nextStatus === 'present' ? 'มาเรียน' : 'ขาด'}" ให้ ${student.name} (สัปดาห์ที่ ${week}) แล้ว`,
        'success'
      );
    } catch {
      onNotify('เกิดข้อผิดพลาดในการบันทึกข้อมูล', 'error');
    } finally {
      setCheckingStudentId(null);
    }
  }

  const todayStats = useMemo(() => {
    let present = 0;
    let absentOrNotChecked = 0;
    for (const s of state.students) {
      const rec = state.attendance[`${s.id}_${displayWeekNumber}`];
      if (rec?.status === 'present') present++;
      else absentOrNotChecked++;
    }
    return { present, absentOrNotChecked };
  }, [state.students, state.attendance, displayWeekNumber]);

  return (
    <section className="space-y-6">
      {/* Status Banner for Thursday 14:55 - 15:50 Window */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500">
              <span>{nowBangkok.weekdayThai}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">{nowBangkok.isoDate}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">เวลาไทย {nowBangkok.timeHHMMSS} น.</span>
              <span aria-hidden="true">·</span>
              <span>เกณฑ์ผ่าน 80% (16/20 สัปดาห์)</span>
            </div>
            <h2 className="text-xl font-bold text-slate-900">
              เช็คชื่อนักเรียนด้วยตนเอง (ทุกวันพฤหัสบดี 14:55 – 15:50 น.)
            </h2>
            <p className="text-sm text-slate-600">{nowBangkok.windowMessage}</p>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            {nowBangkok.isWithinCheckinWindow ? (
              <div className="flex items-center gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                <span>เปิดรับเช็คชื่อ (14:55–15:50 น.)</span>
              </div>
            ) : (
              <div className="flex items-center gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800">
                <Clock className="h-5 w-5 text-amber-600" />
                <span>
                  {nowBangkok.isThursday
                    ? nowBangkok.windowStatus === 'before_window'
                      ? 'ยังไม่ถึงเวลา 14:55 น.'
                      : 'ปิดรับเช็คชื่อ (นอกเวลา)'
                    : 'เฉพาะวันพฤหัสบดีเท่านั้น'}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Teacher Week Selector if signed in as teacher */}
        {teacherToken && (
          <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-slate-700">
              <span className="font-semibold text-blue-700">โหมดครูผู้สอน:</span>{' '}
              เลือกสัปดาห์เพื่อปรับแก้สถานะเข้าเรียนรายบุคคลได้ทันที (สัปดาห์ที่ 1–3 เป็นเครดิตฟรีมาทุกคน)
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="teacher-week-select" className="text-xs font-medium text-slate-500 whitespace-nowrap">
                สัปดาห์ที่ตรวจ:
              </label>
              <select
                id="teacher-week-select"
                value={teacherSelectedWeek}
                onChange={(e) => setTeacherSelectedWeek(Number(e.target.value))}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 outline-none focus:border-blue-600"
              >
                {state.weeks.map((w) => (
                  <option key={w.week} value={w.week}>
                    สัปดาห์ {w.week} ({w.thaiLabel}) {w.isFreeCredit ? '· ฟรีมาทุกคน' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1">
          {ROOM_FILTERS.map((room) => (
            <button
              key={room.id}
              type="button"
              onClick={() => setRoomFilter(room.id)}
              className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                roomFilter === room.id
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {room.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <div className="text-xs text-slate-500 tabular-nums">
            สัปดาห์ที่ {displayWeekObj.week} ({displayWeekObj.thaiLabel}): มาเรียน{' '}
            <span className="font-semibold text-emerald-700">{todayStats.present}</span> / 20 คน
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ค้นหาชื่อ หรือ รหัสนักเรียน..."
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 outline-none transition-colors focus:border-blue-600"
            />
          </div>
        </div>
      </div>

      {/* Student Roster Table / Responsive Cards */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <th className="px-4 py-3 text-center">ลำดับ</th>
                <th className="px-4 py-3">รหัส</th>
                <th className="px-4 py-3">ชื่อ-สกุล</th>
                <th className="px-4 py-3">ชั้น / ห้อง / เลขที่</th>
                <th className="px-4 py-3 text-right">มาเรียนสะสม</th>
                <th className="px-4 py-3">สถานะสัปดาห์ที่ {displayWeekObj.week}</th>
                <th className="px-4 py-3 text-right">เช็คชื่อ / จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredStudents.map((student) => {
                const summary = computeStudentAttendanceSummary(
                  student.id,
                  state.attendance,
                  nowBangkok
                );
                const rec = state.attendance[`${student.id}_${displayWeekObj.week}`];
                const isPresentThisWeek = rec?.status === 'present';
                const isPastOrClosed =
                  !displayWeekObj.isFreeCredit &&
                  (displayWeekObj.date < nowBangkok.isoDate ||
                    (displayWeekObj.date === nowBangkok.isoDate &&
                      nowBangkok.windowStatus === 'after_window'));
                const isAbsent = rec?.status === 'absent' || (!isPresentThisWeek && isPastOrClosed);
                const isSelected = selectedStudentId === student.id;
                const isBusy = checkingStudentId === student.id;

                return (
                  <tr
                    key={student.id}
                    className={`transition-colors hover:bg-slate-50/80 ${
                      isSelected ? 'bg-blue-50/40' : ''
                    }`}
                  >
                    <td className="px-4 py-3 text-center font-mono text-xs text-slate-500 tabular-nums">
                      {student.order}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs font-medium text-slate-700 tabular-nums">
                      {student.id}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => onSelectStudent(student.id)}
                        className="text-left font-medium text-slate-900 hover:text-blue-700"
                      >
                        {student.name}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 tabular-nums">
                      {student.grade}/{student.room} · เลขที่ {student.number}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <div className="font-semibold text-slate-900">
                        {summary.presentCount}/20{' '}
                        <span className="text-xs font-normal text-slate-500">
                          ({summary.percentOf20.toFixed(0)}%)
                        </span>
                      </div>
                      <div
                        className={`text-[11px] font-medium ${
                          summary.meets80Now
                            ? 'text-emerald-700'
                            : summary.canStillPass80
                              ? 'text-slate-500'
                              : 'text-red-700'
                        }`}
                      >
                        {summary.meets80Now
                          ? 'ผ่านเกณฑ์ 80%'
                          : summary.canStillPass80
                            ? `ต้องการอีก ${Math.max(0, summary.requiredWeeks - summary.presentCount)} ครั้ง`
                            : 'ไม่ถึงเกณฑ์ 80%'}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {isPresentThisWeek ? (
                        <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                          <CheckCircle2 className="h-4 w-4 shrink-0" />
                          <span>
                            {rec?.source === 'free_credit'
                              ? 'มาเรียน (ฟรีทุกคน)'
                              : rec?.source === 'teacher'
                                ? 'มาเรียน (ครูบันทึก)'
                                : 'มาเรียนแล้ว'}
                          </span>
                        </div>
                      ) : isAbsent ? (
                        <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700">
                          <XCircle className="h-4 w-4 shrink-0" />
                          <span>ขาด / ไม่เข้าชุมนุม</span>
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500">
                          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                          <span>
                            {nowBangkok.isWithinCheckinWindow ? 'รอเช็คชื่อ' : 'ยังไม่ถึงเวลา'}
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {teacherToken ? (
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() =>
                              handleTeacherToggleAttendance(student, displayWeekObj.week, 'present')
                            }
                            className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                              isPresentThisWeek
                                ? 'bg-emerald-700 text-white'
                                : 'border border-slate-200 bg-white text-slate-700 hover:bg-emerald-50 hover:text-emerald-800'
                            }`}
                          >
                            มา
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() =>
                              handleTeacherToggleAttendance(student, displayWeekObj.week, 'absent')
                            }
                            className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                              rec?.status === 'absent'
                                ? 'bg-red-700 text-white'
                                : 'border border-slate-200 bg-white text-slate-700 hover:bg-red-50 hover:text-red-800'
                            }`}
                          >
                            ขาด
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={
                            isBusy || isPresentThisWeek || !nowBangkok.isWithinCheckinWindow
                          }
                          onClick={() => handleSelfCheckIn(student)}
                          className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors ${
                            isPresentThisWeek
                              ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                              : nowBangkok.isWithinCheckinWindow
                                ? 'bg-blue-700 text-white hover:bg-blue-800'
                                : 'cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400'
                          }`}
                        >
                          <UserCheck className="h-3.5 w-3.5" />
                          <span>
                            {isBusy
                              ? 'กำลังบันทึก...'
                              : isPresentThisWeek
                                ? 'เช็คชื่อแล้ว'
                                : nowBangkok.isWithinCheckinWindow
                                  ? 'เช็คชื่อเข้าชุมนุม'
                                  : 'ปิดรับเช็คชื่อ'}
                          </span>
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filteredStudents.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-500">
                    ไม่พบรายชื่อนักเรียนที่ตรงกับคำค้นหา
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
};
