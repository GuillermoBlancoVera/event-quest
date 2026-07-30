import { render, screen } from '@testing-library/react';
import { HashRouter } from 'react-router-dom';
import { App } from './App';
import { describe, expect, it } from 'vitest';

describe('App', () => {
  it('renders the wedding home page', () => {
    render(<HashRouter><App /></HashRouter>);
    expect(screen.getByText(/nos casamos/i)).toBeInTheDocument();
  });
});
