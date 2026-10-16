import { PAYMENT_METHOD_LABELS, RESERVATION_STATUS_LABELS, ROOM_STATUS_LABELS } from '../lib/labels';
import type { PaymentMethod, ReservationStatus, RoomStatus } from '../lib/types';
import { Badge } from './ui';

const ROOM_TONE = { available: 'success', occupied: 'danger', reserved: 'info', cleaning: 'warning', maintenance: 'neutral' } as const;
const RES_TONE = { confirmed: 'info', checked_in: 'success', checked_out: 'neutral', cancelled: 'danger' } as const;

export function RoomStatusBadge({ status }: { status: RoomStatus }) {
  return <Badge tone={ROOM_TONE[status]}>{ROOM_STATUS_LABELS[status]}</Badge>;
}

export function ReservationStatusBadge({ status }: { status: ReservationStatus }) {
  return <Badge tone={RES_TONE[status]}>{RESERVATION_STATUS_LABELS[status]}</Badge>;
}

export function MethodLabel({ method }: { method: PaymentMethod }) {
  return <>{PAYMENT_METHOD_LABELS[method]}</>;
}
