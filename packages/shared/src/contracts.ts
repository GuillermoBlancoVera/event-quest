import type { Affiliation, Challenge, ChallengeAttempt, RankingEntry, RankingScope, Stats, User } from './models.js';
export interface RegisterUserRequest { name: string; password: string; team?: string; group?: string; affiliationId?: string; }
export interface LoginRequest { name: string; password: string; }
export interface PlayerProfile extends User { score: number; history: Array<ChallengeAttempt & { title: string }>; affiliation?: Affiliation; parentAffiliation?: Affiliation; }
export interface SubmitAnswerRequest { userId: string; answer: string; challengeId?: number; }
export interface SubmitAnswerResponse { correct: boolean; awardedPoints: number; score: number; attempt: ChallengeAttempt; }
export interface ApiError { code: string; message: string; }
export interface RankingResponse { scope: RankingScope; entries: RankingEntry[]; affiliationScores: Record<string, number>; frozen: boolean; }
export type QuestionResponse = Omit<Challenge, 'correctAnswer'> & { correctAnswer?: string };
export type ChallengeListItem = Pick<Challenge, 'challengeId' | 'title'>;
export interface EventApi { registerUser(input: RegisterUserRequest): Promise<User>; login(input: LoginRequest): Promise<User>; getProfile(userId: string): Promise<PlayerProfile>; getChallenges(): Promise<ChallengeListItem[]>; getQuestion(id: number, userId?: string): Promise<QuestionResponse>; submitAnswer(id: number, input: SubmitAnswerRequest): Promise<SubmitAnswerResponse>; getRanking(scope?: RankingScope, filter?: string): Promise<RankingResponse>; getStats(): Promise<Stats>; }
