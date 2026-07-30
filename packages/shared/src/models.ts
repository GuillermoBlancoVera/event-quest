export type RankingScope = 'global' | 'team' | 'group';
export type AuditAction = 'REGISTER_USER' | 'SUBMIT_CHALLENGE' | 'DISABLE_CHALLENGE' | 'ENABLE_CHALLENGE' | 'FREEZE_RANKING' | 'UNFREEZE_RANKING';
export interface ChallengeAttempt { challengeId: number; correct: boolean; awardedPoints: number; answeredAt: string; }
export interface User { userId: string; name: string; team: string; group: string; score: number; completedChallenges: number[]; attemptedChallengeIds?: number[]; challengeAttempts?: ChallengeAttempt[]; createdAt: string; updatedAt: string; }
export interface Challenge { challengeId: number; title: string; question: string; answers: string[]; correctAnswer: string; points: number; enabled: boolean; }
export interface Settings { gameEnabled: boolean; rankingEnabled: boolean; maintenanceMode: boolean; rankingFrozenAt?: string; featureFlags: Record<string, boolean>; }
export interface AuditLog { timestamp: string; action: AuditAction; userId?: string; metadata?: Record<string, unknown>; }
export interface RankingEntry { rank: number; userId: string; name: string; team: string; group: string; score: number; completed: number; lastActivityAt?: string; }
export interface Stats { players: number; challenges: number; completionPercentage: number; mostActivePlayer?: RankingEntry; fastestPlayer?: RankingEntry; }
