import type { Affiliation, Challenge, ChallengeAttempt, CommunityScan, PorLaCaraAttempt, PorLaCaraChallenge, RankingEntry, RankingScope, Stats, User } from './models.js';
export interface RegisterUserRequest { name: string; password: string; team?: string; group?: string; affiliationId?: string; }
export interface LoginRequest { name: string; password: string; }
export interface PlayerProfile extends User { score: number; history: Array<ChallengeAttempt & { title: string }>; affiliation?: Affiliation; parentAffiliation?: Affiliation; }
export interface SubmitAnswerRequest { userId: string; answer: string; challengeId?: number; }
export interface SubmitAnswerResponse { correct: boolean; awardedPoints: number; score: number; attempt: ChallengeAttempt; }
export interface CommunityScanResponse { awardedPoints: number; progress: number; target: number; alreadyScanned?: boolean; scan: CommunityScan; player: Pick<User, 'userId' | 'name' | 'avatarKey'>; community: Affiliation; }
export interface ClaimPorLaCaraResponse { awardedPoints: number; score: number; attempt: PorLaCaraAttempt; }
export interface CreateMediaUploadRequest { batchId?: string; fileName: string; contentType: string; message?: string; thumbnailContentType?: string; displayContentType?: string; }
export interface CreateMediaUploadResponse { mediaId: string; cancellationToken: string; uploadUrl: string; thumbnailUploadUrl?: string; displayUploadUrl?: string; key: string; uploadedAt: string; }
export interface CancelMediaUploadsRequest { uploads: Array<{ mediaId: string; cancellationToken: string }>; }
export interface UpdateMediaRequest { message: string; }
export interface EventMedia { mediaId: string; batchId?: string; authorName: string; message?: string; contentType: string; createdAt: string; url: string; displayUrl?: string; thumbnailUrl?: string; canManage?: boolean; }
export interface MediaPage { items: EventMedia[]; nextCursor?: string; }
export interface ApiError { code: string; message: string; }
export interface RankingResponse { scope: RankingScope; entries: RankingEntry[]; affiliationScores: Record<string, number>; frozen: boolean; }
export type QuestionResponse = Omit<Challenge, 'correctAnswer'> & { correctAnswer?: string };
export type ChallengeListItem = Pick<Challenge, 'challengeId' | 'title'>;
export type PorLaCaraChallengeListItem = Pick<PorLaCaraChallenge, 'porLaCaraId' | 'title' | 'description' | 'points'>;
export interface SessionUser extends User { sessionToken: string; }
export interface EventApi { registerUser(input: RegisterUserRequest): Promise<SessionUser>; login(input: LoginRequest): Promise<SessionUser>; getProfile(userId: string): Promise<PlayerProfile>; getChallenges(): Promise<ChallengeListItem[]>; getPorLaCaraChallenges:()=>Promise<PorLaCaraChallengeListItem[]>; getQuestion(id: number, userId?: string): Promise<QuestionResponse>; getPorLaCaraChallenge(id: string): Promise<PorLaCaraChallenge>; submitAnswer(id: number, input: SubmitAnswerRequest): Promise<SubmitAnswerResponse>; claimPorLaCara(id: string, userId: string): Promise<ClaimPorLaCaraResponse>; scanCommunity(userId: string, playerId: string): Promise<CommunityScanResponse>; getRanking(scope?: RankingScope, filter?: string): Promise<RankingResponse>; getStats(): Promise<Stats>; createMediaUpload(input: CreateMediaUploadRequest): Promise<CreateMediaUploadResponse>; completeMediaUpload(mediaId: string): Promise<void>; cancelMediaUploads(input: CancelMediaUploadsRequest): Promise<void>; getMedia(cursor?: string): Promise<MediaPage>; updateMedia(mediaId: string, input: UpdateMediaRequest): Promise<void>; deleteMedia(mediaId: string): Promise<void>; }
