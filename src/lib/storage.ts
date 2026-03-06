import type { Player, Submission } from '../types'
import { hasSupabase, supabase } from './supabase'

const LAST_LEAGUE_KEY = 'wordle-club:last-league'

function playersKey(leagueCode: string): string {
  return `wordle-club:${leagueCode}:players`
}

function submissionsKey(leagueCode: string): string {
  return `wordle-club:${leagueCode}:submissions`
}

function playerSessionKey(leagueCode: string): string {
  return `wordle-club:${leagueCode}:current-player-id`
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function writeJson<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value))
}

function normalizeLeagueCode(rawLeagueCode: string): string {
  return rawLeagueCode.trim().toUpperCase()
}

function normalizePlayerName(rawName: string): string {
  return rawName.trim().replace(/\s+/g, ' ')
}

function playerNameKey(name: string): string {
  return normalizePlayerName(name).toLowerCase()
}

function mapPlayerRow(row: {
  id: string
  league_code: string
  name: string
  color: string
  created_at: string
}): Player {
  return {
    id: row.id,
    leagueCode: row.league_code,
    name: row.name,
    color: row.color,
    createdAt: row.created_at,
  }
}

function mapSubmissionRow(row: {
  id: string
  league_code: string
  player_id: string
  puzzle_number: number
  attempts_used: number | null
  max_attempts: number
  solved: boolean
  hint_score_before_solve: number
  total_hint_score: number
  raw_share: string
  attempt_rows: string[]
  created_at: string
  updated_at: string
}): Submission {
  return {
    id: row.id,
    leagueCode: row.league_code,
    playerId: row.player_id,
    puzzleNumber: row.puzzle_number,
    attemptsUsed: row.attempts_used,
    maxAttempts: row.max_attempts,
    solved: row.solved,
    hintScoreBeforeSolve: Number(row.hint_score_before_solve),
    totalHintScore: Number(row.total_hint_score),
    rawShare: row.raw_share,
    attemptRows: row.attempt_rows,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function getSavedLeagueCode(): string {
  return localStorage.getItem(LAST_LEAGUE_KEY) ?? ''
}

export function saveLeagueCode(leagueCode: string): void {
  localStorage.setItem(LAST_LEAGUE_KEY, normalizeLeagueCode(leagueCode))
}

export function getSavedPlayerId(leagueCode: string): string {
  return localStorage.getItem(playerSessionKey(normalizeLeagueCode(leagueCode))) ?? ''
}

export function savePlayerId(leagueCode: string, playerId: string): void {
  localStorage.setItem(playerSessionKey(normalizeLeagueCode(leagueCode)), playerId)
}

export async function listPlayers(leagueCode: string): Promise<Player[]> {
  const normalizedLeagueCode = normalizeLeagueCode(leagueCode)

  if (hasSupabase && supabase) {
    const { data, error } = await supabase
      .from('players')
      .select('id, league_code, name, color, created_at')
      .eq('league_code', normalizedLeagueCode)
      .order('created_at', { ascending: true })

    if (error) {
      throw new Error(error.message)
    }

    return (data ?? []).map(mapPlayerRow)
  }

  return readJson<Player[]>(playersKey(normalizedLeagueCode)) ?? []
}

export async function savePlayer(input: {
  leagueCode: string
  playerId?: string
  name: string
  color: string
}): Promise<Player> {
  const normalizedLeagueCode = normalizeLeagueCode(input.leagueCode)
  const normalizedName = normalizePlayerName(input.name)

  if (!normalizedName) {
    throw new Error('Le nom du joueur est obligatoire.')
  }

  if (hasSupabase && supabase) {
    if (input.playerId) {
      const { data, error } = await supabase
        .from('players')
        .update({
          name: normalizedName,
          color: input.color,
        })
        .eq('id', input.playerId)
        .eq('league_code', normalizedLeagueCode)
        .select('id, league_code, name, color, created_at')
        .single()

      if (error) {
        throw new Error(error.message)
      }

      return mapPlayerRow(data)
    }

    // If the same name already exists in this league, reuse that profile
    // instead of creating duplicates (helpful when local storage is reset on phone).
    const { data: existingPlayers, error: existingError } = await supabase
      .from('players')
      .select('id, league_code, name, color, created_at')
      .eq('league_code', normalizedLeagueCode)
      .ilike('name', normalizedName)
      .order('created_at', { ascending: true })
      .limit(1)

    if (existingError) {
      throw new Error(existingError.message)
    }

    if (existingPlayers && existingPlayers.length > 0) {
      const existingPlayer = existingPlayers[0]
      const { data, error } = await supabase
        .from('players')
        .update({
          name: normalizedName,
          color: input.color,
        })
        .eq('id', existingPlayer.id)
        .eq('league_code', normalizedLeagueCode)
        .select('id, league_code, name, color, created_at')
        .single()

      if (error) {
        throw new Error(error.message)
      }

      return mapPlayerRow(data)
    }

    const { data, error } = await supabase
      .from('players')
      .insert({
        league_code: normalizedLeagueCode,
        name: normalizedName,
        color: input.color,
      })
      .select('id, league_code, name, color, created_at')
      .single()

    if (error) {
      throw new Error(error.message)
    }

    return mapPlayerRow(data)
  }

  const localPlayers = readJson<Player[]>(playersKey(normalizedLeagueCode)) ?? []

  if (input.playerId) {
    const updatedPlayers = localPlayers.map((player) =>
      player.id === input.playerId ? { ...player, name: normalizedName, color: input.color } : player,
    )

    writeJson(playersKey(normalizedLeagueCode), updatedPlayers)

    const updated = updatedPlayers.find((player) => player.id === input.playerId)

    if (!updated) {
      throw new Error('Joueur introuvable.')
    }

    return updated
  }

  const existingLocalPlayer = localPlayers.find((player) => playerNameKey(player.name) === playerNameKey(normalizedName))

  if (existingLocalPlayer) {
    const updatedPlayers = localPlayers.map((player) =>
      player.id === existingLocalPlayer.id ? { ...player, name: normalizedName, color: input.color } : player,
    )
    writeJson(playersKey(normalizedLeagueCode), updatedPlayers)
    const updated = updatedPlayers.find((player) => player.id === existingLocalPlayer.id)

    if (!updated) {
      throw new Error('Joueur introuvable.')
    }

    return updated
  }

  const created: Player = {
    id: crypto.randomUUID(),
    leagueCode: normalizedLeagueCode,
    name: normalizedName,
    color: input.color,
    createdAt: new Date().toISOString(),
  }

  writeJson(playersKey(normalizedLeagueCode), [...localPlayers, created])
  return created
}

export async function listSubmissions(leagueCode: string): Promise<Submission[]> {
  const normalizedLeagueCode = normalizeLeagueCode(leagueCode)

  if (hasSupabase && supabase) {
    const { data, error } = await supabase
      .from('submissions')
      .select(
        'id, league_code, player_id, puzzle_number, attempts_used, max_attempts, solved, hint_score_before_solve, total_hint_score, raw_share, attempt_rows, created_at, updated_at',
      )
      .eq('league_code', normalizedLeagueCode)
      .order('puzzle_number', { ascending: false })
      .order('created_at', { ascending: true })

    if (error) {
      throw new Error(error.message)
    }

    return (data ?? []).map(mapSubmissionRow)
  }

  return readJson<Submission[]>(submissionsKey(normalizedLeagueCode)) ?? []
}

export async function upsertSubmission(input: {
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
}): Promise<Submission> {
  const normalizedLeagueCode = normalizeLeagueCode(input.leagueCode)

  if (hasSupabase && supabase) {
    const { data, error } = await supabase
      .from('submissions')
      .upsert(
        {
          league_code: normalizedLeagueCode,
          player_id: input.playerId,
          puzzle_number: input.puzzleNumber,
          attempts_used: input.attemptsUsed,
          max_attempts: input.maxAttempts,
          solved: input.solved,
          hint_score_before_solve: input.hintScoreBeforeSolve,
          total_hint_score: input.totalHintScore,
          raw_share: input.rawShare,
          attempt_rows: input.attemptRows,
        },
        {
          onConflict: 'league_code,player_id,puzzle_number',
        },
      )
      .select(
        'id, league_code, player_id, puzzle_number, attempts_used, max_attempts, solved, hint_score_before_solve, total_hint_score, raw_share, attempt_rows, created_at, updated_at',
      )
      .single()

    if (error) {
      throw new Error(error.message)
    }

    return mapSubmissionRow(data)
  }

  const key = submissionsKey(normalizedLeagueCode)
  const localSubmissions = readJson<Submission[]>(key) ?? []
  const now = new Date().toISOString()

  const existingIndex = localSubmissions.findIndex(
    (submission) => submission.playerId === input.playerId && submission.puzzleNumber === input.puzzleNumber,
  )

  if (existingIndex >= 0) {
    const existing = localSubmissions[existingIndex]

    const updated: Submission = {
      ...existing,
      attemptsUsed: input.attemptsUsed,
      maxAttempts: input.maxAttempts,
      solved: input.solved,
      hintScoreBeforeSolve: input.hintScoreBeforeSolve,
      totalHintScore: input.totalHintScore,
      rawShare: input.rawShare,
      attemptRows: input.attemptRows,
      updatedAt: now,
    }

    const next = [...localSubmissions]
    next[existingIndex] = updated
    writeJson(key, next)
    return updated
  }

  const created: Submission = {
    id: crypto.randomUUID(),
    leagueCode: normalizedLeagueCode,
    playerId: input.playerId,
    puzzleNumber: input.puzzleNumber,
    attemptsUsed: input.attemptsUsed,
    maxAttempts: input.maxAttempts,
    solved: input.solved,
    hintScoreBeforeSolve: input.hintScoreBeforeSolve,
    totalHintScore: input.totalHintScore,
    rawShare: input.rawShare,
    attemptRows: input.attemptRows,
    createdAt: now,
    updatedAt: now,
  }

  writeJson(key, [...localSubmissions, created])
  return created
}
