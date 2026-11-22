import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import toast from 'react-hot-toast';
import { APIKeyRevealModal } from '../src/components/modals/APIKeyRevealModal';

const setClipboard = (writeText: (text: string) => Promise<void>) =>
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

describe('APIKeyRevealModal copy', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  const copyButton = () => screen.getByRole('button', { name: 'Copy API key' });

  it('reports success only after the clipboard write resolves', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard(writeText);
    const success = vi.spyOn(toast, 'success');
    render(<APIKeyRevealModal apiKey="grm_test" onClose={() => {}} title="Key" />);

    fireEvent.click(copyButton());

    await waitFor(() => expect(success).toHaveBeenCalled());
    expect(writeText).toHaveBeenCalledWith('grm_test');
  });

  it('shows an error instead of success when the clipboard is unavailable', async () => {
    setClipboard(vi.fn().mockRejectedValue(new Error('denied')));
    const success = vi.spyOn(toast, 'success');
    const error = vi.spyOn(toast, 'error');
    render(<APIKeyRevealModal apiKey="grm_test" onClose={() => {}} title="Key" />);

    fireEvent.click(copyButton());

    await waitFor(() => expect(error).toHaveBeenCalled());
    expect(success).not.toHaveBeenCalled();
  });
});
