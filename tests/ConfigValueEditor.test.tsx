import { describe, it, expect, vi, afterEach } from 'vitest';
import React, { useState } from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ConfigValueCell, ConfigValueEditor } from '../src/components/shared/ConfigValueEditor';
import type { ConfigValueType } from '../src/types/api';

const Harness: React.FC<{ type: ConfigValueType; initial: string; onValue: (v: string) => void }> = ({
  type,
  initial,
  onValue,
}) => {
  const [value, setValue] = useState(initial);
  return (
    <ConfigValueEditor
      type={type}
      value={value}
      onChange={(v) => {
        setValue(v);
        onValue(v);
      }}
    />
  );
};

describe('ConfigValueEditor', () => {
  afterEach(cleanup);

  it('edits, adds, reorders and removes array items', () => {
    const onValue = vi.fn();
    render(<Harness type="array" initial='["10.0.0.1","10.0.0.2"]' onValue={onValue} />);

    expect((screen.getByLabelText('Item 1') as HTMLInputElement).value).toBe('10.0.0.1');

    fireEvent.click(screen.getByRole('button', { name: 'Add item' }));
    expect(onValue).toHaveBeenLastCalledWith('["10.0.0.1","10.0.0.2",""]');

    fireEvent.change(screen.getByLabelText('Item 3'), { target: { value: '192.168.1.0/24' } });
    expect(onValue).toHaveBeenLastCalledWith('["10.0.0.1","10.0.0.2","192.168.1.0/24"]');

    fireEvent.click(screen.getByRole('button', { name: 'Move item 3 up' }));
    expect(onValue).toHaveBeenLastCalledWith('["10.0.0.1","192.168.1.0/24","10.0.0.2"]');

    fireEvent.click(screen.getByRole('button', { name: 'Remove item 1' }));
    expect(onValue).toHaveBeenLastCalledWith('["192.168.1.0/24","10.0.0.2"]');
  });

  it('replaces the list from pasted lines', () => {
    const onValue = vi.fn();
    render(<Harness type="array" initial='["old"]' onValue={onValue} />);

    fireEvent.click(screen.getByRole('button', { name: /Paste lines/i }));
    fireEvent.change(screen.getByLabelText('Paste items, one per line'), {
      target: { value: 'a\n\n b \n' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Replace list' }));

    expect(onValue).toHaveBeenLastCalledWith('["a","b"]');
  });

  it('shows JSON errors and formats valid JSON', () => {
    const onValue = vi.fn();
    render(<Harness type="json" initial='{"a":' onValue={onValue} />);

    expect(screen.getByText(/Invalid JSON/)).toBeDefined();

    fireEvent.change(screen.getByLabelText('JSON value'), { target: { value: '{"a":1}' } });
    expect(screen.getByText('Valid JSON')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: /Format/i }));
    expect(onValue).toHaveBeenLastCalledWith('{\n  "a": 1\n}');
  });

  it('uses a textarea for multiline values', () => {
    render(<Harness type="multiline" initial={'a\nb'} onValue={() => {}} />);
    const el = screen.getByLabelText('Value');
    expect(el.tagName).toBe('TEXTAREA');
    expect((el as HTMLTextAreaElement).value).toBe('a\nb');
  });
});

describe('ConfigValueCell', () => {
  afterEach(cleanup);

  it('shows plain strings unchanged', () => {
    render(<ConfigValueCell type="string" value='["looks like json"]' />);
    expect(screen.getByText('["looks like json"]')).toBeDefined();
  });

  it('shows a type badge and preview, and expands to the full value', () => {
    render(<ConfigValueCell type="array" value='["10.0.0.1","10.0.0.2"]' />);
    expect(screen.getByText('array')).toBeDefined();
    expect(screen.getByText('10.0.0.1, 10.0.0.2')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Expand value' }));
    expect(screen.getByText((_, el) => el?.tagName === 'PRE' && el.textContent === '10.0.0.1\n10.0.0.2')).toBeDefined();
  });
});
