import { type RouteObject } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { DashboardHome } from './components/dashboard/DashboardHome';
import { AppDetailView } from './components/app/AppDetailView';
import { GlobalView } from './components/global/GlobalView';
import { AuditView } from './components/audit/AuditView';
import { RotationView } from './components/rotation/RotationView';
import { ReportsView } from './components/reports/ReportsView';
import { NotFoundView } from './components/shared/NotFoundView';

/**
 * Route table. `AppShell` is the layout route: it renders the setup screen
 * while disconnected (keeping the requested URL, so a deep link opens once
 * connected) and the sidebar + `<Outlet />` otherwise.
 */
export const routes: RouteObject[] = [
  {
    element: <AppShell />,
    children: [
      { index: true, element: <DashboardHome /> },
      { path: 'apps/:appSlug/:envSlug?/:tab?', element: <AppDetailView /> },
      { path: 'global/:tab?', element: <GlobalView /> },
      { path: 'audit', element: <AuditView /> },
      { path: 'rotation', element: <RotationView /> },
      { path: 'reports/:tab?', element: <ReportsView /> },
      { path: '*', element: <NotFoundView /> },
    ],
  },
];

