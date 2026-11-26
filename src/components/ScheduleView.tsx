import React from 'react';
import { CalendarDays, CheckCircle2, Clock, XCircle } from 'lucide-react';
import {
  type BangkokNowInfo,
  type ClassroomStatePayload,
  CHECKIN_END_MINUTES,
} from '../shared/classroomData';

interface ScheduleViewProps {
  state: ClassroomStatePayload;
  nowBangkok: BangkokNowInfo;
}

export const ScheduleView: React.FC<ScheduleViewProps> = ({ state, nowBangkok }) => {
  return (
    <section className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900">
              ตารางเรียน 20 สัปดาห์ (ทุกวันพฤหัสบดี 14:55 – 15:50 น.)
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              วันที่ 5, 12, 19 พ.ย. 69 บันทึกมาเรียนฟรีทุกคน · เริ่มเช็คชื่อจริงตั้งแต่วันพฤหัสบดีที่ 26 พ.ย. 69 เป็นต้นไป · เกณฑ์ผ่าน 80% (16/20 สัปดาห์)
            </p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-medium text-slate-700">
            <CalendarDays className="h-4 w-4 text-blue-700" />
            <span className="tabular-nums">รวมทั้งหมด 20 สัปดาห์</span>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {state.weeks.map((week) => {
            const isToday = week.date === nowBangkok.isoDate;
            const isPast = week.date < nowBangkok.isoDate;
            const presentCount = state.students.filter(
              (s) => state.attendance[`${s.id}_${week.week}`]?.status === 'present'
            ).length;

            return (
              <div
                key={week.week}
                className={`rounded-lg border p-3.5 transition-colors ${
                  isToday
                    ? 'border-blue-600 bg-blue-50/50'
                    : week.isFreeCredit
                      ? 'border-emerald-200 bg-emerald-50/40'
                      : 'border-slate-200 bg-white'
                }`}
              >
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-mono font-bold text-slate-900 tabular-nums">
                    สัปดาห์ {week.week} · {week.thaiLabel}
                  </span>
                  {week.isFreeCredit ? (
                    <span className="font-semibold text-emerald-700">ฟรีทุกคน</span>
                  ) : isToday ? (
                    <span className="font-semibold text-blue-700">วันนี้</span>
                  ) : isPast ? (
                    <span className="text-slate-500">ผ่านมาแล้ว</span>
                  ) : (
                    <span className="text-slate-400">กำหนดการ</span>
                  )}
                </div>
                <p className="mt-1.5 line-clamp-2 text-xs text-slate-700">{week.topic}</p>
                <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-500 tabular-nums">
                  <span>14:55–15:50 น.</span>
                  <span className="font-medium text-slate-700">มาเรียน {presentCount}/20</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Full 20-Week Attendance Matrix */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-4">
          <h3 className="text-base font-bold text-slate-900">
            ตารางสรุปการเข้าเรียนรายสัปดาห์ (20 สัปดาห์ × 20 คน)
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">
            เครื่องหมาย ✓ = มาเรียน · ✕ = ขาด / ไม่เข้าชุมนุม · · = ยังไม่ถึงกำหนด
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2.5 text-left font-semibold">
                  ชื่อ-สกุล
                </th>
                {state.weeks.map((w) => (
                  <th
                    key={w.week}
                    title={`สัปดาห์ ${w.week}: ${w.thaiLabel}`}
                    className={`px-2 py-2.5 text-center font-mono tabular-nums ${
                      w.date === nowBangkok.isoDate ? 'bg-blue-50 text-blue-800' : ''
                    }`}
                  >
                    <div>W{w.week}</div>
                    <div className="text-[10px] font-normal text-slate-400">
                      {w.thaiLabel.replace(' 69', '').replace(' 70', '')}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {state.students.map((student) => (
                <tr key={student.id} className="hover:bg-slate-50/70">
                  <td className="sticky left-0 z-10 whitespace-nowrap bg-white px-3 py-2 font-medium text-slate-900">
                    {student.order}. {student.name}
                  </td>
                  {state.weeks.map((w) => {
                    const rec = state.attendance[`${student.id}_${w.week}`];
                    const isPresent = rec?.status === 'present';
                    const isPastClosed =
                      !w.isFreeCredit &&
                      (w.date < nowBangkok.isoDate ||
                        (w.date === nowBangkok.isoDate &&
                          nowBangkok.totalMinutes > CHECKIN_END_MINUTES));
                    const isAbsent = rec?.status === 'absent' || (!isPresent && isPastClosed);

                    return (
                      <td
                        key={w.week}
                        className={`px-2 py-2 text-center ${
                          w.date === nowBangkok.isoDate ? 'bg-blue-50/40' : ''
                        }`}
                      >
                        {isPresent ? (
                          <CheckCircle2
                            className="mx-auto h-4 w-4 text-emerald-600"
                            aria-label="มาเรียน"
                          />
                        ) : isAbsent ? (
                          <XCircle
                            className="mx-auto h-4 w-4 text-red-600"
                            aria-label="ขาด"
                          />
                        ) : (
                          <Clock
                            className="mx-auto h-3.5 w-3.5 text-slate-300"
                            aria-label="ยังไม่ถึงเวลา"
                          />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
};
