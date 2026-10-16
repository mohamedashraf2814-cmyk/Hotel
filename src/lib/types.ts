// ===== Domain types =====
// All dates are stored as plain "YYYY-MM-DD" strings (no time zones involved).
// All timestamps (createdAt, ...) are ISO strings.

export type CurrencyCode = string;

export type ManualRoomStatus = 'available' | 'cleaning' | 'maintenance';
export type RoomStatus = ManualRoomStatus | 'occupied' | 'reserved';
export type RoomType = 'single' | 'double' | 'twin' | 'triple' | 'family' | 'deluxe' | 'suite';

export interface Room {
  id: string;
  number: string;
  type: RoomType;
  floor: number;
  capacity: number;
  pricePerNight: number;
  currency: CurrencyCode;
  /** Manual/physical status. "occupied" and "reserved" are derived from reservations. */
  status: ManualRoomStatus;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export type IdType = '' | 'national_id' | 'passport' | 'driving_license' | 'other';

export interface Guest {
  id: string;
  fullName: string;
  phone: string;
  email: string;
  nationality: string;
  idType: IdType;
  idNumber: string;
  address: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export type ReservationStatus = 'confirmed' | 'checked_in' | 'checked_out' | 'cancelled';

export interface Reservation {
  id: string;
  number: number;
  guestId: string;
  roomId: string;
  checkIn: string;
  checkOut: string;
  guestsCount: number;
  currency: CurrencyCode;
  pricePerNight: number;
  discount: number;
  status: ReservationStatus;
  notes: string;
  checkedInAt?: string;
  checkedOutAt?: string;
  cancelledAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type PaymentMethod = 'cash' | 'card' | 'bank_transfer';

export interface Payment {
  id: string;
  reservationId: string;
  date: string;
  /** Amount in the currency the guest actually paid with. */
  amount: number;
  currency: CurrencyCode;
  /** Snapshot: 1 unit of `currency` = rateToBase units of the base currency. */
  rateToBase: number;
  /** Amount converted into the reservation currency (snapshot at payment time). */
  appliedAmount: number;
  method: PaymentMethod;
  reference: string;
  notes: string;
  createdAt: string;
}

export type ExpenseCategory =
  | 'salaries'
  | 'utilities'
  | 'maintenance'
  | 'supplies'
  | 'cleaning'
  | 'marketing'
  | 'taxes'
  | 'other';

export interface Expense {
  id: string;
  category: ExpenseCategory;
  amount: number;
  currency: CurrencyCode;
  rateToBase: number;
  date: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface CurrencyConfig {
  code: CurrencyCode;
  /** 1 unit of this currency = rate units of the base currency. Base currency is always 1. */
  rate: number;
}

export type DigitsMode = 'latn' | 'arab';

export interface Settings {
  hotelName: string;
  phone: string;
  email: string;
  address: string;
  website: string;
  baseCurrency: CurrencyCode;
  currencies: CurrencyConfig[];
  defaultRoomPrice: number;
  defaultRoomCurrency: CurrencyCode;
  pageSize: number;
  digits: DigitsMode;
  invoiceNote: string;
}

export interface Counters {
  reservation: number;
}

export interface AppData {
  settings: Settings;
  rooms: Room[];
  guests: Guest[];
  reservations: Reservation[];
  payments: Payment[];
  expenses: Expense[];
  counters: Counters;
}

export type FieldErrors = Record<string, string>;

export type ActionResult =
  | { ok: true; data: AppData; id?: string }
  | { ok: false; error?: string; errors?: FieldErrors };
