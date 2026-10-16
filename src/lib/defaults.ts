import type { AppData, Settings } from './types';

export const SCHEMA_VERSION = 1;

export function defaultSettings(): Settings {
  return {
    hotelName: 'Merak',
    phone: '',
    email: '',
    address: '',
    website: '',
    baseCurrency: 'EGP',
    currencies: [{ code: 'EGP', rate: 1 }],
    defaultRoomPrice: 0,
    defaultRoomCurrency: 'EGP',
    pageSize: 10,
    digits: 'latn',
    invoiceNote: 'نشكركم على اختياركم لنا ونتمنى لكم إقامة سعيدة.',
  };
}

/** A brand-new, empty system. No demo records. */
export function emptyData(): AppData {
  return {
    settings: defaultSettings(),
    rooms: [],
    guests: [],
    reservations: [],
    payments: [],
    expenses: [],
    serviceItems: [],
    orders: [],
    counters: { reservation: 0, order: 0 },
  };
}
