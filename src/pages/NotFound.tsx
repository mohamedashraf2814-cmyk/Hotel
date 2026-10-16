import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { EmptyState } from '../components/ui';

export default function NotFound() {
  return (
    <div className="card">
      <EmptyState
        icon={<Compass size={26} />}
        title="الصفحة غير موجودة"
        text="الرابط الذي تحاول فتحه غير صحيح."
        action={
          <Link to="/" className="btn btn-primary">
            العودة للوحة التحكم
          </Link>
        }
      />
    </div>
  );
}
