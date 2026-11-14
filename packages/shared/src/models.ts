export type RankingScope = 'global' | 'team' | 'group';
export type SessionRole = 'admin' | 'player' | 'guest';
export type UserRole = 'admin' | 'player';
export interface ChallengeAttempt { challengeId: number; answer?: string; correct: boolean; awardedPoints: number; answeredAt: string; }
export interface CommunityScan { communityId: string; scannedPlayerId: string; awardedPoints: number; scannedAt: string; }
export interface PorLaCaraAttempt { porLaCaraId: string; awardedPoints: number; claimedAt: string; }
export interface PorLaCaraChallenge { porLaCaraId: string; title: string; description: string; points: number; enabled: boolean; createdAt: string; updatedAt: string; }
export interface Affiliation { affiliationId: string; name: string; parentAffiliationId?: string; avatarKey?: string; story?: string; createdAt: string; updatedAt: string; }
export type Gender = 'male' | 'female';
export interface User { userId: string; name: string; role?: UserRole; gender?: Gender; team: string; group: string; affiliationId?: string; challengeAttempts: ChallengeAttempt[]; communityScans?: CommunityScan[]; porLaCaraAttempts?: PorLaCaraAttempt[]; avatarKey?: string; createdAt: string; updatedAt: string; }
/** `qrProtected` challenges can only be opened with the signed code that is embedded in their QR link. */
export interface Challenge { challengeId: number; title: string; question: string; answers: string[]; correctAnswer: string; points: number; enabled: boolean; affiliationId?: string; qrProtected?: boolean; }
export interface Settings { gameEnabled: boolean; rankingEnabled: boolean; maintenanceMode: boolean; rankingFrozenAt?: string; featureFlags: Record<string, boolean>; eventCode?: string; eventCodeVersion?: number; }
export interface AuditLog { timestamp: string; action: string; userId?: string; role?: SessionRole; sourceIp?: string; metadata?: Record<string, unknown>; }
export interface RankingEntry { rank: number; userId: string; name: string; gender?: Gender; team: string; group: string; score: number; completed: number; attempted: number; avatarKey?: string; affiliation?: Affiliation; parentAffiliation?: Affiliation; lastActivityAt?: string; }
export interface Stats { players: number; challenges: number; completionPercentage: number; mostActivePlayer?: RankingEntry; fastestPlayer?: RankingEntry; }
