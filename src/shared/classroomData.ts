export interface Student {
  order: number;
  id: string;
  name: string;
  grade: string;
  room: string;
  number: number;
}

export interface SessionWeek {
  week: number;
  date: string; // YYYY-MM-DD in Asia/Bangkok
  thaiLabel: string;
  isFreeCredit: boolean;
  topic: string;
}

export interface AssignmentField {
  key: string;
  label: string;
  placeholder: string;
  multiline?: boolean;
  options?: string[];
}

export interface Assignment {
  id: string;
  order: number;
  title: string;
  subtitle: string;
  mission: string;
  description: string;
  steps?: string[];
  samplePrompt?: string;
  sampleImageUrl?: string;
  topicOptions?: string[];
  fields: AssignmentField[];
  maxScore: number;
  isPublished: boolean;
  createdAt: string;
}

export interface AttendanceRecord {
  studentId: string;
  week: number;
  status: 'present' | 'absent';
  checkedAt: string | null;
  source: 'free_credit' | 'self_checkin' | 'teacher';
}

export interface Submission {
  id: string;
  assignmentId: string;
  studentId: string;
  answers: Record<string, string>;
  promptText: string;
  imageUrl: string | null;
  imageOriginalName: string | null;
  score: number | null;
  feedback: string;
  submittedAt: string;
  gradedAt: string | null;
}

export interface ClassroomStatePayload {
  students: Student[];
  weeks: SessionWeek[];
  assignments: Assignment[];
  attendance: Record<string, AttendanceRecord>; // key: `${studentId}_${week}`
  submissions: Record<string, Submission>; // key: `${assignmentId}_${studentId}`
  teacherAuth: {
    hasConfiguredPasscode: boolean;
    usesEnvPasscode: boolean;
  };
  serverNowBangkok: BangkokNowInfo;
}

export interface BangkokNowInfo {
  isoDate: string; // YYYY-MM-DD
  weekdayIndex: number; // 0=Sun..4=Thu..6=Sat
  weekdayThai: string;
  timeHHMM: string;
  timeHHMMSS: string;
  totalMinutes: number;
  isThursday: boolean;
  isWithinCheckinWindow: boolean;
  currentWeek: SessionWeek | null;
  windowStatus: 'open' | 'before_window' | 'after_window' | 'not_thursday' | 'out_of_term';
  windowMessage: string;
}

export const CHECKIN_START_MINUTES = 14 * 60 + 55; // 14:55
export const CHECKIN_END_MINUTES = 15 * 60 + 50; // 15:50
export const ATTENDANCE_PASS_PERCENT = 80;
export const TOTAL_WEEKS = 20;

export const STUDENTS: Student[] = [
  { order: 1, id: '29520', name: 'นายอภิสิทธิ์ จันทร์เพ็ญ', grade: 'ม.5', room: '8', number: 5 },
  { order: 2, id: '29720', name: 'นายเอกรินทร์ สุขเจริญเวก', grade: 'ม.5', room: '8', number: 15 },
  { order: 3, id: '29767', name: 'นางสาวฐิติพร แซ่ฟุ้ง', grade: 'ม.5', room: '8', number: 20 },
  { order: 4, id: '29564', name: 'นางสาวขวัญจิรา ประสารรส', grade: 'ม.5', room: '9', number: 9 },
  { order: 5, id: '29576', name: 'นางสาวพิมพ์อัปสร ฉายแก้ว', grade: 'ม.5', room: '9', number: 10 },
  { order: 6, id: '29645', name: 'นางสาวกัลยรัตน์ สมปอง', grade: 'ม.5', room: '9', number: 15 },
  { order: 7, id: '29659', name: 'นางสาวรัตณาวดี อัคฮาด', grade: 'ม.5', room: '9', number: 18 },
  { order: 8, id: '29761', name: 'นายอนุพนธ์ ประไว', grade: 'ม.5', room: '9', number: 26 },
  { order: 9, id: '29765', name: 'นางสาวจิดาพา แก่นเดียว', grade: 'ม.5', room: '9', number: 27 },
  { order: 10, id: '29815', name: 'นางสาวภัทราวดี สมนิยาม', grade: 'ม.5', room: '9', number: 30 },
  { order: 11, id: '29863', name: 'นางสาวสุชญา เซี่ยงเห็น', grade: 'ม.5', room: '9', number: 32 },
  { order: 12, id: '29673', name: 'นายณัฐภัทร วงศ์เสนา', grade: 'ม.5', room: '13', number: 8 },
  { order: 13, id: '29879', name: 'นายศีลวัศ ชวนเปล่งสกุล', grade: 'ม.5', room: '13', number: 15 },
  { order: 14, id: '32262', name: 'นายญาณวัฒน์ กรีฑา', grade: 'ม.5', room: '13', number: 30 },
  { order: 15, id: '32264', name: 'นายศรัญชัย ละม้ายนิล', grade: 'ม.5', room: '13', number: 32 },
  { order: 16, id: '32266', name: 'นายอดิเทพ ชมภูพื้น', grade: 'ม.5', room: '13', number: 34 },
  { order: 17, id: '29497', name: 'นางสาวสิริลดา เอ็นยอด', grade: 'ม.5', room: '14', number: 6 },
  { order: 18, id: '29804', name: 'นางสาวโจแอน ไมโค', grade: 'ม.5', room: '14', number: 20 },
  { order: 19, id: '29882', name: 'นางสาวกัญญารัตน์ ชอบเสร็จ', grade: 'ม.5', room: '14', number: 23 },
  { order: 20, id: '32267', name: 'นางสาวณัฐณิชา เชื้อสายดวง', grade: 'ม.5', room: '14', number: 30 },
];

const THAI_MONTHS_SHORT = [
  'ม.ค.',
  'ก.พ.',
  'มี.ค.',
  'เม.ย.',
  'พ.ค.',
  'มิ.ย.',
  'ก.ค.',
  'ส.ค.',
  'ก.ย.',
  'ต.ค.',
  'พ.ย.',
  'ธ.ค.',
];

function build20Weeks(): SessionWeek[] {
  const startUtc = Date.UTC(2026, 10, 5); // 2026-11-05 (Thursday)
  const freeDates = new Set(['2026-11-05', '2026-11-12', '2026-11-19']);
  const topics = [
    'ปฐมนิเทศชุมนุม AI สร้างภาพ (ฟรีเวลาเรียน)',
    'พื้นฐานการใช้ ChatGPT สร้างภาพ (ฟรีเวลาเรียน)',
    'ทดลองสร้างภาพแนวคิดสร้างสรรค์ (ฟรีเวลาเรียน)',
    'ใบงานที่ 1 : โลกในจินตนาการของฉัน (เริ่มเช็คชื่อจริง)',
    'ใบงานที่ 2 : ศิลปะการเขียน Prompt สั่ง AI',
    'ฝึกประกอบองค์ประกอบ Prompt เชิงลึก',
    'ใบงานที่ 3 : สร้างตัวละคร 3D ด้วย AI สร้างภาพ',
    'ออกแบบบุคลิกและท่าทางตัวละคร 3D',
    'ทบทวนผลงานครึ่งภาคเรียนแรก',
    'ใบงานที่ 4 : ออกแบบโปสเตอร์ประชาสัมพันธ์ด้วย AI',
    'การจัดวางองค์ประกอบโปสเตอร์และโทนสี',
    'นำเสนอผลงานโปสเตอร์ประชาสัมพันธ์',
    'ใบงานที่ 5 : วางแผนโครงงานสร้างสรรค์ภาพด้วย AI',
    'พัฒนาโครงงาน AI Creative Project (ขั้นที่ 1)',
    'พัฒนาโครงงาน AI Creative Project (ขั้นที่ 2)',
    'ปรับปรุงความคมชัดและรายละเอียดผลงาน',
    'เตรียมนำเสนอโครงงานสร้างสรรค์ภาพ',
    'นำเสนอโครงงาน AI Creative Project (กลุ่มที่ 1)',
    'นำเสนอโครงงาน AI Creative Project (กลุ่มที่ 2)',
    'สรุปผลการเรียนรู้และประเมินคะแนนรวม 100 คะแนน',
  ];

  const weeks: SessionWeek[] = [];
  for (let i = 0; i < TOTAL_WEEKS; i++) {
    const dt = new Date(startUtc + i * 7 * 24 * 60 * 60 * 1000);
    const y = dt.getUTCFullYear();
    const m = dt.getUTCMonth();
    const d = dt.getUTCDate();
    const isoDate = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const beYearShort = String((y + 543) % 100);
    const thaiLabel = `${d} ${THAI_MONTHS_SHORT[m]} ${beYearShort}`;
    weeks.push({
      week: i + 1,
      date: isoDate,
      thaiLabel,
      isFreeCredit: freeDates.has(isoDate),
      topic: topics[i] ?? `สัปดาห์ที่ ${i + 1}`,
    });
  }
  return weeks;
}

export const SESSION_WEEKS: SessionWeek[] = build20Weeks();

export const INITIAL_ASSIGNMENTS: Assignment[] = [
  {
    id: 'worksheet-1',
    order: 1,
    title: 'ใบงานที่ 1 : รู้จัก AI สร้างภาพด้วย ChatGPT',
    subtitle: 'ภารกิจ: สร้างภาพหัวข้อ "โลกในจินตนาการของฉัน"',
    mission:
      'สร้างภาพเมืองแห่งอนาคต มีตึกสูงล้ำสมัย รถยนต์บินได้ ต้นไม้สีเขียวจำนวนมาก มีแม่น้ำไหลผ่าน บรรยากาศสดใส สไตล์ภาพ 3D สมจริง ความละเอียดสูง',
    description:
      'ให้นักเรียนทดลองใช้ ChatGPT สร้างภาพตามหัวข้อ "โลกในจินตนาการของฉัน" จากนั้นบันทึกภาพผลงานและแนบไฟล์ภาพส่งในระบบพร้อมระบุ Prompt ที่ใช้',
    samplePrompt:
      'สร้างภาพเมืองแห่งอนาคต มีตึกสูงล้ำสมัย รถยนต์บินได้ ต้นไม้สีเขียวจำนวนมาก มีแม่น้ำไหลผ่าน บรรยากาศสดใส สไตล์ภาพ 3D สมจริง ความละเอียดสูง',
    sampleImageUrl: '/src/assets/images/sample_future_city_1795676944388.jpg',
    fields: [
      {
        key: 'concept',
        label: 'แนวคิดโลกในจินตนาการของฉัน',
        placeholder: 'อธิบายสั้นๆ ว่าเมืองอนาคตในภาพของนักเรียนมีจุดเด่นอะไรบ้าง',
        multiline: true,
      },
    ],
    maxScore: 20,
    isPublished: true,
    createdAt: '2026-11-26T00:00:00+07:00',
  },
  {
    id: 'worksheet-2',
    order: 2,
    title: 'ใบงานที่ 2 : ศิลปะการเขียน Prompt สั่ง AI',
    subtitle: 'ภารกิจ: เขียน Prompt เพื่อสร้างภาพหัวข้อ "โรงเรียนในฝัน"',
    mission: 'ให้นักเรียนออกแบบคำสั่งทั้ง 5 องค์ประกอบ พร้อมประกอบเป็น Prompt ฉบับสมบูรณ์และแนบรูปภาพที่สร้างได้',
    description: 'ออกแบบองค์ประกอบคำสั่งทั้ง 5 ส่วนให้ชัดเจน เพื่อควบคุมผลลัพธ์ภาพโรงเรียนในฝันให้ตรงตามจินตนาการ',
    fields: [
      { key: 'subject', label: '1. ตัวแบบหลัก', placeholder: 'เช่น อาคารเรียนทรงโมเดิร์น 3 ชั้น และนักเรียนกำลังทำกิจกรรม' },
      { key: 'setting', label: '2. ฉากหรือสถานที่', placeholder: 'เช่น สนามหญ้าสีเขียว ห้องสมุดกระจกใส ล้อมรอบด้วยต้นไม้ใหญ่' },
      { key: 'style', label: '3. รูปแบบภาพ', placeholder: 'เช่น 3D Architectural Render สมจริง ความละเอียดสูง' },
      { key: 'palette', label: '4. โทนสี', placeholder: 'เช่น สีฟ้าคราม ขาวสะอาด เขียวมรกต และแสงแดดอุ่น' },
      { key: 'mood', label: '5. บรรยากาศ', placeholder: 'เช่น สดใส อบอุ่น น่าเรียนรู้ ทันสมัยและเป็นมิตรกับสิ่งแวดล้อม' },
    ],
    maxScore: 20,
    isPublished: true,
    createdAt: '2026-11-26T00:00:00+07:00',
  },
  {
    id: 'worksheet-3',
    order: 3,
    title: 'ใบงานที่ 3 : สร้างตัวละคร 3D ด้วย AI สร้างภาพ',
    subtitle: 'ภารกิจ: ให้นักเรียนสร้างตัวละครประจำตัว (My AI Character)',
    mission: 'ออกแบบตัวละครประจำตัว 3D Cartoon ตามขั้นตอนทั้ง 5 ข้อ และแนบภาพตัวละครที่สร้างด้วย ChatGPT',
    description: 'กำหนดอัตลักษณ์ของตัวละครให้ชัดเจนครบทั้งชื่อ ลักษณะภายนอก การแต่งกาย บุคลิก และ Prompt',
    steps: [
      '1. กำหนดชื่อตัวละคร',
      '2. ออกแบบลักษณะภายนอก',
      '3. กำหนดเครื่องแต่งกาย',
      '4. กำหนดบุคลิกและท่าทาง',
      '5. เขียน Prompt และสร้างภาพด้วย ChatGPT',
    ],
    samplePrompt:
      'สร้างตัวละครนักเรียนไทยในรูปแบบ 3D Cartoon น่ารัก สดใส สวมชุดนักเรียน มีรอยยิ้ม ร่าเริง ยืนเต็มตัว พื้นหลังสีขาว แสงสวยงาม รายละเอียดคมชัด สไตล์แอนิเมชันระดับมืออาชีพ',
    fields: [
      { key: 'characterName', label: '1. ชื่อตัวละคร', placeholder: 'เช่น น้องเอไอ / พี่สายฟ้า' },
      { key: 'appearance', label: '2. ลักษณะภายนอก', placeholder: 'เช่น ทรงผม สีตา รูปร่าง ลักษณะใบหน้า' },
      { key: 'outfit', label: '3. เครื่องแต่งกาย', placeholder: 'เช่น ชุดนักเรียนไทย เสื้อกั๊ก หรือชุดลำลองประจำตัว' },
      { key: 'personality', label: '4. บุคลิกและท่าทาง', placeholder: 'เช่น ยิ้มแย้ม ร่าเริง ยกมือทักทาย ถือแท็บเล็ต' },
    ],
    maxScore: 20,
    isPublished: true,
    createdAt: '2026-11-26T00:00:00+07:00',
  },
  {
    id: 'worksheet-4',
    order: 4,
    title: 'ใบงานที่ 4 : ออกแบบโปสเตอร์ประชาสัมพันธ์ด้วย AI',
    subtitle: 'ภารกิจ: สร้างโปสเตอร์ประชาสัมพันธ์ 1 ชิ้น โดยเลือกหัวข้อที่กำหนด',
    mission: 'เลือก 1 หัวข้อ แล้วออกแบบโปสเตอร์ให้มีองค์ประกอบครบทั้ง 5 ข้อ พร้อมภาพประกอบแนวตั้งอัตราส่วน A4',
    description: 'ฝึกการสั่ง AI สร้างโปสเตอร์สื่อสารความหมายชัดเจน อ่านง่าย และจัดองค์ประกอบอย่างเหมาะสม',
    topicOptions: [
      'รณรงค์รักษาสิ่งแวดล้อม',
      'ต่อต้านยาเสพติด',
      'ประชาสัมพันธ์กิจกรรมโรงเรียน',
      'ส่งเสริมการใช้เทคโนโลยีอย่างปลอดภัย',
      'โรงเรียนในฝัน',
    ],
    steps: [
      '1. หัวข้อโปสเตอร์',
      '2. ภาพประกอบที่สร้างด้วย AI',
      '3. ข้อความประชาสัมพันธ์',
      '4. การจัดวางองค์ประกอบอย่างเหมาะสม',
      '5. สีสันสวยงามและอ่านง่าย',
    ],
    samplePrompt:
      'ออกแบบโปสเตอร์รณรงค์รักษาสิ่งแวดล้อมในโรงเรียน สไตล์ 3D Modern Design มีนักเรียนช่วยกันปลูกต้นไม้ มีโลกสีเขียวเป็นองค์ประกอบหลัก โทนสีเขียวและขาว จัดองค์ประกอบสวยงามแบบโปสเตอร์ประชาสัมพันธ์ อัตราส่วน A4 แนวตั้ง',
    fields: [
      {
        key: 'selectedTopic',
        label: 'หัวข้อโปสเตอร์ที่เลือก',
        placeholder: 'เลือกหัวข้อ',
        options: [
          'รณรงค์รักษาสิ่งแวดล้อม',
          'ต่อต้านยาเสพติด',
          'ประชาสัมพันธ์กิจกรรมโรงเรียน',
          'ส่งเสริมการใช้เทคโนโลยีอย่างปลอดภัย',
          'โรงเรียนในฝัน',
        ],
      },
      { key: 'headline', label: 'หัวข้อ / พาดหัวบนโปสเตอร์', placeholder: 'เช่น ร่วมใจรักษ์โลก โรงเรียนสีเขียว' },
      { key: 'copyText', label: 'ข้อความประชาสัมพันธ์', placeholder: 'ข้อความเชิญชวนสั้นๆ กระชับ อ่านง่าย', multiline: true },
      { key: 'colorLayout', label: 'การจัดวางและโทนสี', placeholder: 'เช่น โทนสีเขียว-ขาว อัตราส่วน A4 แนวตั้ง' },
    ],
    maxScore: 20,
    isPublished: true,
    createdAt: '2026-11-26T00:00:00+07:00',
  },
  {
    id: 'worksheet-5',
    order: 5,
    title: 'ใบงานที่ 5 : โครงงานสร้างสรรค์ภาพด้วย AI (AI Creative Project)',
    subtitle: 'ภารกิจใหญ่: สร้างผลงานสื่อสร้างสรรค์ด้วย ChatGPT จำนวน 1 ผลงาน โดยเลือกหัวข้อได้อย่างอิสระ',
    mission: 'เลือกประเภทผลงานหรือกำหนดหัวข้อด้วยตนเอง สร้างสรรค์ภาพผลงานชิ้นเอก 1 ชิ้น พร้อมอธิบายแนวคิดและแนบไฟล์ภาพ',
    description: 'ประมวลความรู้การเขียน Prompt และการจัดองค์ประกอบภาพตลอด 20 สัปดาห์มาสร้างโครงงานชิ้นสมบูรณ์',
    topicOptions: [
      'ภาพประกอบนิทาน',
      'ภาพประชาสัมพันธ์กิจกรรม',
      'ภาพตัวละครการ์ตูน',
      'ภาพโลกอนาคต',
      'ภาพสื่อการเรียนรู้',
      'ภาพรณรงค์เพื่อสังคม',
      'หัวข้ออิสระ (กำหนดเอง)',
    ],
    fields: [
      {
        key: 'projectCategory',
        label: 'ประเภทผลงานที่เลือก',
        placeholder: 'เลือกประเภทผลงาน',
        options: [
          'ภาพประกอบนิทาน',
          'ภาพประชาสัมพันธ์กิจกรรม',
          'ภาพตัวละครการ์ตูน',
          'ภาพโลกอนาคต',
          'ภาพสื่อการเรียนรู้',
          'ภาพรณรงค์เพื่อสังคม',
          'หัวข้ออิสระ (กำหนดเอง)',
        ],
      },
      { key: 'projectTitle', label: 'ชื่อผลงานโครงงาน', placeholder: 'ตั้งชื่อผลงานของนักเรียน' },
      { key: 'projectGoal', label: 'วัตถุประสงค์ / แนวคิดการออกแบบ', placeholder: 'อธิบายแรงบันดาลใจและสิ่งที่ต้องการสื่อสาร', multiline: true },
    ],
    maxScore: 20,
    isPublished: true,
    createdAt: '2026-11-26T00:00:00+07:00',
  },
];

const WEEKDAY_THAI: Record<string, { index: number; label: string }> = {
  Sun: { index: 0, label: 'วันอาทิตย์' },
  Mon: { index: 1, label: 'วันจันทร์' },
  Tue: { index: 2, label: 'วันอังคาร' },
  Wed: { index: 3, label: 'วันพุธ' },
  Thu: { index: 4, label: 'วันพฤหัสบดี' },
  Fri: { index: 5, label: 'วันศุกร์' },
  Sat: { index: 6, label: 'วันเสาร์' },
};

export function getBangkokNowInfo(dateInput: Date = new Date()): BangkokNowInfo {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
  });

  const parts = formatter.formatToParts(dateInput);
  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = p.value;
  }

  const year = map.year ?? '2026';
  const month = map.month ?? '11';
  const day = map.day ?? '26';
  const hour = Number(map.hour ?? '0');
  const minute = Number(map.minute ?? '0');
  const second = Number(map.second ?? '0');
  const weekdayShort = map.weekday ?? 'Thu';
  const weekdayInfo = WEEKDAY_THAI[weekdayShort] ?? { index: 4, label: 'วันพฤหัสบดี' };

  const isoDate = `${year}-${month}-${day}`;
  const timeHHMM = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  const timeHHMMSS = `${timeHHMM}:${String(second).padStart(2, '0')}`;
  const totalMinutes = hour * 60 + minute;
  const isThursday = weekdayInfo.index === 4;
  const currentWeek = SESSION_WEEKS.find((w) => w.date === isoDate) ?? null;
  const isWithinCheckinWindow =
    isThursday &&
    currentWeek !== null &&
    !currentWeek.isFreeCredit &&
    totalMinutes >= CHECKIN_START_MINUTES &&
    totalMinutes <= CHECKIN_END_MINUTES;

  let windowStatus: BangkokNowInfo['windowStatus'] = 'not_thursday';
  let windowMessage = 'วันอื่นไม่สามารถเช็คชื่อได้ (เปิดเฉพาะวันพฤหัสบดี 14:55 – 15:50 น.)';

  if (!isThursday) {
    windowStatus = 'not_thursday';
    windowMessage = `วันนี้${weekdayInfo.label} ไม่สามารถเช็คชื่อได้ (เปิดเฉพาะวันพฤหัสบดี เวลา 14:55 – 15:50 น.)`;
  } else if (!currentWeek) {
    windowStatus = 'out_of_term';
    windowMessage = 'วันพฤหัสบดีนี้ไม่อยู่ในช่วง 20 สัปดาห์ของตารางเรียนชุมนุม (5 พ.ย. 69 – 18 มี.ค. 70)';
  } else if (currentWeek.isFreeCredit) {
    windowStatus = 'open';
    windowMessage = `สัปดาห์ที่ ${currentWeek.week} (${currentWeek.thaiLabel}) บันทึกมาเรียนฟรีทุกคนแล้ว`;
  } else if (totalMinutes < CHECKIN_START_MINUTES) {
    windowStatus = 'before_window';
    windowMessage = `ยังไม่ถึงเวลาเช็คชื่อ เปิดเช็คชื่อเวลา 14:55 – 15:50 น. (สัปดาห์ที่ ${currentWeek.week}: ${currentWeek.thaiLabel})`;
  } else if (totalMinutes > CHECKIN_END_MINUTES) {
    windowStatus = 'after_window';
    windowMessage = `หมดเวลาเช็คชื่อแล้ว (14:55 – 15:50 น.) ผู้ที่ไม่ได้เช็คชื่อระบบนับเป็น "ขาด / ไม่เข้าชุมนุม"`;
  } else {
    windowStatus = 'open';
    windowMessage = `เปิดให้เช็คชื่อขณะนี้! สัปดาห์ที่ ${currentWeek.week} (${currentWeek.thaiLabel}) เวลา 14:55 – 15:50 น.`;
  }

  return {
    isoDate,
    weekdayIndex: weekdayInfo.index,
    weekdayThai: weekdayInfo.label,
    timeHHMM,
    timeHHMMSS,
    totalMinutes,
    isThursday,
    isWithinCheckinWindow,
    currentWeek,
    windowStatus,
    windowMessage,
  };
}

export function formatThaiDateBE(isoDate: string): string {
  const [yStr, mStr, dStr] = isoDate.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  const d = Number(dStr);
  if (!y || !m || !d) return isoDate;
  return `${d} ${THAI_MONTHS_SHORT[m - 1] ?? ''} ${y + 543}`;
}

export function computeStudentAttendanceSummary(
  studentId: string,
  attendance: Record<string, AttendanceRecord>,
  nowBangkok: BangkokNowInfo
) {
  let presentCount = 0;
  let absentCount = 0;
  let upcomingCount = 0;
  let elapsedWeeks = 0;

  for (const w of SESSION_WEEKS) {
    const rec = attendance[`${studentId}_${w.week}`];
    if (w.isFreeCredit) {
      if (rec?.status === 'absent') {
        absentCount++;
      } else {
        presentCount++;
      }
      elapsedWeeks++;
      continue;
    }

    const isPastDate = w.date < nowBangkok.isoDate;
    const isTodayClosed = w.date === nowBangkok.isoDate && nowBangkok.totalMinutes > CHECKIN_END_MINUTES;

    if (rec?.status === 'present') {
      presentCount++;
      elapsedWeeks++;
    } else if (rec?.status === 'absent' || isPastDate || isTodayClosed) {
      absentCount++;
      elapsedWeeks++;
    } else {
      upcomingCount++;
    }
  }

  const percentOf20 = Math.round((presentCount / TOTAL_WEEKS) * 1000) / 10;
  const maxPossiblePercent = Math.round(((presentCount + upcomingCount) / TOTAL_WEEKS) * 1000) / 10;
  const meets80Now = percentOf20 >= ATTENDANCE_PASS_PERCENT;
  const canStillPass80 = maxPossiblePercent >= ATTENDANCE_PASS_PERCENT;

  return {
    presentCount,
    absentCount,
    upcomingCount,
    elapsedWeeks,
    percentOf20,
    maxPossiblePercent,
    meets80Now,
    canStillPass80,
    requiredWeeks: Math.ceil((TOTAL_WEEKS * ATTENDANCE_PASS_PERCENT) / 100), // 16
  };
}
