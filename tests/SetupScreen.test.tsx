import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SetupScreen } from '../src/components/auth/SetupScreen';
import { useStore } from '../src/store/useStore';

describe('SetupScreen', () => {
  beforeEach(() => {
    localStorage.clear();
    useStore.setState({ isAdminAuthenticated: false });
  });
  afterEach(() => cleanup());

  const fill = (url: string, key: string) => {
    fireEvent.change(screen.getByLabelText('Instance URL'), { target: { value: url } });
    fireEvent.change(screen.getByLabelText('Admin API Key'), { target: { value: key } });
    fireEvent.click(screen.getByRole('button', { name: /connect/i }));
  };

  it('starts on the URL field and requires both values', () => {
    render(<SetupScreen />);
    expect(document.activeElement).toBe(screen.getByLabelText('Instance URL'));
    fill('', '');
    expect(screen.getByText('Instance URL is required')).toBeDefined();
    expect(screen.getByText('Admin API Key is required')).toBeDefined();
    expect(localStorage.getItem('grimoire_api_url')).toBeNull();
  });

  it('rejects URLs that are not http(s)', () => {
    render(<SetupScreen />);
    fill('ftp://vault.example.com', 'secret');
    expect(screen.getByText('Enter an http:// or https:// URL')).toBeDefined();
    expect(useStore.getState().isAdminAuthenticated).toBe(false);
  });

  it('stores the normalised URL and the key, then signs in', () => {
    render(<SetupScreen />);
    fill(' vault.example.com/ ', ' secret ');
    expect(localStorage.getItem('grimoire_api_url')).toBe('https://vault.example.com');
    expect(localStorage.getItem('grimoire_api_key')).toBe('secret');
    expect(useStore.getState().isAdminAuthenticated).toBe(true);
  });
});
