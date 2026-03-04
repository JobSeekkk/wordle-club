import { MARIO_KART_12_POINTS } from './points'
import type {
  ParsedAttemptRow,
  ParsedWordleShare,
  Player,
  RankedSubmission,
  SeasonStanding,
  Submission,
  SquareState,
} from '../types'

const HEADER_PATTERN = /^Wordle\s+([\d,.]+)\s+([1-9Xx])\/(\d{1,2})$/i
const MISS_EMOJIS = new Set(['⬛', '⬜', '🟫'])

function toSquareState(square: string): SquareState {
  if (square === '🟩') {
    return 'green'
  }

  if (square === '🟨') {
    return 'yellow'
  }

  if (MISS_EMOJIS.has(square)) {
    return 'miss'
  }

  throw new Error(`Emoji inconnu dans la grille Wordle: "${square}"`)
}

function parseAttemptRow(row: string): ParsedAttemptRow {
  const squares = Array.from(row.trim())

  if (squares.length !== 5) {
    throw new Error('Chaque ligne Wordle doit contenir exactement 5 cases.')
  }

  const states = squares.map((square) => toSquareState(square))
  const greens = states.filter((state) => state === 'green').length
  const yellows = states.filter((state) => state === 'yellow').length
  const misses = states.filter((state) => state === 'miss').length
  const hintScore = greens + yellows * 0.5

  return {
    row,
    states,
    greens,
    yellows,
    misses,
    hintScore,
  }
}

export function parseWordleShare(rawText: string): ParsedWordleShare {
  const text = rawText.trim()

  if (!text) {
    throw new Error('Colle le texte partagé depuis Wordle pour analyser le score.')
  }

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  const headerLine = lines[0]
  const headerMatch = headerLine.match(HEADER_PATTERN)

  if (!headerMatch) {
    throw new Error('Format Wordle invalide. Exemple attendu: "Wordle 1,719 4/6".')
  }

  const puzzleNumber = Number(headerMatch[1].replace(/[^\d]/g, ''))
  const attemptsToken = headerMatch[2].toUpperCase()
  const maxAttempts = Number(headerMatch[3])

  if (!Number.isFinite(puzzleNumber) || puzzleNumber <= 0) {
    throw new Error('Numéro Wordle invalide dans la première ligne.')
  }

  const solved = attemptsToken !== 'X'
  const attemptsUsed = solved ? Number(attemptsToken) : null

  const rowLines = lines.slice(1)
  const attempts = rowLines.map((row) => parseAttemptRow(row))

  if (attempts.length === 0) {
    throw new Error('Le partage Wordle doit contenir les lignes de carrés colorés.')
  }

  if (solved && attemptsUsed !== attempts.length) {
    throw new Error(
      `Le score indique ${attemptsUsed} tentative(s), mais ${attempts.length} ligne(s) ont été trouvées.`,
    )
  }

  if (!solved && attempts.length !== maxAttempts) {
    throw new Error(
      `Le score indique un échec sur ${maxAttempts} essais, mais ${attempts.length} ligne(s) ont été trouvées.`,
    )
  }

  const totalHintScore = attempts.reduce((sum, attempt) => sum + attempt.hintScore, 0)
  const hintScoreBeforeSolve = solved
    ? attempts.slice(0, Math.max(0, attempts.length - 1)).reduce((sum, attempt) => sum + attempt.hintScore, 0)
    : totalHintScore

  return {
    puzzleNumber,
    attemptsUsed,
    maxAttempts,
    solved,
    attempts,
    hintScoreBeforeSolve,
    totalHintScore,
    rawText: text,
  }
}

export function compareSubmissionsForDay(a: Submission, b: Submission): number {
  if (a.solved !== b.solved) {
    return a.solved ? -1 : 1
  }

  if (a.solved && b.solved) {
    const aAttempts = a.attemptsUsed ?? Number.POSITIVE_INFINITY
    const bAttempts = b.attemptsUsed ?? Number.POSITIVE_INFINITY

    if (aAttempts !== bAttempts) {
      return aAttempts - bAttempts
    }

    if (a.hintScoreBeforeSolve !== b.hintScoreBeforeSolve) {
      return a.hintScoreBeforeSolve - b.hintScoreBeforeSolve
    }

    if (a.totalHintScore !== b.totalHintScore) {
      return a.totalHintScore - b.totalHintScore
    }
  }

  if (!a.solved && !b.solved && a.totalHintScore !== b.totalHintScore) {
    return b.totalHintScore - a.totalHintScore
  }

  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
}

function rankingKey(submission: Submission): string {
  return [
    submission.solved,
    submission.attemptsUsed ?? 'X',
    submission.hintScoreBeforeSolve,
    submission.totalHintScore,
  ].join('|')
}

export function buildDailyRanking(
  players: Player[],
  submissions: Submission[],
  puzzleNumber: number,
  pointsTable: number[] = MARIO_KART_12_POINTS,
): RankedSubmission[] {
  const playersById = new Map(players.map((player) => [player.id, player]))

  const rows = submissions
    .filter((submission) => submission.puzzleNumber === puzzleNumber)
    .sort(compareSubmissionsForDay)
    .map((submission) => {
      const player = playersById.get(submission.playerId)
      return player ? { submission, player } : null
    })
    .filter((row): row is { submission: Submission; player: Player } => row !== null)

  let currentRank = 1
  let previousKey = ''

  return rows.map((row, index) => {
    const rowKey = rankingKey(row.submission)

    if (index === 0) {
      currentRank = 1
    } else if (rowKey !== previousKey) {
      currentRank = index + 1
    }

    previousKey = rowKey

    return {
      rank: currentRank,
      points: pointsTable[currentRank - 1] ?? 0,
      player: row.player,
      submission: row.submission,
    }
  })
}

export function buildSeasonStandings(
  players: Player[],
  submissions: Submission[],
  pointsTable: number[] = MARIO_KART_12_POINTS,
): SeasonStanding[] {
  const byPuzzle = new Map<number, Submission[]>()

  for (const submission of submissions) {
    const current = byPuzzle.get(submission.puzzleNumber)

    if (current) {
      current.push(submission)
    } else {
      byPuzzle.set(submission.puzzleNumber, [submission])
    }
  }

  const pointsByPlayer = new Map<string, number>()
  const winsByPlayer = new Map<string, number>()

  for (const [puzzleNumber, puzzleSubmissions] of byPuzzle.entries()) {
    const ranking = buildDailyRanking(players, puzzleSubmissions, puzzleNumber, pointsTable)

    for (const row of ranking) {
      pointsByPlayer.set(row.player.id, (pointsByPlayer.get(row.player.id) ?? 0) + row.points)

      if (row.rank === 1) {
        winsByPlayer.set(row.player.id, (winsByPlayer.get(row.player.id) ?? 0) + 1)
      }
    }
  }

  const submissionsByPlayer = new Map<string, Submission[]>()

  for (const submission of submissions) {
    const current = submissionsByPlayer.get(submission.playerId)

    if (current) {
      current.push(submission)
    } else {
      submissionsByPlayer.set(submission.playerId, [submission])
    }
  }

  const standings = players.map((player) => {
    const playerSubmissions = submissionsByPlayer.get(player.id) ?? []
    const solved = playerSubmissions.filter((submission) => submission.solved && submission.attemptsUsed !== null)
    const averageAttempts =
      solved.length > 0
        ? solved.reduce((sum, submission) => sum + (submission.attemptsUsed ?? 0), 0) / solved.length
        : null

    return {
      player,
      totalPoints: pointsByPlayer.get(player.id) ?? 0,
      daysPlayed: playerSubmissions.length,
      wins: winsByPlayer.get(player.id) ?? 0,
      averageAttempts,
    }
  })

  standings.sort((a, b) => {
    if (a.totalPoints !== b.totalPoints) {
      return b.totalPoints - a.totalPoints
    }

    if (a.wins !== b.wins) {
      return b.wins - a.wins
    }

    if (a.averageAttempts === null && b.averageAttempts !== null) {
      return 1
    }

    if (a.averageAttempts !== null && b.averageAttempts === null) {
      return -1
    }

    if (a.averageAttempts !== null && b.averageAttempts !== null && a.averageAttempts !== b.averageAttempts) {
      return a.averageAttempts - b.averageAttempts
    }

    return a.player.name.localeCompare(b.player.name)
  })

  return standings
}
