import React, { useEffect, useRef, useState } from 'react';
import { Globe, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Turns free text into an environment slug: lower-case letters, digits, `-` and `_`. */
export const toEnvSlug = (value: string) =>
  value.trim().toLowerCase().replace(/[^a-z0-9-_]+/g, '-').replace(/(^-|-$)/g, '');

/**
 * Custom environment slugs typed on a global tab: the parent's (when it shares them across tabs)
 * or this tab's own. `addCustomSlug` returns the cleaned slug, or `null` when nothing is left.
 */
export function useCustomSlugs(external?: string[], onAdd?: (slug: string) => void) {
  const [local, setLocal] = useState<string[]>([]);
  const addCustomSlug = (value: string): string | null => {
    const slug = toEnvSlug(value);
    if (!slug) return null;
    if (onAdd) onAdd(slug);
    else setLocal((prev) => (prev.includes(slug) ? prev : [...prev, slug]));
    return slug;
  };
  return { customSlugs: external ?? local, addCustomSlug };
}

const chip = (selected: boolean) =>
  selected
    ? 'border-global bg-global/15 text-global'
    : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-200';

interface GlobalEnvFilterProps {
  envs: Array<{ slug: string; applicationCount?: number }>;
  selected: string | null;
  onSelect: (slug: string | null) => void;
  /** Adds a typed slug; returns the cleaned slug (then selected) or `null` to keep the input open. */
  onAddCustomSlug: (value: string) => string | null;
}

/** The environment chips above the global secrets and configuration lists. */
export const GlobalEnvFilter: React.FC<GlobalEnvFilterProps> = ({ envs, selected, onSelect, onAddCustomSlug }) => {
  const [adding, setAdding] = useState(false);
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (adding) inputRef.current?.focus();
  }, [adding]);

  const close = () => {
    setAdding(false);
    setInput('');
  };

  return (
    <div className="flex flex-wrap items-center gap-2 flex-1">
      <button
        type="button"
        onClick={() => onSelect(null)}
        className={cn(
          'h-[26px] px-2.5 border text-[10px] font-bold uppercase tracking-widest transition-colors',
          chip(selected === null)
        )}
      >
        All
      </button>

      {envs.map((env) => {
        const isWildcard = env.slug === '*';
        const isSelected = selected === env.slug;
        return (
          <button
            key={env.slug}
            type="button"
            onClick={() => onSelect(isSelected ? null : env.slug)}
            className={cn(
              'h-[26px] px-2.5 border text-[10px] font-bold tracking-tight transition-colors inline-flex items-center gap-1.5',
              chip(isSelected)
            )}
          >
            {isWildcard && <Globe className="w-3 h-3 text-global" />}
            <span>{isWildcard ? 'All environments' : env.slug}</span>
            {typeof env.applicationCount === 'number' && !isWildcard && (
              <span className="text-[9px] font-mono text-zinc-500">({env.applicationCount})</span>
            )}
          </button>
        );
      })}

      {adding ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const slug = onAddCustomSlug(input);
            if (!slug) return;
            close();
            onSelect(slug);
          }}
          className="inline-flex items-center gap-1"
        >
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="env-slug"
            aria-label="Custom environment slug"
            className="h-[26px] w-28 px-2 bg-zinc-900 border border-global/50 text-[11px] font-mono text-foreground"
          />
          <button type="submit" className="h-[26px] px-2 bg-global text-black text-[10px] font-bold uppercase">
            Add
          </button>
          <button
            type="button"
            onClick={close}
            aria-label="Cancel"
            className="h-[26px] px-1.5 border border-zinc-800 text-zinc-500 hover:text-zinc-300 text-[10px]"
          >
            <X className="w-3 h-3" />
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="h-[26px] px-2.5 border border-dashed border-zinc-700 text-zinc-500 hover:border-global hover:text-global text-[10px] font-bold uppercase tracking-widest inline-flex items-center gap-1 transition-colors"
        >
          <Plus className="w-3 h-3" /> custom slug
        </button>
      )}
    </div>
  );
};
