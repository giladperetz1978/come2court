import type { FormEvent } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'

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
const API_BASE = configuredApiBase ? configuredApiBase.replace(/\/$/, '') : ''
const USER_ID_KEY = 'yomshishi_user_id_v2'
const ADMIN_TOKEN_KEY = 'yomshishi_admin_token_v2'
const LEGACY_USER_ID_KEY = 'yomshishi_user_id'
const LEGACY_ADMIN_TOKEN_KEY = 'yomshishi_admin_token'

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
    // Ignore storage failures in locked-down browsers.
  }
}

function clearStoredAdminToken() {
  try {
    localStorage.removeItem(ADMIN_TOKEN_KEY)
  } catch (_error) {
    // Ignore storage failures in locked-down browsers.
  }
}

function clearLegacyStorage() {
  try {
    localStorage.removeItem(LEGACY_USER_ID_KEY)
    localStorage.removeItem(LEGACY_ADMIN_TOKEN_KEY)
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
  const [upcomingGames, setUpcomingGames] = useState<Game[]>([])
  const [maxActiveGames, setMaxActiveGames] = useState(2)
  const [apiConfig, setApiConfig] = useState<ApiConfig | null>(null)
  const [installPrompt, setInstallPrompt] = useState<any>(null)
  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [googleReady, setGoogleReady] = useState(false)
  const [pushEnabled, setPushEnabled] = useState(false)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [reminderBanner, setReminderBanner] = useState<string | null>(null)
  const [gameForm, setGameForm] = useState<GameFormState>(() => createEmptyGameForm())
  const [isEditingGame, setIsEditingGame] = useState(false)
  const [editingGameId, setEditingGameId] = useState<number | null>(null)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [adminUsername, setAdminUsername] = useState('gilad')
  const [adminPassword, setAdminPassword] = useState('')
  const [adminToken, setAdminToken] = useState<string>(() => readStoredAdminToken())
  const [authTab, setAuthTab] = useState<'google' | 'admin'>('google')
  const googleButtonRef = useRef<HTMLDivElement | null>(null)

  const registeredUserId = useMemo(() => readStoredUserId(), [])

  const isIos = useMemo(() => /iPad|iPhone|iPod/.test(navigator.userAgent), [])
  const isStandalone = useMemo(() => {
    const displayMode = window.matchMedia('(display-mode: standalone)').matches
    const safariStandalone = Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone)
    return displayMode || safariStandalone
  }, [])

  const hasAdminSession = Boolean(adminToken)
  const needsProfileCompletion = Boolean(user && !user.profileCompleted)

  useEffect(() => {
    clearLegacyStorage()
  }, [])

  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now()
      setNowMs(now)

      const upcoming = [...upcomingGames]
      if (upcoming.length === 0) return

      for (const g of upcoming) {
        const deadline = new Date(g.registrationDeadline).getTime()
        const diffMin = Math.round((deadline - now) / 60000)
        if (diffMin <= 30 && diffMin > -10) {
          const label = diffMin > 0 ? `${diffMin} דקות להרשמה למשחק ${g.title}!` : `הרשמה למשחק ${g.title} נסגרה!`
          setReminderBanner(label)
          return
        }
      }

      setReminderBanner(null)
    }, 30000)

    return () => clearInterval(id)
  }, [upcomingGames])

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
          try {
            const userResponse = await apiRequest<{ user: User }>(`/api/users/${registeredUserId}`)
            setUser(userResponse.user)
            setFirstName(userResponse.user.firstName || '')
            setLastName(userResponse.user.lastName || '')
            await refreshAll(userResponse.user.id)
          } catch (_error) {
            clearStoredUserId()
            clearStoredAdminToken()
            setAdminToken('')
            await refreshAll()
          }
        } else {
          await refreshAll()
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
    if (!isEditingGame) {
      return
    }

    const targetGame =
      (editingGameId ? upcomingGames.find((item) => item.id === editingGameId) : null) || game
    if (targetGame) {
      setGameForm(gameToForm(targetGame))
    }
  }, [game, isEditingGame, editingGameId, upcomingGames])

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
        setFirstName(authResponse.user.firstName || '')
        setLastName(authResponse.user.lastName || '')
        writeStoredUserId(authResponse.user.id)
        await refreshAll(authResponse.user.id)
        if (authResponse.user.firstName && authResponse.user.lastName) {
          setSuccess('נכנסת בהצלחה עם Google.')
        } else {
          setSuccess('נכנסת בהצלחה. יש להשלים שם פרטי ושם משפחה כדי להמשיך.')
        }
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
  }, [apiConfig?.googleClientId, user, adminToken])

  useEffect(() => {
    const syncPushState = async () => {
      if (!user || !apiConfig?.vapidPublicKey || !('serviceWorker' in navigator) || !('PushManager' in window)) {
        setPushEnabled(false)
        return
      }

      try {
        const registration = await navigator.serviceWorker.ready
        const subscription = await registration.pushManager.getSubscription()
        setPushEnabled(Boolean(subscription))
      } catch (_error) {
        setPushEnabled(false)
      }
    }

    syncPushState()
  }, [apiConfig?.vapidPublicKey, user])

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
    await Promise.all([refreshGame(userId), refreshUpcomingGames(userId)])
  }

  function logout() {
    clearStoredUserId()
    setUser(null)
    setGame(null)
    setFirstName('')
    setLastName('')
    setSuccess('התנתקת בהצלחה.')
    setError('')
  }

  function logoutAdmin() {
    clearStoredAdminToken()
    setAdminToken('')
    setAdminUsername('')
    setAdminPassword('')
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
      setSuccess('כניסת אדמין הצליחה. ניתן לערוך או למחוק משחק פעיל.')
    } catch (requestError: unknown) {
      const errorMessage = requestError instanceof Error ? requestError.message : 'כניסת אדמין נכשלה.'
      setError(errorMessage)
    } finally {
      setIsBusy(false)
    }
  }

  async function saveProfile(event: FormEvent) {
    event.preventDefault()
    if (!user) return

    setError('')
    setSuccess('')
    setIsBusy(true)

    try {
      const response = await apiRequest<{ user: User }>(`/api/users/${user.id}/profile`, {
        method: 'PATCH',
        body: JSON.stringify({
          firstName,
          lastName,
        }),
      })
      setUser(response.user)
      setFirstName(response.user.firstName)
      setLastName(response.user.lastName)
      await refreshAll(response.user.id)
      setSuccess('השם נשמר בהצלחה.')
    } catch (requestError: unknown) {
      const errorMessage = requestError instanceof Error ? requestError.message : 'שמירת השם נכשלה.'
      setError(errorMessage)
    } finally {
      setIsBusy(false)
    }
  }

  async function joinGame() {
    if (!user || !game || needsProfileCompletion) return
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
    if (isEditingGame) {
      const canEditAsAdmin = Boolean(user?.isAdmin || hasAdminSession)
      const targetGameId = editingGameId || game?.id || null
      if (!canEditAsAdmin || !targetGameId) {
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
        const response = await apiRequest<{ game: Game }>(`/api/games/${targetGameId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        })
        setGame(response.game)
        await refreshUpcomingGames(user?.id)
        setIsEditingGame(false)
        setEditingGameId(null)
        setSuccess('פרטי המשחק עודכנו בהצלחה.')
      } catch (requestError: unknown) {
        const errorMessage = requestError instanceof Error ? requestError.message : 'שמירת המשחק נכשלה.'
        setError(errorMessage)
      } finally {
        setIsBusy(false)
      }
      return
    }

    if (!user && !hasAdminSession) return
    if (user && needsProfileCompletion && !hasAdminSession) return

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

      const response = await apiRequest<{ game: Game; message?: string }>('/api/games', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      setGame(response.game)
      await refreshUpcomingGames(user?.id)
      setSuccess(
        response.message || 'המשחק נוצר. שים לב: גם מי שיצר את המשחק חייב להירשם אליו בנפרד.'
      )
    } catch (requestError: unknown) {
      const errorMessage = requestError instanceof Error ? requestError.message : 'שמירת המשחק נכשלה.'
      setError(errorMessage)
    } finally {
      setIsBusy(false)
    }
  }

  async function deleteGame(targetGameId?: number) {
    const deleteId = targetGameId || game?.id
    if (!deleteId || (!user?.isAdmin && !hasAdminSession)) return
    setError('')
    setSuccess('')
    setIsBusy(true)

    try {
      await apiRequest(`/api/games/${deleteId}`, {
        method: 'DELETE',
        body: JSON.stringify({
          userId: user?.id || 0,
          adminToken,
        }),
      })
      if (game?.id === deleteId) {
        setGame(null)
      }
      setGameForm(createEmptyGameForm())
      setIsEditingGame(false)
      setEditingGameId(null)
      await refreshAll(user?.id)
      setSuccess('המשחק נמחק בהצלחה.')
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

      setPushEnabled(true)
      setSuccess('נרשמת בהצלחה לתזכורות Push.')
    } catch (requestError: unknown) {
      const errorMessage = requestError instanceof Error ? requestError.message : 'רישום ל-Push נכשל.'
      setError(errorMessage)
    } finally {
      setIsBusy(false)
    }
  }

  async function unsubscribeFromPush() {
    if (!user) {
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
      const subscription = await registration.pushManager.getSubscription()

      if (!subscription) {
        setPushEnabled(false)
        setSuccess('לא נמצאה תזכורת פעילה לביטול.')
        return
      }

      await apiRequest('/api/push/unsubscribe', {
        method: 'POST',
        body: JSON.stringify({
          userId: user.id,
          endpoint: subscription.endpoint,
        }),
      })

      await subscription.unsubscribe()
      setPushEnabled(false)
      setSuccess('תזכורות ה-Push בוטלו במכשיר הזה.')
    } catch (requestError: unknown) {
      const errorMessage = requestError instanceof Error ? requestError.message : 'ביטול תזכורת נכשל.'
      setError(errorMessage)
    } finally {
      setIsBusy(false)
    }
  }

  async function sendTestPush() {
    if (!user) {
      return
    }

    setError('')
    setSuccess('')
    setIsBusy(true)
    try {
      const response = await apiRequest<{ sent: number; failed: number }>('/api/push/test', {
        method: 'POST',
        body: JSON.stringify({ userId: user.id }),
      })
      setSuccess(`נשלחה התראת בדיקה. הצליחו: ${response.sent}, נכשלו: ${response.failed}.`)
    } catch (requestError: unknown) {
      const errorMessage = requestError instanceof Error ? requestError.message : 'שליחת בדיקת התראה נכשלה.'
      setError(errorMessage)
    } finally {
      setIsBusy(false)
    }
  }

  async function promptInstall() {
    if (!installPrompt) {
      setError('התקנה אוטומטית לא זמינה כרגע בדפדפן זה.')
      return
    }

    setError('')
    await installPrompt.prompt()
    setInstallPrompt(null)
  }

  const spotlightGame = game ?? upcomingGames[0] ?? null
  const nextGame = upcomingGames.find((item) => item.id !== spotlightGame?.id) ?? null
  const rosterGames = [spotlightGame, nextGame].filter((item): item is Game => Boolean(item))
  const isUserInGame = Boolean(user && game?.players.some((item) => item.userId === user.id))

  function deadlineCountdown(isoDeadline: string): { label: string; urgent: boolean } {
    const diffMs = new Date(isoDeadline).getTime() - nowMs
    if (diffMs <= 0) return { label: 'ההרשמה נסגרה', urgent: true }
    const totalMin = Math.floor(diffMs / 60000)
    if (totalMin < 60) return { label: `${totalMin} דקות להרשמה`, urgent: totalMin < 30 }
    const hours = Math.floor(totalMin / 60)
    const mins = totalMin % 60
    const label = mins > 0 ? `${hours} שעות ו-${mins} דקות להרשמה` : `${hours} שעות להרשמה`
    return { label, urgent: hours < 2 }
  }
  const canShowCreateForm = Boolean((user || hasAdminSession) && upcomingGames.length < maxActiveGames)
  const canShowAdminEditor = Boolean((user?.isAdmin || hasAdminSession) && upcomingGames.length)
  const isGoogleConfigured = Boolean(apiConfig?.googleClientId)
  const isSecureOriginForGoogle =
    window.isSecureContext || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  const showCreateBlock = canShowCreateForm || canShowAdminEditor

  return (
    <main className="app-shell">
      {reminderBanner && (
        <div className="reminder-banner" onClick={() => setReminderBanner(null)}>
          ⏰ {reminderBanner} <span className="reminder-close">✕</span>
        </div>
      )}
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
                onClick={() => setAuthTab('admin')}
              >
                ADMIN
              </button>
            ) : null}
          </div>

          <div className="brand-block">
            <p className="hero-kicker">Friday Hoops</p>
            <h1>ליגת שישי 3x3</h1>
            <p className="hero-subtitle">אווירת מגרש, הרשמה מהירה, ותמונת מצב ברורה לכל משחק.</p>
          </div>
        </div>

        {!user && !hasAdminSession && (
          <div className="hero-strip">
            <div>
              <strong>הרשמה חד פעמית לאפליקציה</strong>
              <p>נכנסים פעם אחת עם Google, משלימים שם פרטי ומשפחה, ומאותו רגע רק נרשמים למשחקים.</p>
            </div>
          </div>
        )}

        {user && (
          <div className="hero-strip hero-strip-compact">
            <div>
              <strong>{user.name}</strong>
              <p>{user.email}</p>
            </div>
            <button disabled={isBusy} className="cta cta-ghost" onClick={logout}>
              התנתקות
            </button>
          </div>
        )}

        {hasAdminSession && (
          <div className="hero-strip hero-strip-admin">
            <div>
              <strong>מצב אדמין פעיל</strong>
              <p>אפשר לערוך, למחוק ולהקים משחק גם בלי משתמש Google מחובר.</p>
            </div>
          </div>
        )}
      </section>

      <section className="grid">
        {!user && !hasAdminSession && authTab === 'google' && (
          <article className="card full-width card-compact">
            <div className="section-head">
              <div>
                <p className="section-kicker">Start Here</p>
                <h2>כניסה והרשמה ראשונית</h2>
              </div>
              <button type="button" className="auth-tab" onClick={() => setAuthTab('admin')}>
                מעבר ל-ADMIN
              </button>
            </div>
            <p className="muted">אחרי הכניסה הראשונה נשמור את המשתמש, ונראה כאן רק את השם וההתנתקות.</p>
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

        {!user && !hasAdminSession && authTab === 'admin' && (
          <article className="card full-width card-compact">
            <div className="section-head">
              <div>
                <p className="section-kicker">Admin Bench</p>
                <h2>כניסת אדמין</h2>
              </div>
            </div>
            <p className="muted">המסך הזה מיועד למכשיר הניהול. במצב אדמין כניסת Google מוסתרת.</p>
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

        {user && needsProfileCompletion && (
          <article className="card full-width">
            <div className="section-head">
              <div>
                <p className="section-kicker">Roster Card</p>
                <h2>השלמת פרטים אישיים</h2>
              </div>
            </div>
            <p className="muted">לפני הרשמה למשחק יש לשמור שם פרטי ושם משפחה תקינים.</p>
            <form className="input-grid" onSubmit={saveProfile}>
              <input
                required
                placeholder="שם פרטי"
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
              />
              <input
                required
                placeholder="שם משפחה"
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
              />
              <button disabled={isBusy} className="cta cta-primary" type="submit">
                שמירת פרטים
              </button>
            </form>
          </article>
        )}

        <article className="card full-width game-spotlight">
          <div className="section-head">
            <div>
              <p className="section-kicker">Tip Off</p>
              <h2>המשחק הקרוב</h2>
            </div>
            {spotlightGame && <span className={`status-badge status-${spotlightGame.status}`}>{getStatusLabel(spotlightGame.status)}</span>}
          </div>
          {spotlightGame ? (
            <>
              <div className="game-headline">
                <div>
                  <h3>{spotlightGame.title}</h3>
                  <p className="game-time">{new Date(spotlightGame.gameDate).toLocaleString('he-IL')}</p>
                </div>
                <div className="game-scoreboard">
                  <span>נרשמו</span>
                  <strong>{spotlightGame.playersCount}/12</strong>
                </div>
              </div>

              <div className="meta-grid">
                <div className="meta-pill">{spotlightGame.location || 'מיקום יעודכן'}</div>
                <div className="meta-pill">דדליין: {new Date(spotlightGame.registrationDeadline).toLocaleString('he-IL')}</div>
                <div className="meta-pill">יוצר: {spotlightGame.createdByName || 'מערכת'}</div>
              </div>

              {spotlightGame.notes && <p className="muted">{spotlightGame.notes}</p>}

              {spotlightGame.registrationDeadline && (() => {
                const { label, urgent } = deadlineCountdown(spotlightGame.registrationDeadline)
                return (
                  <p className={`countdown-pill ${urgent ? 'countdown-urgent' : ''}`}>
                    {label}
                  </p>
                )
              })()}

              {user && game && game.viewerPosition && (
                <p className="message message-ok inline-message">
                  המיקום שלך: #{game.viewerPosition} | סטטוס: {game.viewerRole === 'PLAYING' ? 'משחק' : 'המתנה'}
                </p>
              )}

              {game?.isRegistrationClosed && (
                <p className="message message-error inline-message">
                  ההרשמה נסגרה כי נותרו פחות מ-{apiConfig?.registrationLeadHours || 24} שעות לפתיחה.
                </p>
              )}

              <div className="row actions-row">
                {user && game && !isUserInGame ? (
                <button
                  disabled={isBusy || game.isRegistrationClosed || needsProfileCompletion}
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
              </div>
            </>
          ) : (
            <p className="muted">אין כרגע משחק מתוכנן. אם יש הרשאה, אפשר להקים מיד משחק חדש.</p>
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
                <p className="game-time">{new Date(nextGame.gameDate).toLocaleString('he-IL')}</p>
              </div>
              <div className="game-scoreboard game-scoreboard-small">
                <span>נרשמו</span>
                <strong>{nextGame.playersCount}/12</strong>
              </div>
            </div>
            <div className="meta-grid">
              <div className="meta-pill">{nextGame.location || 'מיקום יעודכן'}</div>
              <div className="meta-pill">דדליין: {new Date(nextGame.registrationDeadline).toLocaleString('he-IL')}</div>
            </div>
          </article>
        )}

        {user && (
          <article className="card full-width card-compact">
            <div className="section-head">
              <div>
                <p className="section-kicker">Alerts</p>
                <h2>תזכורות והתקנה</h2>
              </div>
            </div>
            <div className="row actions-row">
              <button
                disabled={isBusy || !apiConfig?.vapidPublicKey || pushEnabled}
                className="cta cta-primary"
                onClick={subscribeForPush}
              >
                הפעלת תזכורת
              </button>
              <button
                disabled={isBusy || !apiConfig?.vapidPublicKey || !pushEnabled}
                className="cta cta-soft"
                onClick={unsubscribeFromPush}
              >
                ביטול תזכורת
              </button>
              {installPrompt && (
                <button disabled={isBusy} className="cta cta-soft" onClick={promptInstall}>
                  התקנת האפליקציה
                </button>
              )}
              <button
                disabled={isBusy || !apiConfig?.vapidPublicKey}
                className="cta cta-soft"
                onClick={sendTestPush}
              >
                בדיקת התראה
              </button>
            </div>
            {!installPrompt && isIos && !isStandalone && (
              <p className="message message-ok inline-message">iPhone/iPad: לחץ על Share ואז Add to Home Screen.</p>
            )}
            {!installPrompt && !isIos && (
              <p className="muted">התקנה אוטומטית תופיע בדפדפנים תומכים, בעיקר Android/Chrome.</p>
            )}
          </article>
        )}

        {showCreateBlock && (
          <article className="card full-width">
            <div className="section-head">
              <div>
                <p className="section-kicker">Next Match Setup</p>
                <h2>{isEditingGame ? 'עריכת משחק' : 'הקמת משחק חדש'}</h2>
              </div>
            </div>
            <p className="muted">
              מציגים כאן יצירה כשהמערכת ריקה או כשקיים רק משחק עתידי אחד. גם יוצר המשחק צריך להירשם אליו בנפרד.
            </p>
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
                    עריכת {new Date(item.gameDate).toLocaleDateString('he-IL')}
                  </button>
                ))}
                {upcomingGames.map((item) => (
                  <button
                    key={`delete-${item.id}`}
                    className="cta cta-danger"
                    disabled={isBusy}
                    onClick={() => deleteGame(item.id)}
                  >
                    מחיקת {new Date(item.gameDate).toLocaleDateString('he-IL')}
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
                  <button
                    disabled={isBusy || (needsProfileCompletion && !hasAdminSession)}
                    className="cta cta-primary"
                    type="submit"
                  >
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

        {!showCreateBlock && (
          <article className="card full-width">
            <div className="section-head">
              <div>
                <p className="section-kicker">Schedule Locked</p>
                <h2>הקמת משחק חדש</h2>
              </div>
            </div>
            <p className="muted">כבר קיימים שני משחקים עתידיים. אחרי מחיקה או סיום של אחד מהם, אזור ההקמה יחזור להופיע.</p>
          </article>
        )}

        {rosterGames.map((rosterGame, index) => (
          <article key={rosterGame.id} className="card full-width roster-card">
            <div className="section-head">
              <div>
                <p className="section-kicker">{index === 0 ? 'Lineup' : 'Next Lineup'}</p>
                <h2>{index === 0 ? 'שמות הנרשמים למשחק הקרוב' : 'שמות הנרשמים למשחק הבא'}</h2>
              </div>
              <span className={`status-badge status-${rosterGame.status}`}>{getStatusLabel(rosterGame.status)}</span>
            </div>
            <p className="muted roster-meta">
              {rosterGame.title} | {new Date(rosterGame.gameDate).toLocaleString('he-IL')}
            </p>
            <ul className="players players-grid">
              {rosterGame.players.length ? (
                rosterGame.players.map((player) => (
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
                <li className="muted">עדיין אין נרשמים למשחק הזה.</li>
              )}
            </ul>
          </article>
        ))}
      </section>

      {error && <section className="message message-error">{error}</section>}
      {success && <section className="message message-ok">{success}</section>}
    </main>
  )
}

export default App
