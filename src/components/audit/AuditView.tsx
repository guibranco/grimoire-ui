import React from 'react';
import { ScrollText } from 'lucide-react';
import { AuditLogPanel } from './AuditLogPanel';

/** Route element for `/audit`: the estate-wide audit log. */
export const AuditView: React.FC = () => (
  <div className="flex-1 overflow-auto bg-[#0A0A0B]">
    <div className="mx-auto w-full max-w-[1400px] p-4 md:p-6 flex flex-col gap-4">
      <header>
        <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-foreground">
          <ScrollText className="w-5 h-5 text-zinc-400" aria-hidden="true" />
          Audit log
        </h2>
        <p className="text-[11px] text-zinc-500">
          Who read or changed what, where and how it ended. Names and keys only, never values.
        </p>
      </header>
      <AuditLogPanel />
    </div>
  </div>
);
