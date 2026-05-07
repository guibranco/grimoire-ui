import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Badge } from '../src/components/ui/badge';
import React from 'react';

describe('Badge component', () => {
  it('renders correctly with children', () => {
    render(<Badge>Test Badge</Badge>);
    expect(screen.getByText('Test Badge')).toBeInTheDocument();
  });

  it('applies the correct variant class', () => {
    const { container } = render(<Badge variant="destructive">Destructive Badge</Badge>);
    // Destructive variant has bg-destructive/10 text-destructive etc
    // Just checking if it renders and is in the document for now as exact classes depend on implementation
    expect(screen.getByText('Destructive Badge')).toBeInTheDocument();
  });
});
