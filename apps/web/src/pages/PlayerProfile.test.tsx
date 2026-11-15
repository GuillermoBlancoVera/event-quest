import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { api } from '../lib/api';
import { clearSession, setSession } from '../lib/session';

const token = (role: string) => `x.${btoa(JSON.stringify({ role, exp: Math.floor(Date.now() / 1000) + 3600 }))}.x`;
const entry = { rank: 2, userId: 'u2', name: 'sara', gender: 'female' as const, team: 't', group: 'g', score: 150, completed: 2, attempted: 3 };
const open = (path: string) => render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);

beforeEach(() => {
  setSession(token('player'), 'u1');
  vi.spyOn(api, 'getRanking').mockResolvedValue({ scope: 'global', entries: [entry], affiliationScores: {}, frozen: false });
  vi.spyOn(api, 'getStats').mockResolvedValue({ players: 2, challenges: 10, completionPercentage: 0 });
});
afterEach(() => { clearSession(); vi.restoreAllMocks(); });

describe('profile of another player', () => {
  it('shows their description as plain text, with their ranking, and none of the owner-only controls', async () => {
    const getPlayerProfile = vi.spyOn(api, 'getPlayerProfile').mockResolvedValue({ userId: 'u2', name: 'sara', description: 'La que más baila. <img src=x onerror=alert(1)>' });
    const getProfile = vi.spyOn(api, 'getProfile');
    const { container } = open('/juego/perfil/u2');
    expect(await screen.findByRole('heading', { name: 'sara' })).toBeInTheDocument();
    expect(getPlayerProfile).toHaveBeenCalledWith('u2');
    expect(getProfile).not.toHaveBeenCalled();
    expect(screen.getByText('La que más baila. <img src=x onerror=alert(1)>')).toBeInTheDocument();
    expect(container.querySelector('.profile-description img')).toBeNull();
    expect(screen.getByText('2ª')).toBeInTheDocument();
    expect(screen.getByText('150')).toBeInTheDocument();
    expect(screen.getByText('3 / 10')).toBeInTheDocument();
    expect(screen.queryByText('Cerrar sesión')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('mostrar qr del perfil')).not.toBeInTheDocument();
  });

  it('opens the own profile when the id in the URL is the signed-in player', async () => {
    const getProfile = vi.spyOn(api, 'getProfile').mockResolvedValue({ userId: 'u1', name: 'guille', team: 't', group: 'g', challengeAttempts: [], createdAt: 'x', updatedAt: 'x', score: 0, history: [], scanCode: 'u1.sig', description: 'El novio.' });
    open('/juego/perfil/u1');
    expect(await screen.findByText('El novio.')).toBeInTheDocument();
    expect(getProfile).toHaveBeenCalled();
    expect(screen.getByText('Cerrar sesión')).toBeInTheDocument();
  });

  it('sends visitors without a session to the login', async () => {
    clearSession();
    const getPlayerProfile = vi.spyOn(api, 'getPlayerProfile');
    open('/juego/perfil/u2');
    expect(getPlayerProfile).not.toHaveBeenCalled();
    expect(screen.queryByRole('heading', { name: 'sara' })).not.toBeInTheDocument();
  });
});
