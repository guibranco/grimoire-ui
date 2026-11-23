import React from 'react';
import { NavLink, useParams, useSearchParams } from 'react-router-dom';
import { BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DEFAULT_REPORT_TAB, isReportTab, reportsPath, type ReportTab } from '@/lib/routes';
import { DEFAULT_UNUSED_WINDOW, UNUSED_WINDOWS, isUnusedWindow } from '@/lib/reports';
import { UnusedSecretsPanel } from './UnusedSecretsPanel';
import { DependencyGraphPanel } from './DependencyGraphPanel';

const TAB_LABELS: Record<ReportTab, string> = { unused: 'Unused secrets', dependencies: 'Dependencies' };

const chip = 'h-[26px] px-2.5 border text-[10px] font-bold uppercase tracking-widest transition-colors';

/** Route element for `/reports/:tab?` (guibranco/grimoire-ui#451). */
export const ReportsView: React.FC = () => {
  const { tab: tabParam } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: ReportTab = isReportTab(tabParam) ? tabParam : DEFAULT_REPORT_TAB;
  const days = isUnusedWindow(searchParams.get('days')) ? Number(searchParams.get('days')) : DEFAULT_UNUSED_WINDOW;
  const focus = searchParams.get('focus');

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (value === null) next.delete(key);
    else next.set(key, value);
    setSearchParams(next, { replace: key === 'days' });
  };

  const windows = (
    <fieldset className="flex items-center gap-1 border-0 p-0 m-0">
      <legend className="sr-only">Not read in</legend>
      {UNUSED_WINDOWS.map((d) => (
        <button
          key={d}
          type="button"
          aria-pressed={days === d}
          onClick={() => setParam('days', d === DEFAULT_UNUSED_WINDOW ? null : String(d))}
          className={cn(
            chip,
            days === d ? 'border-grimoire bg-grimoire/15 text-grimoire' : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-200'
          )}
        >
          {d} days
        </button>
      ))}
    </fieldset>
  );

  return (
    <div className="flex-1 overflow-auto bg-[#0A0A0B]">
      <div className="mx-auto w-full max-w-[1400px] p-4 md:p-6 flex flex-col gap-4">
        <header className="flex flex-col gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-foreground">
              <BarChart3 className="w-5 h-5 text-zinc-400" aria-hidden="true" />
              Reports
            </h2>
            <p className="text-[11px] text-zinc-500">
              How secrets and configuration are used, from Consumer API reads. Names and dates only, never values.
            </p>
          </div>
          <nav aria-label="Reports" className="flex items-center gap-0 border-b border-border">
            {(Object.keys(TAB_LABELS) as ReportTab[]).map((t) => (
              <NavLink
                key={t}
                to={reportsPath(t, t === 'unused' ? { days } : undefined)}
                aria-current={tab === t ? 'page' : undefined}
                className={cn(
                  'px-4 h-9 inline-flex items-center text-xs font-semibold border-b-2 -mb-px transition-colors',
                  tab === t ? 'border-grimoire text-zinc-100' : 'border-transparent text-zinc-500 hover:text-zinc-200'
                )}
              >
                {TAB_LABELS[t]}
              </NavLink>
            ))}
          </nav>
        </header>

        {tab === 'unused' ? (
          <UnusedSecretsPanel days={days} windows={windows} />
        ) : (
          <DependencyGraphPanel focus={focus} onFocus={(id) => setParam('focus', id)} />
        )}
      </div>
    </div>
  );
};
