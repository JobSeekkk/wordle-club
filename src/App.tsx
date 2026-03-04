import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import './App.css'
import { MARIO_KART_12_POINTS } from './lib/points'
import {
  getSavedLeagueCode,
  getSavedPlayerId,
  listPlayers,
  listSubmissions,
  saveLeagueCode,
  savePlayer,
  savePlayerId,
  upsertSubmission,
} from './lib/storage'
import { storageMode } from './lib/supabase'
import { buildDailyRanking, buildSeasonStandings, parseWordleShare } from './lib/wordle'
import type { ParsedWordleShare, Player, Submission } from './types'

const PLAYER_COLORS = ['#3A7D44', '#B28704', '#086375', '#C73E1D', '#624CAB', '#1E2019', '#AA4465', '#2D6A4F']
const DEFAULT_LEAGUE_CODE = normalizeLeagueCode(import.meta.env.VITE_DEFAULT_LEAGUE_CODE ?? '')

function formatAttempts(submission: Submission): string {
  if (submission.solved && submission.attemptsUsed !== null) {
    return `${submission.attemptsUsed}/${submission.maxAttempts}`
  }

  return `X/${submission.maxAttempts}`
}

function formatHintScore(score: number): string {
  if (Number.isInteger(score)) {
    return String(score)
  }

  return score.toFixed(1)
}

function normalizeLeagueCode(rawLeagueCode: string): string {
  return rawLeagueCode.trim().toUpperCase()
}

function App() {
  const [leagueDraft, setLeagueDraft] = useState('')
  const [leagueCode, setLeagueCode] = useState('')
  const [currentPlayerId, setCurrentPlayerId] = useState('')

  const [playerName, setPlayerName] = useState('')
  const [playerColor, setPlayerColor] = useState(PLAYER_COLORS[0])

  const [shareText, setShareText] = useState('')
  const [parsedShare, setParsedShare] = useState<ParsedWordleShare | null>(null)
  const [parseError, setParseError] = useState('')

  const [players, setPlayers] = useState<Player[]>([])
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [selectedPuzzle, setSelectedPuzzle] = useState<number | null>(null)

  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [statusMessage, setStatusMessage] = useState('')

  const refreshLeague = useCallback(async (code: string) => {
    const normalizedLeagueCode = normalizeLeagueCode(code)

    if (!normalizedLeagueCode) {
      return
    }

    const [nextPlayers, nextSubmissions] = await Promise.all([
      listPlayers(normalizedLeagueCode),
      listSubmissions(normalizedLeagueCode),
    ])

    setPlayers(nextPlayers)
    setSubmissions(nextSubmissions)

    if (nextSubmissions.length > 0) {
      const latestPuzzle = Math.max(...nextSubmissions.map((submission) => submission.puzzleNumber))

      setSelectedPuzzle((currentSelectedPuzzle) => {
        if (currentSelectedPuzzle && nextSubmissions.some((submission) => submission.puzzleNumber === currentSelectedPuzzle)) {
          return currentSelectedPuzzle
        }

        return latestPuzzle
      })
    }
  }, [])

  useEffect(() => {
    const savedLeagueCode = getSavedLeagueCode()

    if (savedLeagueCode) {
      setLeagueDraft(savedLeagueCode)
      setLeagueCode(savedLeagueCode)
      return
    }

    if (DEFAULT_LEAGUE_CODE) {
      setLeagueDraft(DEFAULT_LEAGUE_CODE)
      setLeagueCode(DEFAULT_LEAGUE_CODE)
    }
  }, [])

  useEffect(() => {
    if (!leagueCode) {
      return
    }

    setCurrentPlayerId(getSavedPlayerId(leagueCode))

    let isMounted = true

    const load = async () => {
      setIsLoading(true)
      setErrorMessage('')

      try {
        await refreshLeague(leagueCode)
      } catch (error) {
        if (isMounted) {
          setErrorMessage(
            error instanceof Error
              ? `Impossible de charger la ligue: ${error.message}`
              : 'Impossible de charger la ligue.',
          )
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    void load()

    return () => {
      isMounted = false
    }
  }, [leagueCode, refreshLeague])

  const currentPlayer = useMemo(
    () => players.find((player) => player.id === currentPlayerId) ?? null,
    [players, currentPlayerId],
  )

  useEffect(() => {
    if (!currentPlayerId) {
      return
    }

    if (!currentPlayer) {
      setCurrentPlayerId('')
      return
    }

    setPlayerName(currentPlayer.name)
    setPlayerColor(currentPlayer.color)
  }, [currentPlayer, currentPlayerId])

  useEffect(() => {
    const cleaned = shareText.trim()

    if (!cleaned) {
      setParsedShare(null)
      setParseError('')
      return
    }

    try {
      const parsed = parseWordleShare(cleaned)
      setParsedShare(parsed)
      setParseError('')
    } catch (error) {
      setParsedShare(null)
      setParseError(error instanceof Error ? error.message : 'Format Wordle invalide.')
    }
  }, [shareText])

  const puzzleNumbers = useMemo(() => {
    const unique = new Set<number>()

    for (const submission of submissions) {
      unique.add(submission.puzzleNumber)
    }

    const fromSubmissions = Array.from(unique).sort((a, b) => b - a)

    if (parsedShare && !unique.has(parsedShare.puzzleNumber)) {
      return [parsedShare.puzzleNumber, ...fromSubmissions]
    }

    return fromSubmissions
  }, [parsedShare, submissions])

  const activePuzzle = selectedPuzzle ?? puzzleNumbers[0] ?? null

  const dailyRanking = useMemo(() => {
    if (!activePuzzle) {
      return []
    }

    return buildDailyRanking(players, submissions, activePuzzle, MARIO_KART_12_POINTS)
  }, [activePuzzle, players, submissions])

  const seasonStandings = useMemo(
    () => buildSeasonStandings(players, submissions, MARIO_KART_12_POINTS),
    [players, submissions],
  )

  const missingPlayers = useMemo(() => {
    if (!activePuzzle) {
      return players
    }

    const submittedPlayers = new Set(dailyRanking.map((row) => row.player.id))
    return players.filter((player) => !submittedPlayers.has(player.id))
  }, [activePuzzle, dailyRanking, players])

  const handleLeagueSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const normalizedLeagueCode = normalizeLeagueCode(leagueDraft)

    if (!normalizedLeagueCode) {
      setErrorMessage('Choisis un code de ligue.')
      return
    }

    saveLeagueCode(normalizedLeagueCode)
    setLeagueCode(normalizedLeagueCode)
    setStatusMessage(`Ligue ${normalizedLeagueCode} active.`)
    setErrorMessage('')
  }

  const handleProfileSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!leagueCode) {
      setErrorMessage('Active d\'abord une ligue.')
      return
    }

    setIsLoading(true)
    setErrorMessage('')

    try {
      const savedPlayer = await savePlayer({
        leagueCode,
        playerId: currentPlayer?.id,
        name: playerName,
        color: playerColor,
      })

      savePlayerId(leagueCode, savedPlayer.id)
      setCurrentPlayerId(savedPlayer.id)
      setStatusMessage(`Profil prêt: ${savedPlayer.name}`)
      await refreshLeague(leagueCode)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Impossible d\'enregistrer le profil.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleScoreSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!leagueCode) {
      setErrorMessage('Active d\'abord une ligue.')
      return
    }

    if (!currentPlayer) {
      setErrorMessage('Crée ton profil avant d\'envoyer un score.')
      return
    }

    let parsed: ParsedWordleShare

    try {
      parsed = parseWordleShare(shareText)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Format Wordle invalide.')
      return
    }

    setIsLoading(true)
    setErrorMessage('')

    try {
      await upsertSubmission({
        leagueCode,
        playerId: currentPlayer.id,
        puzzleNumber: parsed.puzzleNumber,
        attemptsUsed: parsed.attemptsUsed,
        maxAttempts: parsed.maxAttempts,
        solved: parsed.solved,
        hintScoreBeforeSolve: Number(parsed.hintScoreBeforeSolve.toFixed(2)),
        totalHintScore: Number(parsed.totalHintScore.toFixed(2)),
        rawShare: parsed.rawText,
        attemptRows: parsed.attempts.map((attempt) => attempt.row),
      })

      await refreshLeague(leagueCode)
      setSelectedPuzzle(parsed.puzzleNumber)
      setShareText('')
      setStatusMessage(`Score du Wordle ${parsed.puzzleNumber} enregistré.`)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Impossible d\'enregistrer ce score.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="app-shell">
      <div className="ambient-glow" aria-hidden="true" />
      <main className="app">
        <header className="hero panel">
          <p className="eyebrow">Wordle League</p>
          <h1>Compétition Wordle entre amis</h1>
          <p>
            Score principal: moins de tentatives = meilleur classement. Égalité: on compare le score d&apos;indices avant la
            ligne gagnante ({'<'} meilleur).
          </p>
          <div className="hero-meta">
            <span className="badge">Points Mario Kart: {MARIO_KART_12_POINTS.join(' / ')}</span>
            <span className="badge badge--secondary">
              Stockage: {storageMode === 'supabase' ? 'Supabase' : 'Local (démo)'}
            </span>
          </div>
        </header>

        <section className="panel stagger-1">
          <h2>Ligue</h2>
          <form className="stack" onSubmit={handleLeagueSubmit}>
            <label htmlFor="leagueCode">Code de ligue (partagé uniquement avec tes amis)</label>
            <div className="inline-row">
              <input
                id="leagueCode"
                value={leagueDraft}
                onChange={(event) => setLeagueDraft(event.target.value)}
                placeholder="Ex: WORDLE-POTES"
                autoComplete="off"
              />
              <button type="submit">Activer</button>
            </div>
          </form>
          {leagueCode ? <p className="muted">Ligue active: {leagueCode}</p> : null}
        </section>

        <section className="panel stagger-2">
          <h2>Profil</h2>
          <form className="stack" onSubmit={handleProfileSubmit}>
            <label htmlFor="playerName">Nom affiché</label>
            <input
              id="playerName"
              value={playerName}
              onChange={(event) => setPlayerName(event.target.value)}
              placeholder="Ton pseudo"
              maxLength={24}
            />

            <label>Couleur du profil</label>
            <div className="color-row" role="radiogroup" aria-label="Choix de couleur">
              {PLAYER_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={`color-dot ${playerColor === color ? 'is-active' : ''}`}
                  onClick={() => setPlayerColor(color)}
                  style={{ backgroundColor: color }}
                  aria-label={`Choisir ${color}`}
                  aria-pressed={playerColor === color}
                />
              ))}
            </div>

            <button type="submit" disabled={isLoading || !leagueCode}>
              {currentPlayer ? 'Mettre à jour mon profil' : 'Créer mon profil'}
            </button>
          </form>

          {currentPlayer ? (
            <div className="profile-pill" style={{ borderColor: currentPlayer.color }}>
              <span className="profile-swatch" style={{ backgroundColor: currentPlayer.color }} aria-hidden="true" />
              <span>{currentPlayer.name}</span>
            </div>
          ) : (
            <p className="muted">Crée ton profil pour envoyer un score.</p>
          )}
        </section>

        <section className="panel panel--wide stagger-3">
          <h2>Envoyer mon score du jour</h2>
          <form className="stack" onSubmit={handleScoreSubmit}>
            <label htmlFor="wordleShare">Colle le partage Wordle</label>
            <textarea
              id="wordleShare"
              value={shareText}
              onChange={(event) => setShareText(event.target.value)}
              rows={7}
              placeholder={`Wordle 1,719 4/6\n\n⬛🟨⬛⬛⬛\n⬛⬛⬛🟨🟨\n⬛🟩🟩⬛🟨\n🟩🟩🟩🟩🟩`}
            />
            <button type="submit" disabled={isLoading || !currentPlayer || !shareText.trim()}>
              Enregistrer ce score
            </button>
          </form>

          {parseError ? <p className="error-inline">{parseError}</p> : null}

          {parsedShare ? (
            <div className="preview">
              <p>
                Puzzle <strong>{parsedShare.puzzleNumber}</strong> · Résultat{' '}
                <strong>
                  {parsedShare.solved && parsedShare.attemptsUsed !== null
                    ? `${parsedShare.attemptsUsed}/${parsedShare.maxAttempts}`
                    : `X/${parsedShare.maxAttempts}`}
                </strong>{' '}
                · Indices avant réussite <strong>{formatHintScore(parsedShare.hintScoreBeforeSolve)}</strong>
              </p>
              <div className="emoji-grid">
                {parsedShare.attempts.map((attempt) => (
                  <code key={`${attempt.row}-${attempt.hintScore}`}>{attempt.row}</code>
                ))}
              </div>
            </div>
          ) : null}
        </section>

        <section className="panel panel--wide stagger-4">
          <div className="section-head">
            <h2>Classement du jour</h2>
            <div className="inline-row">
              <label htmlFor="puzzleSelect" className="sr-only">
                Choisir le puzzle
              </label>
              <select
                id="puzzleSelect"
                value={activePuzzle ?? ''}
                onChange={(event) => setSelectedPuzzle(Number(event.target.value))}
                disabled={puzzleNumbers.length === 0}
              >
                {puzzleNumbers.length === 0 ? <option value="">Aucun puzzle</option> : null}
                {puzzleNumbers.map((puzzleNumber) => (
                  <option key={puzzleNumber} value={puzzleNumber}>
                    Wordle {puzzleNumber}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {dailyRanking.length === 0 ? (
            <p className="muted">Aucun score enregistré pour ce puzzle.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Rang</th>
                    <th>Joueur</th>
                    <th>Score</th>
                    <th>Indices avant réussite</th>
                    <th>Points</th>
                  </tr>
                </thead>
                <tbody>
                  {dailyRanking.map((row) => (
                    <tr key={`${row.player.id}-${row.submission.puzzleNumber}`}>
                      <td>#{row.rank}</td>
                      <td>
                        <span className="player-name">
                          <span className="profile-swatch" style={{ backgroundColor: row.player.color }} aria-hidden="true" />
                          {row.player.name}
                        </span>
                      </td>
                      <td>{formatAttempts(row.submission)}</td>
                      <td>{formatHintScore(row.submission.hintScoreBeforeSolve)}</td>
                      <td>{row.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activePuzzle && missingPlayers.length > 0 ? (
            <p className="muted">Pas encore envoyé: {missingPlayers.map((player) => player.name).join(', ')}</p>
          ) : null}
        </section>

        <section className="panel panel--wide stagger-5">
          <h2>Classement général</h2>
          {seasonStandings.length === 0 ? (
            <p className="muted">Le classement apparaîtra après les premières parties.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Joueur</th>
                    <th>Points</th>
                    <th>Victoires</th>
                    <th>Parties</th>
                    <th>Moyenne essais (réussites)</th>
                  </tr>
                </thead>
                <tbody>
                  {seasonStandings.map((standing) => (
                    <tr key={standing.player.id}>
                      <td>
                        <span className="player-name">
                          <span className="profile-swatch" style={{ backgroundColor: standing.player.color }} aria-hidden="true" />
                          {standing.player.name}
                        </span>
                      </td>
                      <td>{standing.totalPoints}</td>
                      <td>{standing.wins}</td>
                      <td>{standing.daysPlayed}</td>
                      <td>
                        {standing.averageAttempts === null ? '—' : standing.averageAttempts.toFixed(2).replace(/\.00$/, '')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {statusMessage ? <p className="status">{statusMessage}</p> : null}
        {errorMessage ? <p className="error">{errorMessage}</p> : null}
        {isLoading ? <p className="muted">Synchronisation…</p> : null}
      </main>
    </div>
  )
}

export default App
