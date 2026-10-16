import type {
  Department,
  OrderStatus,
  ExpenseCategory,
  IdType,
  ManualRoomStatus,
  PaymentMethod,
  ReservationStatus,
  RoomStatus,
  RoomType,
} from './types';

export const ROOM_TYPE_LABELS: Record<RoomType, string> = {
  single: 'غرفة فردية',
  double: 'غرفة مزدوجة',
  twin: 'غرفة سريرين',
  triple: 'غرفة ثلاثية',
  family: 'غرفة عائلية',
  deluxe: 'غرفة ديلوكس',
  suite: 'جناح',
};

export const ROOM_STATUS_LABELS: Record<RoomStatus, string> = {
  available: 'متاحة',
  occupied: 'مشغولة',
  reserved: 'محجوزة',
  cleaning: 'قيد التنظيف',
  maintenance: 'تحت الصيانة',
};

export const MANUAL_ROOM_STATUSES: ManualRoomStatus[] = ['available', 'cleaning', 'maintenance'];

export const RESERVATION_STATUS_LABELS: Record<ReservationStatus, string> = {
  confirmed: 'مؤكد',
  checked_in: 'تم تسجيل الوصول',
  checked_out: 'تمت المغادرة',
  cancelled: 'ملغي',
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'نقدًا',
  card: 'بطاقة',
  bank_transfer: 'تحويل بنكي',
};

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  salaries: 'رواتب وأجور',
  utilities: 'كهرباء ومياه وخدمات',
  maintenance: 'صيانة',
  supplies: 'مشتريات ومستلزمات',
  cleaning: 'نظافة',
  marketing: 'تسويق وإعلان',
  taxes: 'ضرائب ورسوم',
  other: 'أخرى',
};

export const ID_TYPE_LABELS: Record<IdType, string> = {
  '': 'غير محدد',
  national_id: 'بطاقة هوية وطنية',
  passport: 'جواز سفر',
  driving_license: 'رخصة قيادة',
  other: 'أخرى',
};

export const DEPARTMENT_LABELS: Record<Department, string> = {
  spa: 'السبا',
  restaurant: 'المطعم',
};

export const ORDER_STATUS_LABELS: Record<Department, Record<OrderStatus, string>> = {
  spa: { open: 'موعد محجوز', completed: 'تمت الجلسة', cancelled: 'ملغي' },
  restaurant: { open: 'قيد التحضير', completed: 'تم التقديم', cancelled: 'ملغي' },
};

/** Suggested categories (the user can type any category). */
export const CATEGORY_SUGGESTIONS: Record<Department, string[]> = {
  spa: ['مساج', 'عناية بالبشرة', 'حمام مغربي', 'ساونا وبخار', 'عناية بالأظافر', 'باقات'],
  restaurant: ['إفطار', 'مقبلات', 'أطباق رئيسية', 'مشويات', 'حلويات', 'مشروبات ساخنة', 'مشروبات باردة'],
};
