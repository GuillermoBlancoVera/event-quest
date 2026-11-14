import type { AdminApi, EventApi, MediaPage, RankingScope } from '@event-quest/shared';
import { clearSession, getSession } from './session';

const base = import.meta.env.VITE_API_URL?.replace(/\/$/, '') ?? '/api';

export class ApiRequestError extends Error {
  constructor(message: string, public readonly status: number, public readonly code?: string) {
    super(message);
  }
}

async function request<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const session = getSession();
  const response = await fetch(`${base}${path}`, {
    method: options.method ?? 'GET',
    headers: { 'content-type': 'application/json', ...(session ? { authorization: `Bearer ${session.token}` } : {}) },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({})) as { message?: string; code?: string };
    // The API no longer accepts this session (expired, revoked, or the wedding code changed): sign out so the right screen shows.
    if (response.status === 401 && session && error.code === 'UNAUTHORIZED') clearSession();
    throw new ApiRequestError(error.message ?? 'La solicitud no se ha podido completar.', response.status, error.code);
  }
  return response.json() as Promise<T>;
}

const id = encodeURIComponent;
const query = (params: Record<string, string | undefined>) => {
  const entries = Object.entries(params).filter((entry): entry is [string, string] => Boolean(entry[1]));
  return entries.length ? `?${new URLSearchParams(entries)}` : '';
};

export const api: EventApi = {
  login: input => request('/login', { method: 'POST', body: input }),
  createEventSession: input => request('/event-session', { method: 'POST', body: input }),
  getProfile: () => request('/profile/me'),
  getChallenges: () => request('/challenges'),
  getPorLaCaraChallenges: () => request('/por-la-cara'),
  getQuestion: (challengeId, code) => request(`/question/${challengeId}${query({ code })}`),
  getPorLaCaraChallenge: porLaCaraId => request(`/por-la-cara/${id(porLaCaraId)}`),
  submitAnswer: (challengeId, input) => request(`/submit-answer/${challengeId}`, { method: 'POST', body: input }),
  claimPorLaCara: porLaCaraId => request(`/por-la-cara/${id(porLaCaraId)}`, { method: 'POST', body: {} }),
  scanCommunity: scanCode => request(`/community-scan/${id(scanCode)}`, { method: 'POST', body: {} }),
  getRanking: (scope: RankingScope = 'global', filter) => request(`/ranking${query({ scope, filter })}`),
  getStats: () => request('/stats'),
  createMediaUpload: input => request('/media/uploads', { method: 'POST', body: input }),
  completeMediaUpload: mediaId => request(`/media/${id(mediaId)}/complete`, { method: 'POST', body: {} }),
  cancelMediaUploads: input => request('/media/cancel', { method: 'POST', body: input }),
  getMedia: cursor => request<MediaPage>(`/media${query({ cursor })}`),
  updateMedia: (mediaId, input) => request(`/media/${id(mediaId)}`, { method: 'PATCH', body: input }),
  deleteMedia: mediaId => request(`/media/${id(mediaId)}`, { method: 'DELETE' }),
};

export const adminApi: AdminApi = {
  listPlayers: () => request('/admin/players'),
  createPlayer: input => request('/admin/players', { method: 'POST', body: input }),
  updatePlayer: (userId, input) => request(`/admin/players/${id(userId)}`, { method: 'PUT', body: input }),
  deletePlayer: userId => request(`/admin/players/${id(userId)}`, { method: 'DELETE' }),
  listChallenges: () => request('/admin/challenges'),
  createChallenge: input => request('/admin/challenges', { method: 'POST', body: input }),
  updateChallenge: (challengeId, input) => request(`/admin/challenges/${challengeId}`, { method: 'PUT', body: input }),
  deleteChallenge: challengeId => request(`/admin/challenges/${challengeId}`, { method: 'DELETE' }),
  listPorLaCara: () => request('/admin/por-la-cara'),
  createPorLaCara: input => request('/admin/por-la-cara', { method: 'POST', body: input }),
  updatePorLaCara: (porLaCaraId, input) => request(`/admin/por-la-cara/${id(porLaCaraId)}`, { method: 'PUT', body: input }),
  deletePorLaCara: porLaCaraId => request(`/admin/por-la-cara/${id(porLaCaraId)}`, { method: 'DELETE' }),
  listAffiliations: () => request('/admin/affiliations'),
  createAffiliation: input => request('/admin/affiliations', { method: 'POST', body: input }),
  updateAffiliation: (affiliationId, input) => request(`/admin/affiliations/${id(affiliationId)}`, { method: 'PUT', body: input }),
  deleteAffiliation: affiliationId => request(`/admin/affiliations/${id(affiliationId)}`, { method: 'DELETE' }),
  getSettings: () => request('/admin/settings'),
  updateSettings: input => request('/admin/settings', { method: 'PUT', body: input }),
  createAssetUpload: input => request('/admin/uploads', { method: 'POST', body: input }),
};
