import type { FormEvent } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'

type GameStatus = 'OPEN' | 'CONFIRMED' | 'WAITING' | 'LOCKED' | 'CANCELLED'
type PlayerRole = 'PLAYING' | 'WAITING'

type User = {
  id: number
  name: string
  email: string
  isAdmin: boolean
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
  googleClientId: string
}

type GameFormState = {
  title: string
  location: string
  notes: string
  gameDate: string
}

type GoogleCredentialResponse = {
  credential: string
}

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: {
          initialize: (params: {
            client_id: string
            callback: (response: GoogleCredentialResponse) => void
            auto_select?: boolean
            ux_mode?: 'popup' | 'redirect'
          }) => void
          renderButton: (
            parent: HTMLElement,
            options: { theme?: 'outline' | 'filled_blue'; size?: 'large' | 'medium'; text?: string }
          ) => void
        }
      }
    }
  }
}

const configuredApiBase = String(import.meta.env.VITE_API_BASE_URL || '').trim()
// Same-origin (VPS serves both frontend and API)
const API_BASE = configuredApiBase ? configuredApiBase.replace(/\/$/, '') : ''
const USER_ID_KEY = 'yomshishi_user_id'

function readStoredUserId(): number | null {
  try {
    const raw = localStorage.getItem(USER_ID_KEY)
    if (!raw) {
      return null
    }

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
    // Ignore storage failures in locked-down browsers.
  }
}

function clearStoredUserId() {
  try {
    localStorage.removeItem(USER_ID_KEY)
  } catch (_error) {
    // Ignore storage failures in locked-down browsers.
  }
}

function getStatusLabel(status: GameStatus): string {
  switch (status) {
    case 'OPEN':
      return 'פתוח להרשמה'
    case 'CONFIRMED':
      return 'מאושר (מינימום 6)'
    case 'WAITING':
      return 'רשימת המתנה'
    case 'LOCKED':
      return 'נעול (12 שחקנים)'
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
    title: 'משחק 3x3',
    location: '',
    notes: '',
    gameDate: createDefaultGameDateInput(),
  }
}

function gameToForm(game: Game): GameFormState {
  return {
    title: game.title,
    location: game.location,
    notes: game.notes,
    gameDate: toLocalDateTimeInput(game.gameDate),
  }
}

function toBase64UrlUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index)
  }
  return outputArray
}

function toArrayBuffer(data: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(data)
  return copy.buffer as ArrayBuffer
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

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [game, setGame] = useState<Game | null>(null)
  const [apiConfig, setApiConfig] = useState<ApiConfig | null>(null)
  const [installPrompt, setInstallPrompt] = useState<any>(null)
  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [googleReady, setGoogleReady] = useState(false)
  const [gameForm, setGameForm] = useState<GameFormState>(() => createEmptyGameForm())
  const [isEditingGame, setIsEditingGame] = useState(false)
  const googleButtonRef = useRef<HTMLDivElement | null>(null)

  const registeredUserId = useMemo(() => readStoredUserId(), [])

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
  }, [])

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const configResponse = await apiRequest<ApiConfig>('/api/config')
        setApiConfig(configResponse)

        if (registeredUserId && Number.isInteger(registeredUserId) && registeredUserId > 0) {
          const userResponse = await apiRequest<{ user: User }>(`/api/users/${registeredUserId}`)
          setUser(userResponse.user)
          await refreshGame(userResponse.user.id)
        } else {
          await refreshGame()
        }
      } catch (requestError: unknown) {
        const errorMessage =
          requestError instanceof Error ? requestError.message : 'טעינת נתונים נכשלה.'
        setError(errorMessage)
      }
    }

    bootstrap()
  }, [registeredUserId])

  useEffect(() => {
    if (!game) {
      setIsEditingGame(false)
      setGameForm(createEmptyGameForm())
      return
    }

    if (isEditingGame) {
      setGameForm(gameToForm(game))
    }
  }, [game, isEditingGame])

  useEffect(() => {
    if (user || !apiConfig?.googleClientId || !googleButtonRef.current) {
      return
    }

    const googleIdApi = window.google?.accounts?.id
    if (!googleIdApi) {
      setGoogleReady(false)
      return
    }

    const handleGoogleCredential = async (response: GoogleCredentialResponse) => {
      if (!response.credential) {
        setError('התקבל טוקן Google לא תקין.')
        return
      }

      setError('')
      setSuccess('')
      setIsBusy(true)
      try {
        const authResponse = await apiRequest<{ user: User }>('/api/auth/google', {
          method: 'POST',
          body: JSON.stringify({ idToken: response.credential }),
        })
        setUser(authResponse.user)
        writeStoredUserId(authResponse.user.id)
        await refreshGame(authResponse.user.id)
        setSuccess('נכנסת בהצלחה עם Google.')
      } catch (requestError: unknown) {
        const errorMessage = requestError instanceof Error ? requestError.message : 'כניסה עם Google נכשלה.'
        setError(errorMessage)
      } finally {
        setIsBusy(false)
      }
    }

    googleIdApi.initialize({
      client_id: apiConfig.googleClientId,
      callback: handleGoogleCredential,
      ux_mode: 'popup',
      auto_select: false,
    })

    googleButtonRef.current.innerHTML = ''
    googleIdApi.renderButton(googleButtonRef.current, {
      theme: 'outline',
      size: 'large',
      text: 'continue_with',
    })

    setGoogleReady(true)
  }, [apiConfig?.googleClientId, user])

  async function refreshGame(userId?: number) {
    const query = userId ? `?userId=${userId}` : ''
    const response = await apiRequest<{ game: Game | null }>(`/api/games/current${query}`)
    setGame(response.game)
  }

  function logout() {
    clearStoredUserId()
    setUser(null)
    setGame(null)
    setSuccess('התנתקת בהצלחה.')
    setError('')
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
      setSuccess('הוסרת מהרישום למשחק.')
    } catch (requestError: unknown) {
      const errorMessage = requestError instanceof Error ? requestError.message : 'לא ניתן להסיר כרגע.'
      setError(errorMessage)
    } finally {
      setIsBusy(false)
    }
  }

  async function submitGameForm(event: FormEvent) {
    event.preventDefault()
    if (!user) return

    setError('')
    setSuccess('')
    setIsBusy(true)

    try {
      const payload = {
        userId: user.id,
        title: gameForm.title,
        location: gameForm.location,
        notes: gameForm.notes,
        gameDate: gameForm.gameDate,
      }

      if (game && user.isAdmin && isEditingGame) {
        const response = await apiRequest<{ game: Game }>(`/api/games/${game.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        })
        setGame(response.game)
        setIsEditingGame(false)
        setSuccess('פרטי המשחק עודכנו על ידי אדמין.')
      } else {
        const response = await apiRequest<{ game: Game; message?: string }>('/api/games', {
          method: 'POST',
          body: JSON.stringify(payload),
        })
        setGame(response.game)
        setSuccess(
          response.message || 'המשחק נוצר. שים לב: גם מי שיצר את המשחק חייב להירשם אליו בנפרד.'
        )
      }
    } catch (requestError: unknown) {
      const errorMessage = requestError instanceof Error ? requestError.message : 'שמירת המשחק נכשלה.'
      setError(errorMessage)
    } finally {
      setIsBusy(false)
    }
  }

  async function deleteGame() {
    if (!user || !game || !user.isAdmin) return
    setError('')
    setSuccess('')
    setIsBusy(true)
    try {
      await apiRequest(`/api/games/${game.id}`, {
        method: 'DELETE',
        body: JSON.stringify({ userId: user.id }),
      })
      setGame(null)
      setGameForm(createEmptyGameForm())
      setIsEditingGame(false)
      setSuccess('המשחק נמחק על ידי אדמין.')
    } catch (requestError: unknown) {
      const errorMessage = requestError instanceof Error ? requestError.message : 'מחיקת המשחק נכשלה.'
      setError(errorMessage)
    } finally {
      setIsBusy(false)
    }
  }

  async function subscribeForPush() {
    if (!user || !apiConfig?.vapidPublicKey) {
      setError('Push אינו מוגדר כרגע בשרת.')
      return
    }

    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setError('המכשיר אינו תומך ב-Push Notifications.')
      return
    }

    setError('')
    setSuccess('')
    setIsBusy(true)

    try {
      const registration = await navigator.serviceWorker.ready
      const serverKey = toArrayBuffer(toBase64UrlUint8Array(apiConfig.vapidPublicKey))
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: serverKey,
      })

      await apiRequest('/api/push/subscribe', {
        method: 'POST',
        body: JSON.stringify({
          userId: user.id,
          subscription,
        }),
      })

      setSuccess('נרשמת בהצלחה לתזכורות Push.')
    } catch (requestError: unknown) {
      const errorMessage = requestError instanceof Error ? requestError.message : 'רישום ל-Push נכשל.'
      setError(errorMessage)
    } finally {
      setIsBusy(false)
    }
  }

  async function promptInstall() {
    if (!installPrompt) {
      setError('אפשרות התקנה עדיין לא זמינה בדפדפן זה.')
      return
    }

    setError('')
    await installPrompt.prompt()
    setInstallPrompt(null)
  }

  const isUserInGame = Boolean(user && game?.players.some((item) => item.userId === user.id))
  const canShowCreateForm = Boolean(user && !game)
  const canShowAdminEditor = Boolean(user?.isAdmin && game)
  const isGoogleConfigured = Boolean(apiConfig?.googleClientId)
  const isSecureOriginForGoogle =
    window.isSecureContext || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'

  return (
    <main className="app-shell">
      <section className="hero">
        <h1>ניהול משחק 3x3</h1>
        <p>כל משתתף יכול ליצור משחק ידנית. רק אדמין יכול לערוך או למחוק משחק קיים.</p>
      </section>

      <section className="grid">
        {!user && (
          <article className="card">
            <h2>כניסה עם Google</h2>
            <p className="muted">המערכת פתוחה למשתמשים שאושרו מראש בלבד לפי האימייל בחשבון Google.</p>
            <div className="input-grid">
              {!isGoogleConfigured ? (
                <p className="message message-error">
                  Google Sign-In לא מוגדר כרגע בשרת. יש להגדיר GOOGLE_CLIENT_ID בסביבת הפרודקשן.
                </p>
              ) : !isSecureOriginForGoogle ? (
                <p className="message message-error">Google Sign-In דורש HTTPS (או localhost) כדי להציג את הכפתור.</p>
              ) : (
                <>
                  <div ref={googleButtonRef} style={{ minHeight: 44 }} />
                  {!googleReady && (
                    <p className="muted">טוען כפתור Google... אם הוא לא מופיע, רענן את הדף.</p>
                  )}
                </>
              )}
            </div>
          </article>
        )}

        {user && (
          <article className="card">
            <h2>שלום, {user.name}</h2>
            <p className="muted">{user.email}</p>
            {user.isAdmin && <p className="muted">הרשאה: ADMIN</p>}
            <div className="row" style={{ marginTop: 12 }}>
              {game && !isUserInGame ? (
                <button
                  disabled={isBusy || game.isRegistrationClosed}
                  className="cta cta-primary"
                  onClick={joinGame}
                >
                  {game.isRegistrationClosed ? 'ההרשמה נסגרה' : 'הצטרפות למשחק'}
                </button>
              ) : null}

              {game && isUserInGame ? (
                <button disabled={isBusy} className="cta cta-danger" onClick={leaveGame}>
                  ביטול הרשמה
                </button>
              ) : null}

              <button disabled={isBusy || !installPrompt} className="cta cta-soft" onClick={promptInstall}>
                התקנת האפליקציה
              </button>

              <button
                disabled={isBusy || !apiConfig?.vapidPublicKey}
                className="cta cta-soft"
                onClick={subscribeForPush}
              >
                הפעלת תזכורות Push
              </button>

              <button disabled={isBusy} className="cta cta-soft" onClick={logout}>
                התנתקות
              </button>
            </div>
          </article>
        )}

        {(canShowCreateForm || canShowAdminEditor) && (
          <article className="card full-width">
            <h2>{isEditingGame ? 'עריכת משחק (ADMIN)' : 'יצירת משחק חדש'}</h2>
            <p className="muted">
              מי שיוצר את המשחק אינו נרשם אוטומטית. כולם, כולל היוצר, חייבים להירשם עד{' '}
              {apiConfig?.registrationLeadHours || 24} שעות לפני המשחק.
            </p>
            {canShowAdminEditor && !isEditingGame ? (
              <div className="row" style={{ marginTop: 12 }}>
                <button className="cta cta-primary" disabled={isBusy} onClick={() => setIsEditingGame(true)}>
                  עריכת משחק
                </button>
                <button className="cta cta-danger" disabled={isBusy} onClick={deleteGame}>
                  מחיקת משחק
                </button>
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
                      onClick={() => setIsEditingGame(false)}
                    >
                      ביטול
                    </button>
                  )}
                </div>
              </form>
            )}
          </article>
        )}

        <article className="card full-width">
          <h2>המשחק הקרוב</h2>
          {game ? (
            <>
              <div className="row">
                <span className={`status-badge status-${game.status}`}>{getStatusLabel(game.status)}</span>
                <span className="muted">{game.title}</span>
                <span className="muted">תאריך: {new Date(game.gameDate).toLocaleString('he-IL')}</span>
                <span className="muted">רשומים: {game.playersCount}/12</span>
              </div>
              {game.location && <p>מיקום: <strong>{game.location}</strong></p>}
              {game.notes && <p className="muted">הערות: {game.notes}</p>}
              {game.createdByName && <p className="muted">נוצר על ידי: {game.createdByName}</p>}
              <p className="muted">
                דדליין הרשמה: {new Date(game.registrationDeadline).toLocaleString('he-IL')}.
                תזכורת Push תישלח למי שהתקין את האפליקציה בדיוק בזמן הזה.
              </p>
              {user && game.viewerPosition && (
                <p>
                  המיקום שלך: <strong>#{game.viewerPosition}</strong> | סטטוס אישי:{' '}
                  <strong>{game.viewerRole === 'PLAYING' ? 'משחק' : 'המתנה'}</strong>
                </p>
              )}
              {game.isRegistrationClosed && (
                <p className="message message-error">ההרשמה נסגרה למשחק הזה כי נותרו פחות מ-24 שעות עד הפתיחה.</p>
              )}
              <p className="muted">
                כללי ליגה: 6+ מאשר משחק, 10-11 ברשימת המתנה, 12 נועלים את המשחק.
              </p>
            </>
          ) : (
            <p className="muted">אין כרגע משחק מתוכנן. כל משתתף רשום יכול ליצור משחק חדש.</p>
          )}
        </article>

        <article className="card full-width">
          <h3>רשימת נרשמים</h3>
          <ul className="players">
            {game?.players.length ? (
              game.players.map((player) => (
                <li key={player.registrationId}>
                  <span>
                    <strong>#{player.position}</strong> {player.name}
                  </span>
                  <span className={`tag ${player.role === 'PLAYING' ? 'tag-play' : 'tag-wait'}`}>
                    {player.role === 'PLAYING' ? 'משחק' : 'המתנה'}
                  </span>
                </li>
              ))
            ) : (
              <li className="muted">עדיין אין נרשמים למשחק.</li>
            )}
          </ul>
        </article>
      </section>

      {error && <section className="message message-error">{error}</section>}
      {success && <section className="message message-ok">{success}</section>}
    </main>
  )
}

export default App

