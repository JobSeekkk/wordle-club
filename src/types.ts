export type SquareState = 'green' | 'yellow' | 'miss'

export interface ParsedAttemptRow {
  row: string
  states: SquareState[]
  greens: number
  yellows: number
  misses: number
  hintScore: number
}

export interface ParsedWordleShare {
  puzzleNumber: number
  attemptsUsed: number | null
  maxAttempts: number
  solved: boolean
  attempts: ParsedAttemptRow[]
  hintScoreBeforeSolve: number
  totalHintScore: number
  rawText: string
}

export interface Player {
  id: string
  leagueCode: string
  name: string
  color: string
  createdAt: string
}

export interface Submission {
  id: string
  leagueCode: string
  playerId: string
  puzzleNumber: number
  attemptsUsed: number | null
  maxAttempts: number
  solved: boolean
  hintScoreBeforeSolve: number
  totalHintScore: number
  rawShare: string
  attemptRows: string[]
  createdAt: string
  updatedAt: string
}

export interface RankedSubmission {
  rank: number
  points: number
  player: Player
  submission: Submission
}

export interface SeasonStanding {
  player: Player
  totalPoints: number
  daysPlayed: number
  wins: number
  averageAttempts: number | null
}
