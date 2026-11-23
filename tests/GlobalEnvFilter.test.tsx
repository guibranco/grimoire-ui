import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { GlobalEnvFilter, toEnvSlug, useCustomSlugs } from '../src/components/global/GlobalEnvFilter';

afterEach(() => cleanup());

describe('toEnvSlug', () => {
  it('lower-cases and collapses other characters to dashes', () => {
    expect(toEnvSlug('  QA Env 2! ')).toBe('qa-env-2');
    expect(toEnvSlug('!!!')).toBe('');
  });
});

describe('useCustomSlugs', () => {
  it('keeps its own slugs once each when the parent does not share them', () => {
    const { result } = renderHook(() => useCustomSlugs());
    act(() => {
      expect(result.current.addCustomSlug('QA')).toBe('qa');
    });
    act(() => {
      result.current.addCustomSlug('qa');
    });
    expect(result.current.customSlugs).toEqual(['qa']);
    expect(result.current.addCustomSlug('  ')).toBeNull();
  });

  it("hands slugs to the parent's list when it has one", () => {
    const onAdd = vi.fn();
    const { result } = renderHook(() => useCustomSlugs(['dr'], onAdd));
    act(() => {
      result.current.addCustomSlug('Perf Test');
    });
    expect(onAdd).toHaveBeenCalledWith('perf-test');
    expect(result.current.customSlugs).toEqual(['dr']);
  });
});

describe('GlobalEnvFilter', () => {
  const envs = [{ slug: '*' }, { slug: 'production', applicationCount: 2 }];

  it('selects and clears environments', () => {
    const onSelect = vi.fn();
    render(<GlobalEnvFilter envs={envs} selected="production" onSelect={onSelect} onAddCustomSlug={() => null} />);
    expect(screen.getByText('All environments')).toBeDefined();
    expect(screen.getByText('(2)')).toBeDefined();
    fireEvent.click(screen.getByText('production'));
    expect(onSelect).toHaveBeenLastCalledWith(null);
    fireEvent.click(screen.getByText('All environments'));
    expect(onSelect).toHaveBeenLastCalledWith('*');
  });

  it('adds a custom slug, selects it and closes the input; cancel discards it', () => {
    const onSelect = vi.fn();
    const onAdd = vi.fn((value: string) => toEnvSlug(value) || null);
    render(<GlobalEnvFilter envs={envs} selected={null} onSelect={onSelect} onAddCustomSlug={onAdd} />);

    fireEvent.click(screen.getByText('custom slug'));
    const input = screen.getByLabelText('Custom environment slug');
    expect(document.activeElement).toBe(input);
    fireEvent.change(input, { target: { value: '!!' } });
    fireEvent.click(screen.getByText('Add'));
    expect(screen.getByLabelText('Custom environment slug')).toBeDefined();

    fireEvent.change(input, { target: { value: 'QA' } });
    fireEvent.click(screen.getByText('Add'));
    expect(onSelect).toHaveBeenCalledWith('qa');
    expect(screen.queryByLabelText('Custom environment slug')).toBeNull();

    fireEvent.click(screen.getByText('custom slug'));
    fireEvent.click(screen.getByLabelText('Cancel'));
    expect(screen.queryByLabelText('Custom environment slug')).toBeNull();
  });
});
