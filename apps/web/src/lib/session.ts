import { useSyncExternalStore } from 'react';
import type { SessionRole } from '@event-quest/shared';

const tokenKey = 'event-quest-session-token';
const userKey = 'event-quest-user';
const changed = 'event-quest-session-changed';

export type ClientSession = { token: string; role: SessionRole; userId?: string };

const decodeRole = (token: string): SessionRole | undefined => {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const claims = JSON.parse(atob(payload)) as { role?: unknown; exp?: unknown };
    if (typeof claims.exp === 'number' && claims.exp <= Date.now() / 1000) return undefined;
    return claims.role === 'admin' || claims.role === 'player' || claims.role === 'guest' ? claims.role : undefined;
  } catch {
    return undefined;
  }
};

/**
 * The role is read from the token only to decide what to show; the API checks the signature on every request.
 * Tokens issued before roles existed have no role and are treated as signed out.
 */
export const getSession = (): ClientSession | undefined => {
  const token = localStorage.getItem(tokenKey);
  const role = token ? decodeRole(token) : undefined;
  if (!token || !role) return undefined;
  return { token, role, userId: role === 'guest' ? undefined : localStorage.getItem(userKey) ?? undefined };
};

export const setSession = (token: string, userId?: string) => {
  localStorage.setItem(tokenKey, token);
  if (userId) localStorage.setItem(userKey, userId); else localStorage.removeItem(userKey);
  window.dispatchEvent(new Event(changed));
};

export const clearSession = () => {
  localStorage.removeItem(tokenKey);
  localStorage.removeItem(userKey);
  window.dispatchEvent(new Event(changed));
};

const subscribe = (notify: () => void) => {
  window.addEventListener(changed, notify);
  window.addEventListener('storage', notify);
  return () => { window.removeEventListener(changed, notify); window.removeEventListener('storage', notify); };
};
const snapshot = () => localStorage.getItem(tokenKey) ?? '';

/** Re-renders when the session changes, including when the API rejects an expired token. */
export const useSession = () => {
  useSyncExternalStore(subscribe, snapshot);
  return getSession();
};
