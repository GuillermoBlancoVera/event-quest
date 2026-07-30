import type { Challenge, RankingEntry, RankingScope, Stats, User } from './models.js';
export interface RegisterUserRequest { name: string; password: string; team?: string; group?: string; }
export interface LoginRequest { name: string; password: string; }
export interface PlayerProfile extends User { history: Array<{ challengeId: number; title: string; points: number }>; }
export interface SubmitAnswerRequest { userId: string; answer: string; challengeId?: number; }
export interface SubmitAnswerResponse { correct: boolean; awardedPoints: number; score: number; completedChallenges: number[]; }
export interface ApiError { code: string; message: string; }
export interface RankingResponse { scope: RankingScope; entries: RankingEntry[]; frozen: boolean; }
export type QuestionResponse = Omit<Challenge, 'correctAnswer'>;
export interface EventApi { registerUser(input: RegisterUserRequest): Promise<User>; login(input: LoginRequest): Promise<User>; getProfile(userId: string): Promise<PlayerProfile>; getQuestion(id: number): Promise<QuestionResponse>; submitAnswer(id: number, input: SubmitAnswerRequest): Promise<SubmitAnswerResponse>; getRanking(scope?: RankingScope, filter?: string): Promise<RankingResponse>; getStats(): Promise<Stats>; }
