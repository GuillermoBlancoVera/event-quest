import type { Affiliation, Challenge, ChallengeAttempt, CommunityScan, PorLaCaraAttempt, PorLaCaraChallenge, RankingEntry, RankingScope, Stats, User } from './models.js';
export interface RegisterUserRequest { name: string; password: string; team?: string; group?: string; affiliationId?: string; }
export interface LoginRequest { name: string; password: string; }
export interface PlayerProfile extends User { score: number; history: Array<ChallengeAttempt & { title: string }>; affiliation?: Affiliation; parentAffiliation?: Affiliation; }
export interface SubmitAnswerRequest { userId: string; answer: string; challengeId?: number; }
export interface SubmitAnswerResponse { correct: boolean; awardedPoints: number; score: number; attempt: ChallengeAttempt; }
export interface CommunityScanResponse { awardedPoints: number; progress: number; target: number; alreadyScanned?: boolean; scan: CommunityScan; player: Pick<User, 'userId' | 'name' | 'avatarKey'>; community: Affiliation; }
export interface ClaimPorLaCaraResponse { awardedPoints: number; score: number; attempt: PorLaCaraAttempt; }
export interface CreateMediaUploadRequest { userId: string; fileName: string; contentType: string; message?: string; }
export interface CreateMediaUploadResponse { mediaId: string; uploadUrl: string; key: string; uploadedAt: string; }
export interface EventMedia { mediaId: string; authorName: string; message?: string; contentType: string; createdAt: string; url: string; }
export interface ApiError { code: string; message: string; }
export interface RankingResponse { scope: RankingScope; entries: RankingEntry[]; affiliationScores: Record<string, number>; frozen: boolean; }
export type QuestionResponse = Omit<Challenge, 'correctAnswer'> & { correctAnswer?: string };
export type ChallengeListItem = Pick<Challenge, 'challengeId' | 'title'>;
export type PorLaCaraChallengeListItem = Pick<PorLaCaraChallenge, 'porLaCaraId' | 'title' | 'description' | 'points'>;
export interface EventApi { registerUser(input: RegisterUserRequest): Promise<User>; login(input: LoginRequest): Promise<User>; getProfile(userId: string): Promise<PlayerProfile>; getChallenges(): Promise<ChallengeListItem[]>; getPorLaCaraChallenges(): Promise<PorLaCaraChallengeListItem[]>; getQuestion(id: number, userId?: string): Promise<QuestionResponse>; getPorLaCaraChallenge(id: string): Promise<PorLaCaraChallenge>; submitAnswer(id: number, input: SubmitAnswerRequest): Promise<SubmitAnswerResponse>; claimPorLaCara(id: string, userId: string): Promise<ClaimPorLaCaraResponse>; scanCommunity(userId: string, playerId: string): Promise<CommunityScanResponse>; getRanking(scope?: RankingScope, filter?: string): Promise<RankingResponse>; getStats(): Promise<Stats>; createMediaUpload(input: CreateMediaUploadRequest): Promise<CreateMediaUploadResponse>; completeMediaUpload(mediaId: string, userId: string): Promise<void>; getMedia(): Promise<EventMedia[]>; }
