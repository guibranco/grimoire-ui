import React from 'react';
import { Link } from 'react-router-dom';
import { dashboardPath } from '@/lib/routes';

interface NotFoundViewProps {
  title?: string;
  description?: React.ReactNode;
}

/** In-app "not found" state with a way back to the dashboard. */
export const NotFoundView: React.FC<NotFoundViewProps> = ({
  title = 'Page not found',
  description = 'The page you were looking for does not exist.',
}) => (
  <div role="alert" className="flex-1 flex flex-col items-center justify-center p-6 text-center">
    <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-zinc-600 mb-2">404</p>
    <h3 className="text-lg font-bold text-zinc-100">{title}</h3>
    <p className="text-muted-foreground text-sm mt-1 max-w-sm">{description}</p>
    <Link
      to={dashboardPath()}
      className="mt-4 px-4 py-2 border border-border text-xs uppercase font-bold tracking-widest hover:bg-muted"
    >
      Back to Dashboard
    </Link>
  </div>
);
