export type RankingScope = 'global' | 'team' | 'group';
export type AuditAction = 'REGISTER_USER' | 'SUBMIT_CHALLENGE' | 'DISABLE_CHALLENGE' | 'ENABLE_CHALLENGE' | 'FREEZE_RANKING' | 'UNFREEZE_RANKING' | 'SET_AFFILIATION_ICON';
export interface ChallengeAttempt { challengeId: number; answer?: string; correct: boolean; awardedPoints: number; answeredAt: string; }
export interface Affiliation { affiliationId: string; name: string; parentAffiliationId?: string; avatarKey?: string; story?: string; createdAt: string; updatedAt: string; }
export type Gender = 'male' | 'female';
export interface User { userId: string; name: string; gender?: Gender; team: string; group: string; affiliationId?: string; score: number; completedChallenges: number[]; attemptedChallengeIds?: number[]; challengeAttempts?: ChallengeAttempt[]; avatarKey?: string; createdAt: string; updatedAt: string; }
export interface Challenge { challengeId: number; title: string; question: string; answers: string[]; correctAnswer: string; points: number; enabled: boolean; affiliationId?: string; }
export interface Settings { gameEnabled: boolean; rankingEnabled: boolean; maintenanceMode: boolean; rankingFrozenAt?: string; featureFlags: Record<string, boolean>; }
export interface AuditLog { timestamp: string; action: AuditAction; userId?: string; metadata?: Record<string, unknown>; }
export interface RankingEntry { rank: number; userId: string; name: string; gender?: Gender; team: string; group: string; score: number; completed: number; attempted: number; avatarKey?: string; affiliation?: Affiliation; parentAffiliation?: Affiliation; lastActivityAt?: string; }
export interface Stats { players: number; challenges: number; completionPercentage: number; mostActivePlayer?: RankingEntry; fastestPlayer?: RankingEntry; }
