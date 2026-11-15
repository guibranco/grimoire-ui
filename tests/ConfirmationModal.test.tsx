import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { ConfirmationModal } from '../src/components/shared/ConfirmationModal';

afterEach(() => {
  cleanup();
});

describe('ConfirmationModal', () => {
  it('requires typing uppercase DELETE for destructive modals', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const onOpenChange = vi.fn();

    render(
      <ConfirmationModal
        open={true}
        onOpenChange={onOpenChange}
        onConfirm={onConfirm}
        title="Delete Secret"
        description="Are you sure?"
        confirmText="Permanently Delete"
        variant="destructive"
      />
    );

    const input = screen.getByPlaceholderText('DELETE') as HTMLInputElement;
    const confirmButton = screen.getByRole('button', { name: 'Permanently Delete' }) as HTMLButtonElement;

    expect(confirmButton.disabled).toBe(true);

    // Lowercase should not enable deletion
    fireEvent.change(input, { target: { value: 'delete' } });
    expect(confirmButton.disabled).toBe(true);

    // Exact uppercase DELETE enables deletion
    fireEvent.change(input, { target: { value: 'DELETE' } });
    expect(confirmButton.disabled).toBe(false);

    fireEvent.click(confirmButton);
    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledTimes(1);
    });
  });

  it('does not require DELETE input for non-destructive confirmation modals', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const onOpenChange = vi.fn();

    render(
      <ConfirmationModal
        open={true}
        onOpenChange={onOpenChange}
        onConfirm={onConfirm}
        title="Rotate API Key"
        description="Rotate key?"
        confirmText="Rotate Key"
        variant="default"
      />
    );

    expect(screen.queryByPlaceholderText('DELETE')).toBeNull();
    const confirmButton = screen.getByRole('button', { name: 'Rotate Key' }) as HTMLButtonElement;
    expect(confirmButton.disabled).toBe(false);

    fireEvent.click(confirmButton);
    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledTimes(1);
    });
  });
});
