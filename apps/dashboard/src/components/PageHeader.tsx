import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

// One consistent page header for every dashboard screen: title, short
// subtitle, a way back, and an optional primary action on the right.
export default function PageHeader({
  title,
  subtitle,
  backTo,
  backLabel = 'Back',
  right,
}: {
  title: string;
  subtitle?: string;
  backTo?: string;
  backLabel?: string;
  right?: ReactNode;
}) {
  const { profile } = useAuth();
  const home = profile?.role === 'owner' ? '/owner' : '/manager';

  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {(backTo ?? true) && (
          <Link
            to={backTo ?? home}
            className="mb-1.5 inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-900"
          >
            <span aria-hidden>←</span> {backLabel}
          </Link>
        )}
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-sub">{subtitle}</p>}
      </div>
      {right && <div className="flex shrink-0 gap-2">{right}</div>}
    </div>
  );
}
