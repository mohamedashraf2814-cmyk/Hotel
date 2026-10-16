import { Suspense, lazy } from 'react';
import { Route, Routes } from 'react-router-dom';
import AppLayout from './layout/AppLayout';
import { Spinner } from './components/ui';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Rooms = lazy(() => import('./pages/Rooms'));
const Guests = lazy(() => import('./pages/Guests'));
const Reservations = lazy(() => import('./pages/Reservations'));
const Reception = lazy(() => import('./pages/Reception'));
const Payments = lazy(() => import('./pages/Payments'));
const Invoice = lazy(() => import('./pages/Invoice'));
const Expenses = lazy(() => import('./pages/Expenses'));
const Reports = lazy(() => import('./pages/Reports'));
const SettingsPage = lazy(() => import('./pages/Settings'));
const NotFound = lazy(() => import('./pages/NotFound'));

export default function App() {
  return (
    <Suspense fallback={<Spinner />}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="rooms" element={<Rooms />} />
          <Route path="guests" element={<Guests />} />
          <Route path="reservations" element={<Reservations />} />
          <Route path="reception" element={<Reception />} />
          <Route path="payments" element={<Payments />} />
          <Route path="invoices/:reservationId" element={<Invoice />} />
          <Route path="expenses" element={<Expenses />} />
          <Route path="reports" element={<Reports />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
