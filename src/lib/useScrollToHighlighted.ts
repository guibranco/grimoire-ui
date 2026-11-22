import { RefObject, useEffect } from 'react';

/**
 * Scrolls the row marked `data-highlighted` into view once it renders, e.g. after opening a
 * `?key=` deep link from the command palette or the dashboard. Runs again when `key` or
 * `ready` changes; does nothing without a key.
 */
export function useScrollToHighlighted(
  key: string | null | undefined,
  ready: boolean,
  container?: RefObject<HTMLElement | null>
) {
  useEffect(() => {
    if (!key || !ready) return;
    const id = requestAnimationFrame(() => {
      const root: ParentNode = container?.current ?? document;
      const row = root.querySelector<HTMLElement>('[data-highlighted="true"]');
      row?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    });
    return () => cancelAnimationFrame(id);
  }, [key, ready, container]);
}
