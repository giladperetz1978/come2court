import type { FormEvent } from 'react'
import { useEffect, useMemo, useState } from 'react'

type GameStatus = 'OPEN' | 'CONFIRMED' | 'WAITING' | 'LOCKED' | 'CANCELLED'
type PlayerRole = 'PLAYING' | 'WAITING'

type User = {
  id: number
  name: string
  email: string
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
  gameDate: string
  status: GameStatus
  isCancelled: boolean
  minPlayersForConfirmation: number
  maxPlayers: number
  playersCount: number
  players: Player[]
  viewerPosition: number | null
  viewerRole: PlayerRole | null
}

type ApiConfig = {
  vapidPublicKey: string
  closedGroupEnabled: boolean
}

const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8787').replace(/\/$/, '')
const USER_ID_KEY = 'yomshishi_user_id'

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
  const [error, setError] = useState<string>('')
  const [success, setSuccess] = useState<string>('')
  const [nameInput, setNameInput] = useState('')
  const [emailInput, setEmailInput] = useState('')

  const registeredUserId = useMemo(() => {
    const raw = localStorage.getItem(USER_ID_KEY)
    return raw ? Number(raw) : null
  }, [])

  useEffect(() => {
    // Architecture note: UI state lives locally, server enforces all game rules.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registeredUserId])

  async function refreshGame(userId?: number) {
    const query = userId ? `?userId=${userId}` : ''
    const response = await apiRequest<{ game: Game }>(`/api/games/current${query}`)
    setGame(response.game)
  }

  async function registerUser(event: FormEvent) {
    event.preventDefault()
    setError('')
    setSuccess('')
    setIsBusy(true)
    try {
      const response = await apiRequest<{ user: User }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ name: nameInput, email: emailInput }),
      })
      setUser(response.user)
      localStorage.setItem(USER_ID_KEY, String(response.user.id))
      await refreshGame(response.user.id)
      setSuccess('ההרשמה הצליחה. ניתן להצטרף למשחק.')
    } catch (requestError: unknown) {
      const errorMessage = requestError instanceof Error ? requestError.message : 'ההרשמה נכשלה.'
      setError(errorMessage)
    } finally {
      setIsBusy(false)
    }
  }

  async function joinGame() {
    if (!user) return
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
    if (!user) return
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

  return (
    <main className="app-shell">
      <section className="hero">
        <h1>ניהול משחק 3x3 ליום שישי</h1>
        <p>
          קבוצה סגורה בלבד: רישום חד-פעמי, רשימת המתנה אוטומטית, ותזכורות Push לפני משחק.
        </p>
      </section>

      <section className="grid">
        {!user && (
          <article className="card">
            <h2>רישום חד-פעמי</h2>
            <p className="muted">המערכת פתוחה למשתמשים שאושרו מראש בלבד.</p>
            <form className="input-grid" onSubmit={registerUser}>
              <input
                required
                placeholder="שם מלא"
                value={nameInput}
                onChange={(event) => setNameInput(event.target.value)}
              />
              <input
                required
                placeholder="אימייל"
                type="email"
                value={emailInput}
                onChange={(event) => setEmailInput(event.target.value)}
              />
              <button disabled={isBusy} className="cta cta-primary" type="submit">
                {isBusy ? 'שולח...' : 'הרשמה'}
              </button>
            </form>
          </article>
        )}

        {user && (
          <article className="card">
            <h2>שלום, {user.name}</h2>
            <p className="muted">{user.email}</p>
            <div className="row" style={{ marginTop: 12 }}>
              {!isUserInGame ? (
                <button disabled={isBusy} className="cta cta-primary" onClick={joinGame}>
                  הצטרפות למשחק
                </button>
              ) : (
                <button disabled={isBusy} className="cta cta-danger" onClick={leaveGame}>
                  ביטול הרשמה
                </button>
              )}

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
            </div>
          </article>
        )}

        <article className="card full-width">
          <h2>משחק קרוב</h2>
          {game ? (
            <>
              <div className="row">
                <span className={`status-badge status-${game.status}`}>{getStatusLabel(game.status)}</span>
                <span className="muted">תאריך: {new Date(game.gameDate).toLocaleString('he-IL')}</span>
                <span className="muted">רשומים: {game.playersCount}/12</span>
              </div>
              {user && game.viewerPosition && (
                <p>
                  המיקום שלך: <strong>#{game.viewerPosition}</strong> | סטטוס אישי:{' '}
                  <strong>{game.viewerRole === 'PLAYING' ? 'משחק' : 'המתנה'}</strong>
                </p>
              )}
              <p className="muted">
                כללי ליגה: 6+ מאשר משחק, 10-11 ברשימת המתנה, 12 נועלים את המשחק וכל השחקנים חייבים להגיע.
              </p>
            </>
          ) : (
            <p className="muted">טוען נתוני משחק...</p>
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

