import type { FormEvent } from 'react'
import { useEffect, useMemo, useState } from 'react'

type GameStatus = 'OPEN' | 'CONFIRMED' | 'WAITING' | 'LOCKED' | 'CANCELLED'
type PlayerRole = 'PLAYING' | 'WAITING'

type User = {
  id: number
  name: string
  firstName: string
  lastName: string
  profileCompleted: boolean
  email: string
  isAdmin: boolean
  isActive?: boolean
}

type PlayerOption = {
  id: number
  name: string
}

type AdminPlayer = {
  id: number
  name: string
  isActive: boolean
  createdAt: string
}

type Player = {
  registrationId: number
  userId: number
  name: string
  email: string
  position: number
  role: PlayerRole
  joinedAt: string
}

type Game = {
  id: number
  title: string
  location: string
  notes: string
  gameDate: string
  status: GameStatus
  isCancelled: boolean
  minPlayersForConfirmation: number
  maxPlayers: number
  playersCount: number
  players: Player[]
  viewerPosition: number | null
  viewerRole: PlayerRole | null
  createdByUserId: number | null
  createdByName: string
  registrationDeadline: string
  canRegister: boolean
  isRegistrationClosed: boolean
  reminderDueAt: string
  reminderSentAt: string | null
}

type ApiConfig = {
  vapidPublicKey: string
  closedGroupEnabled: boolean
  registrationLeadHours: number
  registrationLockHour?: number
  googleClientId: string
  adminLoginEnabled: boolean
}

type UpcomingGamesResponse = {
  games: Game[]
  maxActiveGames: number
}

type GameFormState = {
  title: string
  location: string
  notes: string
  gameDate: string
}

const configuredApiBase = String(import.meta.env.VITE_API_BASE_URL || '').trim()
const API_BASE = configuredApiBase ? configuredApiBase.replace(/\/$/, '') : ''
const USER_ID_KEY = 'yomshishi_user_id_v3'
const ADMIN_TOKEN_KEY = 'yomshishi_admin_token_v3'

function readStoredUserId(): number | null {
  try {
    const raw = localStorage.getItem(USER_ID_KEY)
    if (!raw) return null
    const parsed = Number(raw)
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null
  } catch (_error) {
    return null
  }
}

function writeStoredUserId(userId: number) {
  try {
    localStorage.setItem(USER_ID_KEY, String(userId))
  } catch (_error) {
    // Ignore storage failures.
  }
}

function clearStoredUserId() {
  try {
    localStorage.removeItem(USER_ID_KEY)
  } catch (_error) {
    // Ignore storage failures.
  }
}

function readStoredAdminToken(): string {
  try {
    return String(localStorage.getItem(ADMIN_TOKEN_KEY) || '')
  } catch (_error) {
    return ''
  }
}

function writeStoredAdminToken(token: string) {
  try {
    localStorage.setItem(ADMIN_TOKEN_KEY, token)
  } catch (_error) {
    // Ignore storage failures.
  }
}

function clearStoredAdminToken() {
  try {
    localStorage.removeItem(ADMIN_TOKEN_KEY)
  } catch (_error) {
    // Ignore storage failures.
  }
}

function getStatusLabel(status: GameStatus): string {
  switch (status) {
    case 'OPEN':
      return 'פתוח (פחות מ-6)'
    case 'CONFIRMED':
      return 'מאושר (6-9)'
    case 'WAITING':
      return 'הגרלה פעילה'
    case 'LOCKED':
      return '12 שחקנים - כולם משחקים'
    case 'CANCELLED':
      return 'מבוטל'
    default:
      return status
  }
}

function createDefaultGameDateInput(): string {
  const target = new Date()
  const delta = (5 - target.getDay() + 7) % 7 || 7
  target.setDate(target.getDate() + delta)
  target.setHours(16, 0, 0, 0)
  return toLocalDateTimeInput(target.toISOString())
}

function toLocalDateTimeInput(isoString: string): string {
  const date = new Date(isoString)
  const localValue = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return localValue.toISOString().slice(0, 16)
}

function createEmptyGameForm(): GameFormState {
  return {
    title: 'משחק שישי',
    location: '',
    notes: '',
    gameDate: createDefaultGameDateInput(),
  }
}

function formatGameDateTime(value: string): string {
  return new Date(value).toLocaleString('he-IL', {
    weekday: 'long',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatGameDate(value: string): string {
  return new Date(value).toLocaleDateString('he-IL', {
    weekday: 'long',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

function gameToForm(game: Game): GameFormState {
  return {
    title: game.title,
    location: game.location,
    notes: game.notes,
    gameDate: toLocalDateTimeInput(game.gameDate),
  }
}

function createGoogleCalendarUrl(game: Game): string {
  const startTime = new Date(game.gameDate)
  const endTime = new Date(startTime.getTime() + 90 * 60000) // 90 minutes

  const formatTime = (date: Date): string => {
    const year = date.getUTCFullYear()
    const month = String(date.getUTCMonth() + 1).padStart(2, '0')
    const day = String(date.getUTCDate()).padStart(2, '0')
    const hours = String(date.getUTCHours()).padStart(2, '0')
    const minutes = String(date.getUTCMinutes()).padStart(2, '0')
    const seconds = String(date.getUTCSeconds()).padStart(2, '0')
    return `${year}${month}${day}T${hours}${minutes}${seconds}Z`
  }

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: game.title || 'משחק שישי',
    dates: `${formatTime(startTime)}/${formatTime(endTime)}`,
    location: game.location || '',
    description: game.notes || 'משחק בסדרת YomShishi 3x3',
  })

  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = (payload as { message?: string })?.message || 'אירעה שגיאה בבקשה לשרת.'
    throw new Error(message)
  }

  return payload as T
}

function IntroSplash({ visible }: { visible: boolean }) {
  if (!visible) return null

  return (
    <div className="intro-overlay">
      <div className="intro-court">
        <div className="hoop" />
        <div className="ball" />
        <div className="bounce-shadow" />
      </div>
      <p className="intro-title">YomShishi Basketball</p>
    </div>
  )
}

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [game, setGame] = useState<Game | null>(null)
  const [upcomingGames, setUpcomingGames] = useState<Game[]>([])
  const [maxActiveGames, setMaxActiveGames] = useState(2)
  const [apiConfig, setApiConfig] = useState<ApiConfig | null>(null)
  const [playerOptions, setPlayerOptions] = useState<PlayerOption[]>([])
  const [adminPlayers, setAdminPlayers] = useState<AdminPlayer[]>([])
  const [selectedPlayerId, setSelectedPlayerId] = useState<number | null>(null)
  const [playerPassword, setPlayerPassword] = useState('')
  const [newPlayerName, setNewPlayerName] = useState('')
  const [playerPasswordInputs, setPlayerPasswordInputs] = useState<Record<number, string>>({})
  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [showIntro, setShowIntro] = useState(true)
  const [gameForm, setGameForm] = useState<GameFormState>(() => createEmptyGameForm())
  const [isEditingGame, setIsEditingGame] = useState(false)
  const [editingGameId, setEditingGameId] = useState<number | null>(null)
  const [adminUsername, setAdminUsername] = useState('gilad')
  const [adminPassword, setAdminPassword] = useState('')
  const [adminToken, setAdminToken] = useState<string>(() => readStoredAdminToken())
  const [authTab, setAuthTab] = useState<'player' | 'admin'>('player')

  const registeredUserId = useMemo(() => readStoredUserId(), [])
  const hasAdminSession = Boolean(adminToken)

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setShowIntro(false), 2200)
    return () => window.clearTimeout(timeoutId)
  }, [])

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const [configResponse, playersResponse] = await Promise.all([
          apiRequest<ApiConfig>('/api/config'),
          apiRequest<{ players: PlayerOption[] }>('/api/players/active'),
        ])
        setApiConfig(configResponse)
        setPlayerOptions(playersResponse.players || [])

        if (registeredUserId && Number.isInteger(registeredUserId) && registeredUserId > 0) {
          try {
            const userResponse = await apiRequest<{ user: User }>(`/api/users/${registeredUserId}`)
            setUser(userResponse.user)
            await refreshAll(userResponse.user.id)
          } catch (_error) {
            clearStoredUserId()
            setUser(null)
            await refreshAll()
          }
        } else {
          await refreshAll()
        }
      } catch (requestError: unknown) {
        const errorMessage = requestError instanceof Error ? requestError.message : 'טעינת נתונים נכשלה.'
        setError(errorMessage)
      }
    }

    bootstrap()
  }, [registeredUserId])

  useEffect(() => {
    if (!isEditingGame) {
      return
    }

    const targetGame = (editingGameId ? upcomingGames.find((item) => item.id === editingGameId) : null) || game
    if (targetGame) {
      setGameForm(gameToForm(targetGame))
    }
  }, [game, isEditingGame, editingGameId, upcomingGames])

  async function refreshPlayersList() {
    const response = await apiRequest<{ players: PlayerOption[] }>('/api/players/active')
    setPlayerOptions(response.players || [])
  }

  async function refreshAdminPlayers() {
    if (!hasAdminSession) return
    const response = await apiRequest<{ players: AdminPlayer[] }>(
      `/api/admin/players?adminToken=${encodeURIComponent(adminToken)}`
    )
    setAdminPlayers(response.players || [])
  }

  async function refreshGame(userId?: number) {
    const query = userId ? `?userId=${userId}` : ''
    const response = await apiRequest<{ game: Game | null }>(`/api/games/current${query}`)
    setGame(response.game)
  }

  async function refreshUpcomingGames(userId?: number) {
    const query = userId ? `?userId=${userId}` : ''
    const response = await apiRequest<UpcomingGamesResponse>(`/api/games/upcoming${query}`)
    setUpcomingGames(response.games || [])
    setMaxActiveGames(response.maxActiveGames || 2)
  }

  async function refreshAll(userId?: number) {
    await Promise.all([refreshGame(userId), refreshUpcomingGames(userId), refreshPlayersList()])
  }

  function logout() {
    clearStoredUserId()
    setUser(null)
    setSuccess('התנתקת בהצלחה.')
    setError('')
  }

  function logoutAdmin() {
    clearStoredAdminToken()
    setAdminToken('')
    setAdminPassword('')
    setAdminPlayers([])
    setSuccess('יצאת ממצב אדמין.')
    setError('')
  }

  async function loginAdmin(event: FormEvent) {
    event.preventDefault()
    setError('')
    setSuccess('')
    setIsBusy(true)

    try {
      const response = await apiRequest<{ token: string; expiresAt: string }>('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({
          username: adminUsername,
          password: adminPassword,
        }),
      })

      writeStoredAdminToken(response.token)
      setAdminToken(response.token)
      setAdminPassword('')
      setSuccess('כניסת אדמין הצליחה.')
      await refreshAdminPlayers()
    } catch (requestError: unknown) {
      const errorMessage = requestError instanceof Error ? requestError.message : 'כניסת אדמין נכשלה.'
      setError(errorMessage)
    } finally {
      setIsBusy(false)
    }
  }

  async function loginAsSelectedPlayer() {
    if (!selectedPlayerId) {
      setError('יש לבחור שחקן מהרשימה.')
      return
    }

    const selectedPlayer = playerOptions.find((item) => item.id === selectedPlayerId)
    if (!selectedPlayer) {
      setError('השחקן שנבחר לא נמצא.')
      return
    }

    const confirmed = window.confirm('לאחר הכניסה לאפליקציה יש להירשם למשחק הקרוב')
    if (!confirmed) {
      return
    }

    setError('')
    setSuccess('')
    setIsBusy(true)

    try {
      const response = await apiRequest<{ user: User }>('/api/auth/select-player', {
        method: 'POST',
        body: JSON.stringify({
          playerId: selectedPlayerId,
          confirmed: true,
          password: playerPassword || undefined,
        }),
      })
      setUser(response.user)
      writeStoredUserId(response.user.id)
      setPlayerPassword('')
      await refreshAll(response.user.id)
      setSuccess('אחרי לחיצה על אישור יש להירשם למשחק הקרוב.')
    } catch (requestError: unknown) {
      const errorMessage = requestError instanceof Error ? requestError.message : 'הכניסה נכשלה.'
      setError(errorMessage)
    } finally {
      setIsBusy(false)
    }
  }

  async function joinGame() {
    if (!user || !game) return
    setError('')
    setSuccess('')
    setIsBusy(true)

    try {
      const response = await apiRequest<{ game: Game }>('/api/games/current/join', {
        method: 'POST',
        body: JSON.stringify({ userId: user.id }),
      })
      setGame(response.game)
      await refreshUpcomingGames(user.id)
      setSuccess('נרשמת בהצלחה למשחק.')
    } catch (requestError: unknown) {
      const errorMessage = requestError instanceof Error ? requestError.message : 'לא ניתן להצטרף כרגע.'
      setError(errorMessage)
    } finally {
      setIsBusy(false)
    }
  }

  async function leaveGame() {
    if (!user || !game) return
    setError('')
    setSuccess('')
    setIsBusy(true)

    try {
      const response = await apiRequest<{ game: Game }>('/api/games/current/leave', {
        method: 'POST',
        body: JSON.stringify({ userId: user.id }),
      })
      setGame(response.game)
      await refreshUpcomingGames(user.id)
      setSuccess('ביטלת הרשמה למשחק.')
    } catch (requestError: unknown) {
      const errorMessage = requestError instanceof Error ? requestError.message : 'לא ניתן להסיר כרגע.'
      setError(errorMessage)
    } finally {
      setIsBusy(false)
    }
  }

  async function submitGameForm(event: FormEvent) {
    event.preventDefault()
    if (!hasAdminSession) {
      setError('רק אדמין יכול לפתוח משחקים חדשים.')
      return
    }

    setError('')
    setSuccess('')
    setIsBusy(true)

    try {
      const payload = {
        userId: user?.id || 0,
        adminToken,
        title: gameForm.title,
        location: gameForm.location,
        notes: gameForm.notes,
        gameDate: new Date(gameForm.gameDate).toISOString(),
      }

      if (isEditingGame && editingGameId) {
        const response = await apiRequest<{ game: Game }>(`/api/games/${editingGameId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        })
        setGame(response.game)
        setIsEditingGame(false)
        setEditingGameId(null)
        setSuccess('המשחק עודכן בהצלחה.')
      } else {
        const response = await apiRequest<{ game: Game; message?: string }>('/api/games', {
          method: 'POST',
          body: JSON.stringify(payload),
        })
        setGame(response.game)
        setSuccess(response.message || 'המשחק נוצר בהצלחה.')
      }

      await refreshUpcomingGames(user?.id)
    } catch (requestError: unknown) {
      const errorMessage = requestError instanceof Error ? requestError.message : 'שמירת המשחק נכשלה.'
      setError(errorMessage)
    } finally {
      setIsBusy(false)
    }
  }

  async function deleteGame(targetGameId: number) {
    if (!hasAdminSession) return

    setError('')
    setSuccess('')
    setIsBusy(true)

    try {
      await apiRequest(`/api/games/${targetGameId}`, {
        method: 'DELETE',
        body: JSON.stringify({ userId: user?.id || 0, adminToken }),
      })
      if (game?.id === targetGameId) {
        setGame(null)
      }
      setIsEditingGame(false)
      setEditingGameId(null)
      setGameForm(createEmptyGameForm())
      await refreshAll(user?.id)
      setSuccess('המשחק נמחק.')
    } catch (requestError: unknown) {
      const errorMessage = requestError instanceof Error ? requestError.message : 'מחיקת משחק נכשלה.'
      setError(errorMessage)
    } finally {
      setIsBusy(false)
    }
  }

  async function createPlayerByAdmin(event: FormEvent) {
    event.preventDefault()
    if (!hasAdminSession) return

    setError('')
    setSuccess('')
    setIsBusy(true)
    try {
      await apiRequest<{ player: PlayerOption }>('/api/admin/players', {
        method: 'POST',
        body: JSON.stringify({ adminToken, name: newPlayerName }),
      })
      setNewPlayerName('')
      await Promise.all([refreshAdminPlayers(), refreshPlayersList()])
      setSuccess('השחקן נוסף לרשימת הפעילים.')
    } catch (requestError: unknown) {
      const errorMessage = requestError instanceof Error ? requestError.message : 'הוספת שחקן נכשלה.'
      setError(errorMessage)
    } finally {
      setIsBusy(false)
    }
  }

  async function removePlayerByAdmin(playerId: number) {
    if (!hasAdminSession) return

    setError('')
    setSuccess('')
    setIsBusy(true)
    try {
      await apiRequest(`/api/admin/players/${playerId}`, {
        method: 'DELETE',
        body: JSON.stringify({ adminToken }),
      })
      await Promise.all([refreshAdminPlayers(), refreshPlayersList()])
      setSuccess('השחקן סומן כלא פעיל.')
    } catch (requestError: unknown) {
      const errorMessage = requestError instanceof Error ? requestError.message : 'מחיקת שחקן נכשלה.'
      setError(errorMessage)
    } finally {
      setIsBusy(false)
    }
  }

  async function setPlayerPasswordByAdmin(playerId: number, password: string) {
    if (!hasAdminSession || !password.trim()) return

    setError('')
    setSuccess('')
    setIsBusy(true)
    try {
      await apiRequest(`/api/admin/players/${playerId}/password`, {
        method: 'POST',
        body: JSON.stringify({ adminToken, password: password.trim() }),
      })
      setSuccess('סיסמת השחקן עודכנה.')
    } catch (requestError: unknown) {
      const errorMessage = requestError instanceof Error ? requestError.message : 'עדכון סיסמה נכשל.'
      setError(errorMessage)
    } finally {
      setIsBusy(false)
    }
  }

  useEffect(() => {
    if (hasAdminSession) {
      refreshAdminPlayers().catch(() => {
        // Ignore and keep UI responsive.
      })
    }
  }, [hasAdminSession])

  const spotlightGame = game ?? upcomingGames[0] ?? null
  const nextGame = upcomingGames.find((item) => item.id !== spotlightGame?.id) ?? null
  const rosterGames = [spotlightGame, nextGame].filter((item): item is Game => Boolean(item))
  const isUserInGame = Boolean(user && game?.players.some((item) => item.userId === user.id))

  const canShowCreateForm = Boolean(hasAdminSession && upcomingGames.length < maxActiveGames)
  const canShowAdminEditor = Boolean(hasAdminSession && upcomingGames.length)
  const showCreateBlock = canShowCreateForm || canShowAdminEditor
  const isLandingMode = !user && !hasAdminSession

  return (
    <main className="app-shell">
      <IntroSplash visible={showIntro} />

      <section className="hero hero-sport">
        <div className="topbar">
          <div className="admin-corner">
            {hasAdminSession ? (
              <button disabled={isBusy} className="auth-chip auth-chip-active" onClick={logoutAdmin}>
                יציאה מאדמין
              </button>
            ) : !user ? (
              <button
                type="button"
                className={`auth-chip ${authTab === 'admin' ? 'auth-chip-active' : ''}`}
                onClick={() => setAuthTab((current) => (current === 'admin' ? 'player' : 'admin'))}
              >
                {authTab === 'admin' ? 'חזרה' : 'ADMIN'}
              </button>
            ) : null}
          </div>

          <div className="brand-block">
            <h1 className="hero-title-neon" aria-label="ספורטק 3X3">
              <span className="hero-title-line">ספורטק</span>
              <span className="hero-title-line">3X3</span>
            </h1>
            <p className="hero-tagline">ליגת שישי</p>
          </div>
        </div>

        {user && (
          <div className="hero-strip hero-strip-compact">
            <div>
              <strong>{user.name}</strong>
              <p>כניסה פעילה</p>
            </div>
            <button disabled={isBusy} className="cta cta-ghost" onClick={logout}>
              התנתקות
            </button>
          </div>
        )}
      </section>

      <section className="grid">
        {!user && !hasAdminSession && authTab === 'player' && (
          <article className="card full-width card-compact landing-card">
            <div className="section-head">
              <div>
                <p className="section-kicker">Player Select</p>
                <h2>כניסה לפי רשימת שחקנים פעילים</h2>
              </div>
            </div>
            <div className="input-grid">
              <select
                className="select-input"
                value={selectedPlayerId || ''}
                onChange={(event) => {
                  setSelectedPlayerId(Number(event.target.value) || null)
                  setPlayerPassword('')
                }}
              >
                <option value="">בחר שחקן</option>
                {playerOptions.map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.name}
                  </option>
                ))}
              </select>
              {selectedPlayerId && (
                <input
                  type="password"
                  className="text-input"
                  placeholder="סיסמה (אם קיימת)"
                  value={playerPassword}
                  onChange={(event) => setPlayerPassword(event.target.value)}
                />
              )}
              <button
                type="button"
                className="cta cta-primary landing-start-btn"
                onClick={loginAsSelectedPlayer}
                disabled={isBusy || !selectedPlayerId}
              >
                אישור כניסה
              </button>
            </div>
          </article>
        )}

        {!user && !hasAdminSession && authTab === 'admin' && (
          <article className="card full-width card-compact">
            <div className="section-head">
              <div>
                <p className="section-kicker">Admin Bench</p>
                <h2>כניסת אדמין</h2>
              </div>
            </div>
            <form className="input-grid" onSubmit={loginAdmin}>
              <input
                required
                placeholder="שם משתמש אדמין"
                value={adminUsername}
                onChange={(event) => setAdminUsername(event.target.value)}
              />
              <input
                required
                type="password"
                placeholder="סיסמת אדמין"
                value={adminPassword}
                onChange={(event) => setAdminPassword(event.target.value)}
              />
              <button disabled={isBusy} className="cta cta-primary" type="submit">
                כניסה כאדמין
              </button>
            </form>
          </article>
        )}

        {!isLandingMode && (
          <>
            <article className="card full-width game-spotlight">
              <div className="section-head">
                <div>
                  <p className="section-kicker">Tip Off</p>
                  <h2>המשחק הקרוב</h2>
                </div>
                {spotlightGame && (
                  <span className={`status-badge status-${spotlightGame.status}`}>
                    {getStatusLabel(spotlightGame.status)}
                  </span>
                )}
              </div>
              {spotlightGame ? (
                <>
                  <div className="game-headline">
                    <div>
                      <h3>{spotlightGame.title}</h3>
                      <p className="game-time">{formatGameDateTime(spotlightGame.gameDate)}</p>
                    </div>
                    <div className="game-scoreboard">
                      <span>נרשמו</span>
                      <strong>{spotlightGame.playersCount}</strong>
                    </div>
                  </div>

                  <div className="meta-grid">
                    <div className="meta-pill">{spotlightGame.location || 'מיקום יעודכן'}</div>
                    <div className="meta-pill">סגירת הרשמה: {formatGameDateTime(spotlightGame.registrationDeadline)}</div>
                    <div className="meta-pill">מינימום לפתיחת משחק: 6 שחקנים</div>
                  </div>

                  {spotlightGame.notes && <p className="muted">{spotlightGame.notes}</p>}

                  {user && game && game.viewerPosition && (
                    <p className="message message-ok inline-message">
                      המיקום שלך: #{game.viewerPosition} | סטטוס: {game.viewerRole === 'PLAYING' ? 'משחק' : 'הוגרלת החוצה'}
                    </p>
                  )}

                  {game?.isRegistrationClosed && (
                    <p className="message message-error inline-message">
                      ההרשמה נסגרה. הנעילה מתבצעת יום לפני המשחק בשעה {String(apiConfig?.registrationLockHour || 20).padStart(2, '0')}:00.
                    </p>
                  )}

                  <div className="row actions-row">
                    {spotlightGame && (
                      <button
                        className="cta cta-secondary"
                        onClick={() => window.open(createGoogleCalendarUrl(spotlightGame), '_blank')}
                      >
                        📅 הוסף ללוח השנה
                      </button>
                    )}

                    {user && game && !isUserInGame ? (
                      <button
                        disabled={isBusy || game.isRegistrationClosed}
                        className="cta cta-primary"
                        onClick={joinGame}
                      >
                        {game.isRegistrationClosed ? 'ההרשמה נסגרה' : 'הרשמה למשחק'}
                      </button>
                    ) : null}

                    {game && isUserInGame ? (
                      <button disabled={isBusy} className="cta cta-danger" onClick={leaveGame}>
                        ביטול הרשמה
                      </button>
                    ) : null}
                  </div>
                </>
              ) : (
                <p className="muted">אין כרגע משחק מתוכנן. אדמין יכול לפתוח משחק חדש.</p>
              )}
            </article>

            {nextGame && (
              <article className="card full-width next-game-card">
                <div className="section-head">
                  <div>
                    <p className="section-kicker">On Deck</p>
                    <h2>המשחק הבא</h2>
                  </div>
                  <span className={`status-badge status-${nextGame.status}`}>{getStatusLabel(nextGame.status)}</span>
                </div>
                <div className="game-headline compact-headline">
                  <div>
                    <h3>{nextGame.title}</h3>
                    <p className="game-time">{formatGameDateTime(nextGame.gameDate)}</p>
                  </div>
                  <div className="game-scoreboard game-scoreboard-small">
                    <span>נרשמו</span>
                    <strong>{nextGame.playersCount}</strong>
                  </div>
                </div>
                <button
                  className="cta cta-secondary"
                  style={{ width: '100%', marginTop: '12px' }}
                  onClick={() => window.open(createGoogleCalendarUrl(nextGame), '_blank')}
                >
                  📅 הוסף ללוח השנה
                </button>
              </article>
            )}

            {hasAdminSession && (
              <article className="card full-width card-compact">
                <div className="section-head">
                  <div>
                    <p className="section-kicker">Player Management</p>
                    <h2>ניהול שחקנים פעילים</h2>
                  </div>
                </div>

                <form className="input-grid" onSubmit={createPlayerByAdmin}>
                  <input
                    required
                    placeholder="שם שחקן חדש"
                    value={newPlayerName}
                    onChange={(event) => setNewPlayerName(event.target.value)}
                  />
                  <button disabled={isBusy} className="cta cta-primary" type="submit">
                    הוספת שחקן
                  </button>
                </form>

                <ul className="players players-grid" style={{ marginTop: 14 }}>
                  {adminPlayers.map((player) => (
                    <li key={player.id}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
                        <div>
                          <strong>{player.name}</strong> {player.isActive ? '(פעיל)' : '(לא פעיל)'}
                        </div>
                        {player.isActive && (
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
                            <input
                              type="password"
                              className="text-input"
                              placeholder="הגדר סיסמה"
                              value={playerPasswordInputs[player.id] || ''}
                              onChange={(event) =>
                                setPlayerPasswordInputs((prev) => ({
                                  ...prev,
                                  [player.id]: event.target.value,
                                }))
                              }
                              style={{ flex: 1, fontSize: '14px' }}
                            />
                            <button
                              type="button"
                              disabled={isBusy || !playerPasswordInputs[player.id]?.trim()}
                              className="cta cta-secondary"
                              style={{ padding: '8px 12px', fontSize: '12px' }}
                              onClick={() => {
                                setPlayerPasswordByAdmin(player.id, playerPasswordInputs[player.id] || '').then(() => {
                                  setPlayerPasswordInputs((prev) => ({
                                    ...prev,
                                    [player.id]: '',
                                  }))
                                })
                              }}
                            >
                              שמור סיסמה
                            </button>
                          </div>
                        )}
                        {player.isActive && (
                          <button
                            disabled={isBusy}
                            className="cta cta-danger"
                            onClick={() => removePlayerByAdmin(player.id)}
                          >
                            מחיקה
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </article>
            )}

            {showCreateBlock && (
              <article className="card full-width">
                <div className="section-head">
                  <div>
                    <p className="section-kicker">Next Match Setup</p>
                    <h2>{isEditingGame ? 'עריכת משחק' : 'פתיחת משחק חדש (אדמין בלבד)'}</h2>
                  </div>
                </div>

                {canShowAdminEditor && !isEditingGame ? (
                  <div className="row" style={{ marginTop: 12 }}>
                    {upcomingGames.map((item) => (
                      <button
                        key={`edit-${item.id}`}
                        className="cta cta-primary"
                        disabled={isBusy}
                        onClick={() => {
                          setEditingGameId(item.id)
                          setIsEditingGame(true)
                        }}
                      >
                        עריכת {formatGameDate(item.gameDate)}
                      </button>
                    ))}
                    {upcomingGames.map((item) => (
                      <button
                        key={`delete-${item.id}`}
                        className="cta cta-danger"
                        disabled={isBusy}
                        onClick={() => deleteGame(item.id)}
                      >
                        מחיקת {formatGameDate(item.gameDate)}
                      </button>
                    ))}
                  </div>
                ) : (
                  <form className="input-grid" onSubmit={submitGameForm}>
                    <input
                      required
                      placeholder="כותרת המשחק"
                      value={gameForm.title}
                      onChange={(event) => setGameForm((current) => ({ ...current, title: event.target.value }))}
                    />
                    <input
                      placeholder="מיקום"
                      value={gameForm.location}
                      onChange={(event) => setGameForm((current) => ({ ...current, location: event.target.value }))}
                    />
                    <input
                      required
                      type="datetime-local"
                      value={gameForm.gameDate}
                      onChange={(event) => setGameForm((current) => ({ ...current, gameDate: event.target.value }))}
                    />
                    <textarea
                      placeholder="הערות"
                      value={gameForm.notes}
                      onChange={(event) => setGameForm((current) => ({ ...current, notes: event.target.value }))}
                      style={{ minHeight: 100 }}
                    />
                    <div className="row">
                      <button disabled={isBusy} className="cta cta-primary" type="submit">
                        {isEditingGame ? 'שמירת שינויים' : 'יצירת משחק'}
                      </button>
                      {isEditingGame && (
                        <button
                          disabled={isBusy}
                          className="cta cta-soft"
                          type="button"
                          onClick={() => {
                            setIsEditingGame(false)
                            setEditingGameId(null)
                          }}
                        >
                          ביטול
                        </button>
                      )}
                    </div>
                  </form>
                )}
              </article>
            )}

            {rosterGames.map((rosterGame, index) => (
              <article key={rosterGame.id} className="card full-width roster-card">
                <div className="section-head">
                  <div>
                    <p className="section-kicker">{index === 0 ? 'Lineup' : 'Next Lineup'}</p>
                    <h2>{index === 0 ? 'נרשמים למשחק הקרוב' : 'נרשמים למשחק הבא'}</h2>
                  </div>
                  <span className={`status-badge status-${rosterGame.status}`}>{getStatusLabel(rosterGame.status)}</span>
                </div>
                <p className="muted roster-meta">
                  {rosterGame.title} | {formatGameDateTime(rosterGame.gameDate)}
                </p>
                <button
                  className="cta cta-secondary"
                  style={{ width: '100%', marginBottom: '16px' }}
                  onClick={() => window.open(createGoogleCalendarUrl(rosterGame), '_blank')}
                >
                  📅 הוסף ללוח השנה
                </button>
                <ul className="players players-grid">
                  {rosterGame.players.length ? (
                    rosterGame.players.map((player) => (
                      <li key={player.registrationId}>
                        <span>
                          <strong>#{player.position}</strong> {player.name}
                        </span>
                        <span className={`tag ${player.role === 'PLAYING' ? 'tag-play' : 'tag-wait'}`}>
                          {player.role === 'PLAYING' ? 'משחק' : 'בחוץ בסבב'}
                        </span>
                      </li>
                    ))
                  ) : (
                    <li className="muted">עדיין אין נרשמים למשחק הזה.</li>
                  )}
                </ul>
              </article>
            ))}
          </>
        )}
      </section>

      {error && <section className="message message-error">{error}</section>}
      {success && <section className="message message-ok">{success}</section>}
    </main>
  )
}

export default App
