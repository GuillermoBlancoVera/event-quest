import type { Affiliation, Challenge, ChallengeAttempt, CommunityScan, Gender, PorLaCaraAttempt, PorLaCaraChallenge, RankingEntry, RankingScope, SessionRole, Settings, Stats, User, UserRole } from './models.js';

export interface LoginRequest { name: string; password: string; }
export interface SessionUser extends User { sessionToken: string; }
export interface EventSessionRequest { code: string; }
export interface EventSessionResponse { sessionToken: string; role: SessionRole; }

/** `scanCode` is only present on the caller's own profile; it is what their QR encodes. */
export interface PlayerProfile extends User { score: number; history: Array<ChallengeAttempt & { title: string }>; scanCode?: string; }
export interface SubmitAnswerRequest { answer: string; code?: string; }
export interface SubmitAnswerResponse { correct: boolean; awardedPoints: number; score: number; attempt: ChallengeAttempt; }
export interface CommunityScanResponse { awardedPoints: number; progress: number; target: number; alreadyScanned?: boolean; scan: CommunityScan; player: Pick<User, 'userId' | 'name' | 'avatarKey'>; community: Affiliation; }
export interface ClaimPorLaCaraResponse { awardedPoints: number; score: number; attempt: PorLaCaraAttempt; }
export interface RankingResponse { scope: RankingScope; entries: RankingEntry[]; affiliationScores: Record<string, number>; frozen: boolean; }
export type QuestionResponse = Omit<Challenge, 'correctAnswer'> & { correctAnswer?: string };
export type ChallengeListItem = Pick<Challenge, 'challengeId' | 'title'>;
export type PorLaCaraChallengeListItem = Pick<PorLaCaraChallenge, 'porLaCaraId' | 'title' | 'description' | 'points'>;

/** A browser form upload straight to S3: POST `fields` followed by the file as the `file` field. */
export interface PresignedUpload { url: string; fields: Record<string, string>; }
export interface CreateMediaUploadRequest { batchId?: string; fileName: string; contentType: string; size: number; message?: string; thumbnailSize?: number; displaySize?: number; }
export interface CreateMediaUploadResponse { mediaId: string; cancellationToken: string; contentType: string; upload: PresignedUpload; thumbnailUpload?: PresignedUpload; displayUpload?: PresignedUpload; }
export interface CancelMediaUploadsRequest { uploads: Array<{ mediaId: string; cancellationToken: string }>; }
export interface UpdateMediaRequest { message: string; }
export interface EventMedia { mediaId: string; batchId?: string; authorName: string; message?: string; contentType: string; createdAt: string; url: string; displayUrl?: string; thumbnailUrl?: string; canManage?: boolean; }
export interface MediaPage { items: EventMedia[]; nextCursor?: string; }
export interface ApiError { code: string; message: string; }

export interface AdminPlayer extends User { score: number; }
export interface AdminPlayerInput { name: string; password?: string; role?: UserRole; gender?: Gender | null; team?: string; group?: string; affiliationId?: string | null; avatarKey?: string | null; resetProgress?: boolean; }
/** `qrPath` is the app path to print as a QR, including the signed code when the challenge is protected. */
export interface AdminChallenge extends Challenge { qrPath: string; }
export type AdminChallengeInput = Omit<Challenge, 'challengeId'> & { challengeId?: number };
export interface AdminPorLaCara extends PorLaCaraChallenge { qrPath: string; }
export type AdminPorLaCaraInput = Pick<PorLaCaraChallenge, 'title' | 'description' | 'points' | 'enabled'>;
export type AdminAffiliationInput = Pick<Affiliation, 'name'> & { affiliationId?: string; parentAffiliationId?: string | null; avatarKey?: string | null; story?: string | null };
export interface AdminSettings { gameEnabled: boolean; maintenanceMode: boolean; rankingFrozen: boolean; eventCode: string; }
export type AdminSettingsInput = Partial<AdminSettings>;
export interface AdminAssetUploadRequest { kind: 'avatar' | 'affiliation'; fileName: string; contentType: string; size: number; }
export interface AdminAssetUploadResponse { key: string; upload: PresignedUpload; }
export type { Settings };

export interface EventApi {
  login(input: LoginRequest): Promise<SessionUser>;
  createEventSession(input: EventSessionRequest): Promise<EventSessionResponse>;
  getProfile(): Promise<PlayerProfile>;
  getChallenges(): Promise<ChallengeListItem[]>;
  getPorLaCaraChallenges(): Promise<PorLaCaraChallengeListItem[]>;
  getQuestion(id: number, code?: string): Promise<QuestionResponse>;
  getPorLaCaraChallenge(id: string): Promise<PorLaCaraChallenge>;
  submitAnswer(id: number, input: SubmitAnswerRequest): Promise<SubmitAnswerResponse>;
  claimPorLaCara(id: string): Promise<ClaimPorLaCaraResponse>;
  scanCommunity(scanCode: string): Promise<CommunityScanResponse>;
  getRanking(scope?: RankingScope, filter?: string): Promise<RankingResponse>;
  getStats(): Promise<Stats>;
  createMediaUpload(input: CreateMediaUploadRequest): Promise<CreateMediaUploadResponse>;
  completeMediaUpload(mediaId: string): Promise<void>;
  cancelMediaUploads(input: CancelMediaUploadsRequest): Promise<void>;
  getMedia(cursor?: string): Promise<MediaPage>;
  updateMedia(mediaId: string, input: UpdateMediaRequest): Promise<void>;
  deleteMedia(mediaId: string): Promise<void>;
}

export interface AdminApi {
  listPlayers(): Promise<AdminPlayer[]>;
  createPlayer(input: AdminPlayerInput): Promise<AdminPlayer>;
  updatePlayer(userId: string, input: AdminPlayerInput): Promise<AdminPlayer>;
  deletePlayer(userId: string): Promise<void>;
  listChallenges(): Promise<AdminChallenge[]>;
  createChallenge(input: AdminChallengeInput): Promise<AdminChallenge>;
  updateChallenge(challengeId: number, input: AdminChallengeInput): Promise<AdminChallenge>;
  deleteChallenge(challengeId: number): Promise<void>;
  listPorLaCara(): Promise<AdminPorLaCara[]>;
  createPorLaCara(input: AdminPorLaCaraInput): Promise<AdminPorLaCara>;
  updatePorLaCara(porLaCaraId: string, input: AdminPorLaCaraInput): Promise<AdminPorLaCara>;
  deletePorLaCara(porLaCaraId: string): Promise<void>;
  listAffiliations(): Promise<Affiliation[]>;
  createAffiliation(input: AdminAffiliationInput): Promise<Affiliation>;
  updateAffiliation(affiliationId: string, input: AdminAffiliationInput): Promise<Affiliation>;
  deleteAffiliation(affiliationId: string): Promise<void>;
  getSettings(): Promise<AdminSettings>;
  updateSettings(input: AdminSettingsInput): Promise<AdminSettings>;
  createAssetUpload(input: AdminAssetUploadRequest): Promise<AdminAssetUploadResponse>;
}
