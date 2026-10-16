import {
  BarChart3,
  BedDouble,
  CalendarCheck,
  ConciergeBell,
  CreditCard,
  Flower2,
  LayoutDashboard,
  Receipt,
  Settings as SettingsIcon,
  Users,
  UtensilsCrossed,
} from 'lucide-react';

export const NAV = [
  {
    group: 'الفندق',
    items: [
      { to: '/', label: 'لوحة التحكم', icon: LayoutDashboard, end: true },
      { to: '/reception', label: 'الاستقبال', icon: ConciergeBell },
      { to: '/reservations', label: 'الحجوزات', icon: CalendarCheck },
      { to: '/rooms', label: 'الغرف', icon: BedDouble },
      { to: '/guests', label: 'النزلاء', icon: Users },
    ],
  },
  {
    group: 'الخدمات',
    items: [
      { to: '/spa', label: 'السبا', icon: Flower2 },
      { to: '/restaurant', label: 'المطعم', icon: UtensilsCrossed },
    ],
  },
  {
    group: 'الحسابات',
    items: [
      { to: '/payments', label: 'المدفوعات والفواتير', icon: CreditCard },
      { to: '/expenses', label: 'المصروفات', icon: Receipt },
      { to: '/reports', label: 'التقارير', icon: BarChart3 },
      { to: '/settings', label: 'الإعدادات', icon: SettingsIcon },
    ],
  },
] as const;

export const QUICK_ACTIONS = [
  { to: '/reservations?new=1', label: 'حجز جديد', icon: CalendarCheck },
  { to: '/guests?new=1', label: 'إضافة نزيل', icon: Users },
  { to: '/rooms?new=1', label: 'إضافة غرفة', icon: BedDouble },
  { to: '/spa?new=1', label: 'موعد سبا جديد', icon: Flower2 },
  { to: '/restaurant?new=1', label: 'طلب مطعم جديد', icon: UtensilsCrossed },
  { to: '/expenses?new=1', label: 'تسجيل مصروف', icon: Receipt },
] as const;
