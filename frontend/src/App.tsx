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
  status: 'pending' | 'active' | 'blocked'
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

type AppTab = 'main' | 'rules' | 'lottery' | 'instructions'

type LotteryOverviewPlayer = {
  id: number
  name: string
  benchCount: number
  isRegisteredToCurrentGame: boolean
  role: PlayerRole | null
  isOutInCurrentLottery: boolean
}

type LotteryOverviewResponse = {
  game: {
    id: number
    title: string
    gameDate: string
    registrationDeadline: string
    status: GameStatus
    playersCount: number
  } | null
  players: LotteryOverviewPlayer[]
}

type AppLanguage = 'en' | 'he' | 'fr' | 'de' | 'es' | 'ru' | 'uk' | 'hi' | 'zh'
type RegistrationRole = 'admin' | 'player'

type LocalRegistrationProfile = {
  role: RegistrationRole
  username: string
  password: string
  groupId: string
}

type LocalGroupPaymentLink = {
  id: string
  url: string
  label: string
}

type LocalGroup = {
  id: string
  name: string
  createdBy: string
  groupPasswordHash: string
  groupPasswordSalt: string
  // Legacy plaintext password kept only for one-way migration from older local data.
  groupPassword?: string
  paymentLinks?: LocalGroupPaymentLink[]
}

type LocalGameTypeConfig = {
  id: string
  name: string
  minPlayers: number
  maxPlayersX: number
  enableMaxPlayersY: boolean
  maxPlayersY: number
  lockDateTime: string
  enableLottery: boolean
  nextGameDateTime: string
  repeatWeekly: boolean
  repeatDayOfWeek: number
  repeatTime: string
}

type LocalGroupConfig = {
  groupId: string
  gameTypes: LocalGameTypeConfig[]
}

const SUPPORTED_LANGUAGES: { code: AppLanguage; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'he', label: 'עברית' },
  { code: 'fr', label: 'Francais' },
  { code: 'de', label: 'Deutsch' },
  { code: 'es', label: 'Espanol' },
  { code: 'ru', label: 'Russkiy' },
  { code: 'uk', label: 'Ukrainska' },
  { code: 'hi', label: 'Hindi' },
  { code: 'zh', label: 'Zhongwen' },
]

const RTL_LANGUAGES = new Set<AppLanguage>(['he'])
const LANGUAGE_KEY = 'come2court_language_v2'
const REGISTRATION_PROFILE_KEY = 'come2court_registration_profile_v2'
const GROUPS_KEY = 'come2court_groups_v2'
const GROUP_CONFIGS_KEY = 'come2court_group_configs_v2'
const SELECTED_GROUP_KEY = 'come2court_selected_group_v2'
const HERO_TITLE_LOOP_WORDS = ['FILL', 'THE', 'TEAM'] as const

const I18N: Record<AppLanguage, Record<string, string>> = {
  en: {
    language: 'Language',
    initialSetup: 'Initial Setup',
    chooseLanguage: 'Choose language',
    registerAs: 'Register as',
    admin: 'Organizer',
    player: 'Member',
    username: 'Username',
    password: 'Password',
    passwordConfirm: 'Confirm password',
    finishSetup: 'Finish setup',
    passwordMismatch: 'Passwords do not match.',
    passwordShort: 'Password must be at least 4 characters.',
    profileSelectTitle: 'Sign in by active members list',
    selectPlayer: 'Select member',
    playerPasswordPlaceholder: 'Password (if set)',
    playerLogin: 'Enter',
    adminLoginTitle: 'Organizer sign in',
    adminUsernamePlaceholder: 'Organizer username',
    adminPasswordPlaceholder: 'Organizer password',
    adminLoginButton: 'Sign in as organizer',
    mainTab: 'Events & Registration',
    rulesTab: 'How registration works',
    lotteryTab: 'Lottery rotation',
    instructionsTab: 'Registration guide',
    welcomeTitle: 'Welcome to Fill the Team',
    welcomeIntro: 'Fill the Team helps you manage fixed groups and handle registrations in an organized way.',
    welcomeBullet1: 'Create and manage groups with regular members.',
    welcomeBullet2: 'Register to different event types and track participation.',
    welcomeBullet3: 'Set your own event and registration rules as organizer.',
    welcomeAcknowledge: 'I read and understand',
    registrationGuideTitle: 'How to register',
    registrationGuideIntro: 'Follow these steps to complete registration quickly:',
    registrationGuideStep1: 'Choose your language first.',
    registrationGuideStep2: 'Select your role: Organizer or Member.',
    registrationGuideStep3: 'If you are Organizer create a group, if you are Member choose an existing group.',
    registrationGuideStep4: 'Enter username and password, then tap Finish setup.',
    registrationGuideClose: 'Close guide',
    groupName: 'Group name',
    groupPassword: 'Group password',
    chooseGroup: 'Choose group',
    groupNameTaken: 'Group name already exists.',
    groupNotFound: 'Group name was not found.',
    groupPasswordIncorrect: 'Group password is incorrect.',
    groupPasswordShort: 'Group password must be at least 4 characters.',
    groupUpdated: 'Group updated successfully.',
    groupDeleted: 'Group deleted successfully.',
    deleteGroup: 'Delete group',
    editGroup: 'Edit group',
    newGroupPassword: 'New group password',
    keepCurrentPassword: 'Leave empty to keep current password',
    deleteGroupConfirm: 'Are you sure you want to delete this group?',
    createGroupHint: 'Organizer creates a new group. Member joins an existing group.',
    noGroupsYet: 'No groups yet. Create a group as organizer first.',
    groupTabTitle: 'Groups',
    gameTypeTabTitle: 'Event types',
    adminAsPlayer: 'Enter as member',
    adminSetupTitle: 'Organizer event setup',
    gameTypeName: 'Event type name',
    minPlayersCount: 'Minimum participants',
    maxPlayersX: 'Max participants round 1',
    enableMaxPlayersY: 'Enable round 2',
    maxPlayersY: 'Max participants round 2',
    lockPlayersCount: 'Lock participants count',
    lockTime: 'Lock date and time',
    enableLottery: 'Enable lottery for overflow participants',
    nextGameTime: 'Next event date and time',
    weeklyRepeat: 'Repeat weekly',
    repeatDay: 'Repeat day',
    repeatTime: 'Repeat time',
    saveGameType: 'Save event type',
    addGameType: 'Add event type',
    maxThreeGameTypes: 'Up to 3 event types per group',
    addGroup: 'Add group',
    maxThreeGroups: 'Up to 3 groups',
    adminLogout: 'Exit organizer',
    signedInSession: 'Active session',
    signOut: 'Sign out',
    rulesSummaryPrefix: 'Rules',
    rulesActiveGroup: 'Active group',
    rulesActiveGameType: 'Active event type',
    rulesMinPlayers: 'Minimum participants',
    rulesMaxX: 'Maximum round 1',
    rulesMaxY: 'Maximum round 2',
    disabled: 'Disabled',
    yesLabel: 'Yes',
    noLabel: 'No',
    statusLabel: 'Status',
    playingLabel: 'Playing',
    notPlayingLabel: 'Not playing',
    onBenchThisRound: 'On bench this round',
    registeredCount: 'Registered',
    locationTbd: 'Location to be confirmed',
    registrationLock: 'Registration lock',
    registrationClosedMessagePrefix: 'Registration is closed. Lock happens one day before the game at',
    registrationClosedShort: 'Registration closed',
    joinGame: 'Join game',
    cancelRegistration: 'Cancel registration',
    noPlannedGame: 'No game is currently planned. Admin can create a new game.',
    upcomingGameTitle: 'Upcoming game',
    nextGameTitle: 'Next game',
    addToCalendar: 'Add to calendar',
    activePlayersManagement: 'Active players management',
    newPlayerNamePlaceholder: 'New player name',
    addPlayer: 'Add player',
    activeLabel: 'active',
    inactiveLabel: 'inactive',
    setPasswordPlaceholder: 'Set password',
    savePassword: 'Save password',
    deleteAction: 'Delete',
    editGameTitle: 'Edit game',
    createGameAdminOnlyTitle: 'Create new game (admin only)',
    editPrefix: 'Edit',
    deletePrefix: 'Delete',
    gameTitlePlaceholder: 'Game title',
    locationPlaceholder: 'Location',
    notesPlaceholder: 'Notes',
    saveChanges: 'Save changes',
    createGame: 'Create game',
    cancelAction: 'Cancel',
    registrationsUpcomingGame: 'Registrations for upcoming game',
    registrationsNextGame: 'Registrations for next game',
    noRegistrationsYet: 'No registrations yet for this game.',
    customRulesTitle: 'Customized rules by group and game type',
    overflowLotteryLabel: 'Overflow lottery',
    noCustomRulesYet: 'No customized rules are defined yet for this group and game type.',
    lotteryWhoOutTitle: 'Who moved to bench in lottery rounds',
    benchedLabel: 'Benched',
    timesLabel: 'times',
    benchedCurrentRound: 'Benched in current round',
    playingCurrentRound: 'Playing in current round',
    notRegisteredCurrentGame: 'Not registered for current game',
    yourPosition: 'Your position',
    adminCredentialsIncorrect: 'Admin credentials are incorrect or not configured.',
    playerMarkedInactive: 'Player marked as inactive.',
    deletePlayerFailed: 'Failed to delete player.',
    playerPasswordUpdated: 'Player password updated.',
    passwordUpdateFailed: 'Password update failed.',
    loadDataFailed: 'Failed to load data.',
    adminLoginSuccess: 'Admin login successful.',
    choosePlayerRequired: 'Please choose a player from the list.',
    selectedPlayerNotFound: 'Selected player was not found.',
    playerLoginConfirmMessage: 'After entering the app, please register for the upcoming game.',
    playerLoginSuccess: 'Login completed. Please register for the upcoming game.',
    playerLoginFailed: 'Login failed.',
    joinGameSuccess: 'Successfully joined the game.',
    joinGameFailed: 'Cannot join right now.',
    leaveGameSuccess: 'Registration cancelled.',
    leaveGameFailed: 'Cannot remove registration right now.',
    adminOnlyCreateGame: 'Only admin can create new games.',
    gameUpdatedSuccess: 'Game updated successfully.',
    gameCreatedSuccess: 'Game created successfully.',
    saveGameFailed: 'Failed to save game.',
    gameDeletedSuccess: 'Game deleted.',
    deleteGameFailed: 'Failed to delete game.',
    playerAddedSuccess: 'Player added to active list.',
    addPlayerFailed: 'Failed to add player.',
    pendingApprovalsTitle: 'Pending approvals',
    approveButton: 'Approve',
    rejectButton: 'Reject',
    blockButton: 'Block',
    noPendingUsers: 'No users pending approval.',
    noActivePlayersYet: 'No active players yet.',
    playerApprovedSuccess: 'Player approved successfully.',
    playerRejectedSuccess: 'Player rejected.',
    playerBlockedSuccess: 'Player blocked.',
    approvePlayerFailed: 'Failed to approve player.',
    rejectPlayerFailed: 'Failed to reject player.',
    blockPlayerFailed: 'Failed to block player.',
    lotteryDisabledRule: 'When lottery is disabled, no overflow lottery is applied.',
    upcomingGame: 'Upcoming event',
    noUpcomingLotteryGame: 'There is no upcoming event to display lottery results.',
    lotteryRuleNoY: 'If Y is disabled and participants > X, lottery runs across all registered members with equal rotation.',
    lotteryRuleWithY: 'If round 2 is enabled, lottery runs when participants exceed round 1 and stay below round 2, or when participants exceed round 2.',
    paymentLinksTitle: 'Payment Links',
    addPaymentLink: 'Add payment link',
    paymentLinkUrl: 'Payment link URL',
    paymentLinkLabel: 'Link label (e.g. Bit, PayPal)',
    deletePaymentLink: 'Remove link',
    noPaymentLinks: 'No payment links yet',
  },
  he: {
    language: 'שפה',
    initialSetup: 'הגדרה ראשונית',
    chooseLanguage: 'בחירת שפה',
    registerAs: 'רישום כ',
    admin: 'ארגונאי',
    player: 'חבר',
    username: 'שם משתמש',
    password: 'סיסמה',
    passwordConfirm: 'אימות סיסמה',
    finishSetup: 'סיום הגדרה',
    passwordMismatch: 'הסיסמאות אינן תואמות.',
    passwordShort: 'הסיסמה חייבת להכיל לפחות 4 תווים.',
    profileSelectTitle: 'כניסה לפי רשימת חברים פעילים',
    selectPlayer: 'בחר חבר',
    playerPasswordPlaceholder: 'סיסמה (אם קיימת)',
    playerLogin: 'אישור כניסה',
    adminLoginTitle: 'כניסת ארגונאי',
    adminUsernamePlaceholder: 'שם משתמש ארגונאי',
    adminPasswordPlaceholder: 'סיסמת ארגונאי',
    adminLoginButton: 'כניסה כארגונאי',
    mainTab: 'אירועים והרשמה',
    rulesTab: 'איך ההרשמה עובדת',
    lotteryTab: 'סבב הגרלות',
    instructionsTab: 'הוראות הרשמה',
    welcomeTitle: 'ברוכים הבאים ל-Fill the Team',
    welcomeIntro: 'Fill the Team מאפשרת לנהל קבוצות קבועות ולהתנהל בצורה מסודרת מול הרשמות לאירועים.',
    welcomeBullet1: 'יצירה וניהול של קבוצות עם חברים קבועים.',
    welcomeBullet2: 'הרשמה לסוגי אירועים שונים ומעקב אחרי היענות.',
    welcomeBullet3: 'התאמה של כללי האירוע וההרשמה לפי הצרכים שלכם.',
    welcomeAcknowledge: 'קראתי והבנתי',
    registrationGuideTitle: 'איך נרשמים',
    registrationGuideIntro: 'כך משלימים הרשמה במהירות:',
    registrationGuideStep1: 'בחרו קודם את שפת הממשק.',
    registrationGuideStep2: 'בחרו תפקיד: ארגונאי או חבר.',
    registrationGuideStep3: 'ארגונאי יוצר קבוצה חדשה, חבר מצטרף לקבוצה קיימת.',
    registrationGuideStep4: 'מלאו שם משתמש וסיסמה ולחצו על סיום הגדרה.',
    registrationGuideClose: 'סגור הוראות',
    groupName: 'שם קבוצה',
    groupPassword: 'סיסמת קבוצה',
    chooseGroup: 'בחירת קבוצה',
    groupNameTaken: 'שם קבוצה כבר קיים במערכת.',
    groupNotFound: 'שם הקבוצה לא נמצא.',
    groupPasswordIncorrect: 'סיסמת הקבוצה שגויה.',
    groupPasswordShort: 'סיסמת קבוצה חייבת להכיל לפחות 4 תווים.',
    groupUpdated: 'הקבוצה עודכנה בהצלחה.',
    groupDeleted: 'הקבוצה נמחקה בהצלחה.',
    deleteGroup: 'מחיקת קבוצה',
    editGroup: 'עריכת קבוצה',
    newGroupPassword: 'סיסמת קבוצה חדשה',
    keepCurrentPassword: 'השאירו ריק כדי לשמור על הסיסמה הנוכחית',
    deleteGroupConfirm: 'האם למחוק את הקבוצה הזו?',
    createGroupHint: 'ארגונאי יוצר קבוצה חדשה. חבר מצטרף לקבוצה קיימת.',
    noGroupsYet: 'אין קבוצות עדיין. קודם צריך ליצור קבוצה כארגונאי.',
    groupTabTitle: 'קבוצות',
    gameTypeTabTitle: 'סוגי אירוע',
    adminAsPlayer: 'כניסה כחבר',
    adminSetupTitle: 'הגדרות אירוע לארגונאי',
    gameTypeName: 'שם סוג האירוע',
    minPlayersCount: 'מספר מינימלי משתתפים',
    maxPlayersX: 'מספר מקסימלי סבב 1',
    enableMaxPlayersY: 'הפעלת סבב 2',
    maxPlayersY: 'מספר מקסימלי סבב 2',
    lockPlayersCount: 'נעילת מספר משתתפים',
    lockTime: 'זמן ותאריך נעילה',
    enableLottery: 'הפעלת הגרלה לעודפים',
    nextGameTime: 'תאריך ושעת האירוע הקרוב',
    weeklyRepeat: 'חזרה שבועית',
    repeatDay: 'יום קבוע',
    repeatTime: 'שעה קבועה',
    saveGameType: 'שמירת סוג אירוע',
    addGameType: 'הוספת סוג אירוע',
    maxThreeGameTypes: 'עד 3 סוגי אירוע לכל קבוצה',
    addGroup: 'הוספת קבוצה',
    maxThreeGroups: 'עד 3 קבוצות',
    adminLogout: 'יציאה מארגונאות',
    signedInSession: 'כניסה פעילה',
    signOut: 'התנתקות',
    rulesSummaryPrefix: 'חוקים',
    rulesActiveGroup: 'קבוצה פעילה',
    rulesActiveGameType: 'סוג משחק פעיל',
    rulesMinPlayers: 'כמות מינימלית',
    rulesMaxX: 'כמות מקסימלית סבב 1',
    rulesMaxY: 'כמות מקסימלית סבב 2',
    disabled: 'לא פעיל',
    yesLabel: 'כן',
    noLabel: 'לא',
    statusLabel: 'סטטוס',
    playingLabel: 'משחק',
    notPlayingLabel: 'לא משחק',
    onBenchThisRound: 'בחוץ בסבב',
    registeredCount: 'נרשמו',
    locationTbd: 'מיקום יעודכן',
    registrationLock: 'סגירת הרשמה',
    registrationClosedMessagePrefix: 'ההרשמה נסגרה. הנעילה מתבצעת יום לפני המשחק בשעה',
    registrationClosedShort: 'ההרשמה נסגרה',
    joinGame: 'הרשמה למשחק',
    cancelRegistration: 'ביטול הרשמה',
    noPlannedGame: 'אין כרגע משחק מתוכנן. אדמין יכול לפתוח משחק חדש.',
    upcomingGameTitle: 'המשחק הקרוב',
    nextGameTitle: 'המשחק הבא',
    addToCalendar: 'הוסף ללוח השנה',
    activePlayersManagement: 'ניהול שחקנים פעילים',
    newPlayerNamePlaceholder: 'שם שחקן חדש',
    addPlayer: 'הוספת שחקן',
    activeLabel: 'פעיל',
    inactiveLabel: 'לא פעיל',
    setPasswordPlaceholder: 'הגדר סיסמה',
    savePassword: 'שמור סיסמה',
    deleteAction: 'מחיקה',
    editGameTitle: 'עריכת משחק',
    createGameAdminOnlyTitle: 'פתיחת משחק חדש (אדמין בלבד)',
    editPrefix: 'עריכת',
    deletePrefix: 'מחיקת',
    gameTitlePlaceholder: 'כותרת המשחק',
    locationPlaceholder: 'מיקום',
    notesPlaceholder: 'הערות',
    saveChanges: 'שמירת שינויים',
    createGame: 'יצירת משחק',
    cancelAction: 'ביטול',
    registrationsUpcomingGame: 'נרשמים למשחק הקרוב',
    registrationsNextGame: 'נרשמים למשחק הבא',
    noRegistrationsYet: 'עדיין אין נרשמים למשחק הזה.',
    customRulesTitle: 'כללים מותאמים לקבוצה וסוג משחק',
    overflowLotteryLabel: 'הגרלה לעודפים',
    noCustomRulesYet: 'עדיין לא הוגדרו כללים מותאמים לקבוצה וסוג משחק.',
    lotteryWhoOutTitle: 'מי יצא בסבב ההגרלות',
    benchedLabel: 'ישב בחוץ',
    timesLabel: 'פעמים',
    benchedCurrentRound: 'בחוץ בסבב הנוכחי',
    playingCurrentRound: 'משחק בסבב הנוכחי',
    notRegisteredCurrentGame: 'לא רשום למשחק הנוכחי',
    yourPosition: 'המיקום שלך',
    adminCredentialsIncorrect: 'פרטי אדמין שגויים או לא הוגדרו.',
    playerMarkedInactive: 'השחקן סומן כלא פעיל.',
    deletePlayerFailed: 'מחיקת שחקן נכשלה.',
    playerPasswordUpdated: 'סיסמת השחקן עודכנה.',
    passwordUpdateFailed: 'עדכון סיסמה נכשל.',
    loadDataFailed: 'טעינת נתונים נכשלה.',
    adminLoginSuccess: 'כניסת אדמין הצליחה.',
    choosePlayerRequired: 'יש לבחור שחקן מהרשימה.',
    selectedPlayerNotFound: 'השחקן שנבחר לא נמצא.',
    playerLoginConfirmMessage: 'לאחר הכניסה לאפליקציה יש להירשם למשחק הקרוב',
    playerLoginSuccess: 'אחרי לחיצה על אישור יש להירשם למשחק הקרוב.',
    playerLoginFailed: 'הכניסה נכשלה.',
    joinGameSuccess: 'נרשמת בהצלחה למשחק.',
    joinGameFailed: 'לא ניתן להצטרף כרגע.',
    leaveGameSuccess: 'ביטלת הרשמה למשחק.',
    leaveGameFailed: 'לא ניתן להסיר כרגע.',
    adminOnlyCreateGame: 'רק אדמין יכול לפתוח משחקים חדשים.',
    gameUpdatedSuccess: 'המשחק עודכן בהצלחה.',
    gameCreatedSuccess: 'המשחק נוצר בהצלחה.',
    saveGameFailed: 'שמירת המשחק נכשלה.',
    gameDeletedSuccess: 'המשחק נמחק.',
    deleteGameFailed: 'מחיקת משחק נכשלה.',
    playerAddedSuccess: 'השחקן נוסף לרשימת הפעילים.',
    addPlayerFailed: 'הוספת שחקן נכשלה.',
    pendingApprovalsTitle: 'אישורים בהמתנה',
    approveButton: 'אשר',
    rejectButton: 'דחה',
    blockButton: 'חסום',
    noPendingUsers: 'אין משתמשים בהמתנה לאישור.',
    noActivePlayersYet: 'אין שחקנים פעילים עדיין.',
    playerApprovedSuccess: 'השחקן אושר בהצלחה.',
    playerRejectedSuccess: 'השחקן נדחה.',
    playerBlockedSuccess: 'השחקן חוסם.',
    approvePlayerFailed: 'אישור השחקן נכשל.',
    rejectPlayerFailed: 'דחיית השחקן נכשלה.',
    blockPlayerFailed: 'חסימת השחקן נכשלה.',
    lotteryDisabledRule: 'כאשר ההגרלה כבויה, אין הגרלה לעודפים.',
    upcomingGame: 'אירוע קרוב',
    noUpcomingLotteryGame: 'אין כרגע אירוע קרוב להצגת הגרלה.',
    lotteryRuleNoY: 'אם סבב 2 לא מסומן ומספר המשתתפים גדול מ־X, תיערך הגרלה עם רוטציה שווה בין כל הנרשמים.',
    lotteryRuleWithY: 'אם סבב 2 מסומן, ההגרלה תיערך כשמספר המשתתפים גדול מ־X וקטן מ־Y, או גדול מ־Y.',
    paymentLinksTitle: 'קישורי תשלום',
    addPaymentLink: 'הוסף קישור תשלום',
    paymentLinkUrl: 'כתובת קישור התשלום',
    paymentLinkLabel: 'תווית קישור (למשל Bit, PayPal)',
    deletePaymentLink: 'הסר קישור',
    noPaymentLinks: 'אין קישורי תשלום עדיין',
  },
  fr: {
    language: 'Langue',
    initialSetup: 'Configuration initiale',
    chooseLanguage: 'Choisir la langue',
    registerAs: 'Inscription en tant que',
    admin: 'Admin',
    player: 'Joueur',
    username: 'Nom d utilisateur',
    password: 'Mot de passe',
    passwordConfirm: 'Confirmer le mot de passe',
    finishSetup: 'Terminer',
    passwordMismatch: 'Les mots de passe ne correspondent pas.',
    passwordShort: 'Le mot de passe doit contenir au moins 4 caracteres.',
    profileSelectTitle: 'Connexion via la liste des joueurs actifs',
    selectPlayer: 'Choisir un joueur',
    playerPasswordPlaceholder: 'Mot de passe (si defini)',
    playerLogin: 'Se connecter',
    adminLoginTitle: 'Connexion admin',
    adminUsernamePlaceholder: 'Identifiant admin',
    adminPasswordPlaceholder: 'Mot de passe admin',
    adminLoginButton: 'Connexion admin',
    mainTab: 'Matchs et inscription',
    rulesTab: 'Regles d inscription',
    lotteryTab: 'Rotation du tirage',
    instructionsTab: 'Guide d inscription',
    registrationGuideTitle: 'Comment s inscrire',
    registrationGuideIntro: 'Suivez ces etapes pour terminer l inscription rapidement :',
    registrationGuideStep1: 'Choisissez d abord la langue.',
    registrationGuideStep2: 'Selectionnez votre role : Admin ou Joueur.',
    registrationGuideStep3: 'Si vous etes Admin, creez un groupe ; si vous etes Joueur, choisissez un groupe existant.',
    registrationGuideStep4: 'Saisissez nom d utilisateur et mot de passe, puis terminez la configuration.',
    registrationGuideClose: 'Fermer le guide',
    adminLogout: 'Quitter admin',
    signedInSession: 'Session active',
    signOut: 'Se deconnecter',
    rulesSummaryPrefix: 'Regles',
    rulesActiveGroup: 'Groupe actif',
    rulesActiveGameType: 'Type de match actif',
    rulesMinPlayers: 'Minimum de joueurs',
    rulesMaxX: 'Maximum X',
    rulesMaxY: 'Maximum Y',
    disabled: 'Desactive',
    yesLabel: 'Oui',
    noLabel: 'Non',
    statusLabel: 'Statut',
    playingLabel: 'Joue',
    notPlayingLabel: 'Ne joue pas',
    onBenchThisRound: 'Sur le banc ce tour',
    registeredCount: 'Inscrits',
    locationTbd: 'Lieu a confirmer',
    registrationLock: 'Cloture des inscriptions',
    registrationClosedMessagePrefix: 'Les inscriptions sont fermees. La cloture se fait la veille a',
    registrationClosedShort: 'Inscriptions fermees',
    joinGame: 'Rejoindre le match',
    cancelRegistration: 'Annuler inscription',
    noPlannedGame: 'Aucun match prevu pour le moment. Admin peut en creer un.',
    upcomingGameTitle: 'Match a venir',
    nextGameTitle: 'Match suivant',
    addToCalendar: 'Ajouter au calendrier',
    activePlayersManagement: 'Gestion des joueurs actifs',
    newPlayerNamePlaceholder: 'Nom du nouveau joueur',
    addPlayer: 'Ajouter joueur',
    activeLabel: 'actif',
    inactiveLabel: 'inactif',
    setPasswordPlaceholder: 'Definir mot de passe',
    savePassword: 'Enregistrer mot de passe',
    deleteAction: 'Supprimer',
    editGameTitle: 'Modifier match',
    createGameAdminOnlyTitle: 'Creer un nouveau match (admin seulement)',
    editPrefix: 'Modifier',
    deletePrefix: 'Supprimer',
    gameTitlePlaceholder: 'Titre du match',
    locationPlaceholder: 'Lieu',
    notesPlaceholder: 'Notes',
    saveChanges: 'Enregistrer changements',
    createGame: 'Creer match',
    cancelAction: 'Annuler',
    registrationsUpcomingGame: 'Inscriptions pour le match a venir',
    registrationsNextGame: 'Inscriptions pour le match suivant',
    noRegistrationsYet: 'Pas encore d inscriptions pour ce match.',
    customRulesTitle: 'Regles personnalisees par groupe et type de match',
    overflowLotteryLabel: 'Tirage des excedents',
    noCustomRulesYet: 'Aucune regle personnalisee definie pour ce groupe et type de match.',
    lotteryWhoOutTitle: 'Qui sort au tirage',
    benchedLabel: 'Banc',
    timesLabel: 'fois',
    benchedCurrentRound: 'Au banc ce tour',
    playingCurrentRound: 'Joue ce tour',
    notRegisteredCurrentGame: 'Non inscrit au match actuel',
    yourPosition: 'Votre position',
    adminCredentialsIncorrect: 'Identifiants admin incorrects ou non configures.',
    playerMarkedInactive: 'Joueur marque inactif.',
    deletePlayerFailed: 'Echec de suppression du joueur.',
    playerPasswordUpdated: 'Mot de passe joueur mis a jour.',
    passwordUpdateFailed: 'Echec de mise a jour du mot de passe.',
    loadDataFailed: 'Echec du chargement des donnees.',
    adminLoginSuccess: 'Connexion admin reussie.',
    choosePlayerRequired: 'Veuillez choisir un joueur dans la liste.',
    selectedPlayerNotFound: 'Joueur selectionne introuvable.',
    playerLoginConfirmMessage: 'Apres connexion, inscrivez-vous au match a venir.',
    playerLoginSuccess: 'Connexion terminee. Inscrivez-vous au match a venir.',
    playerLoginFailed: 'Connexion echouee.',
    joinGameSuccess: 'Inscription au match reussie.',
    joinGameFailed: 'Impossible de rejoindre pour le moment.',
    leaveGameSuccess: 'Inscription annulee.',
    leaveGameFailed: 'Impossible de retirer l inscription pour le moment.',
    adminOnlyCreateGame: 'Seul l admin peut creer de nouveaux matchs.',
    gameUpdatedSuccess: 'Match mis a jour avec succes.',
    gameCreatedSuccess: 'Match cree avec succes.',
    saveGameFailed: 'Echec de sauvegarde du match.',
    gameDeletedSuccess: 'Match supprime.',
    deleteGameFailed: 'Echec de suppression du match.',
    playerAddedSuccess: 'Joueur ajoute a la liste active.',
    addPlayerFailed: 'Echec d ajout du joueur.',
    pendingApprovalsTitle: 'Approbations en attente',
    approveButton: 'Approuver',
    rejectButton: 'Rejeter',
    blockButton: 'Bloquer',
    noPendingUsers: 'Aucun utilisateur en attente d approbation.',
    playerApprovedSuccess: 'Joueur approuve avec succes.',
    playerRejectedSuccess: 'Joueur rejete.',
    playerBlockedSuccess: 'Joueur bloque.',
    approvePlayerFailed: 'Echec de l approbation du joueur.',
    rejectPlayerFailed: 'Echec du rejet du joueur.',
    blockPlayerFailed: 'Echec du blocage du joueur.',
    lotteryDisabledRule: 'Si le tirage est desactive, aucun tirage d excedent ne s applique.',
    upcomingGame: 'Evenement a venir',
    noUpcomingLotteryGame: 'Aucun evenement a venir pour afficher le tirage.',
    lotteryRuleNoY: 'Si Y est desactive et participants > X, tirage sur tous les inscrits avec rotation egale.',
    lotteryRuleWithY: 'Si Y est active, tirage quand participants > X et < Y, ou quand participants > Y.',
    paymentLinksTitle: 'Liens de paiement',
    addPaymentLink: 'Ajouter lien de paiement',
    paymentLinkUrl: 'URL du lien de paiement',
    paymentLinkLabel: 'Etiquette du lien (ex. Bit, PayPal)',
    deletePaymentLink: 'Supprimer lien',
    noPaymentLinks: 'Aucun lien de paiement pour le moment',
  },
  de: {
    language: 'Sprache',
    initialSetup: 'Ersteinrichtung',
    chooseLanguage: 'Sprache wahlen',
    registerAs: 'Registrieren als',
    admin: 'Admin',
    player: 'Spieler',
    username: 'Benutzername',
    password: 'Passwort',
    passwordConfirm: 'Passwort bestatigen',
    finishSetup: 'Einrichtung abschliessen',
    passwordMismatch: 'Passworter stimmen nicht uberein.',
    passwordShort: 'Das Passwort muss mindestens 4 Zeichen haben.',
    profileSelectTitle: 'Anmeldung uber aktive Spielerliste',
    selectPlayer: 'Spieler wahlen',
    playerPasswordPlaceholder: 'Passwort (falls gesetzt)',
    playerLogin: 'Anmelden',
    adminLoginTitle: 'Admin Anmeldung',
    adminUsernamePlaceholder: 'Admin Benutzername',
    adminPasswordPlaceholder: 'Admin Passwort',
    adminLoginButton: 'Als Admin anmelden',
    mainTab: 'Spiele und Anmeldung',
    rulesTab: 'Wie die Anmeldung funktioniert',
    lotteryTab: 'Losrotation',
    instructionsTab: 'Anleitung',
    registrationGuideTitle: 'So funktioniert die Registrierung',
    registrationGuideIntro: 'Folge diesen Schritten fur eine schnelle Registrierung:',
    registrationGuideStep1: 'Wahle zuerst die Sprache.',
    registrationGuideStep2: 'Wahle deine Rolle: Admin oder Spieler.',
    registrationGuideStep3: 'Als Admin erstelle eine Gruppe, als Spieler wahle eine bestehende Gruppe.',
    registrationGuideStep4: 'Benutzername und Passwort eingeben, dann Einrichtung abschliessen.',
    registrationGuideClose: 'Anleitung schliessen',
    adminLogout: 'Admin verlassen',
    signedInSession: 'Aktive Sitzung',
    signOut: 'Abmelden',
    rulesSummaryPrefix: 'Regeln',
    rulesActiveGroup: 'Aktive Gruppe',
    rulesActiveGameType: 'Aktiver Spieltyp',
    rulesMinPlayers: 'Mindestspieler',
    rulesMaxX: 'Maximum X',
    rulesMaxY: 'Maximum Y',
    disabled: 'Deaktiviert',
    yesLabel: 'Ja',
    noLabel: 'Nein',
    statusLabel: 'Status',
    playingLabel: 'Spielt',
    notPlayingLabel: 'Spielt nicht',
    onBenchThisRound: 'Diese Runde auf der Bank',
    registeredCount: 'Registriert',
    locationTbd: 'Ort wird aktualisiert',
    registrationLock: 'Anmeldeschluss',
    registrationClosedMessagePrefix: 'Anmeldung geschlossen. Die Sperre erfolgt am Vortag um',
    registrationClosedShort: 'Anmeldung geschlossen',
    joinGame: 'Zum Spiel anmelden',
    cancelRegistration: 'Anmeldung stornieren',
    noPlannedGame: 'Derzeit ist kein Spiel geplant. Admin kann ein neues Spiel erstellen.',
    upcomingGameTitle: 'Kommendes Spiel',
    nextGameTitle: 'Naechstes Spiel',
    addToCalendar: 'Zum Kalender hinzufugen',
    activePlayersManagement: 'Verwaltung aktiver Spieler',
    newPlayerNamePlaceholder: 'Name des neuen Spielers',
    addPlayer: 'Spieler hinzufugen',
    activeLabel: 'aktiv',
    inactiveLabel: 'inaktiv',
    setPasswordPlaceholder: 'Passwort setzen',
    savePassword: 'Passwort speichern',
    deleteAction: 'Loeschen',
    editGameTitle: 'Spiel bearbeiten',
    createGameAdminOnlyTitle: 'Neues Spiel erstellen (nur Admin)',
    editPrefix: 'Bearbeiten',
    deletePrefix: 'Loeschen',
    gameTitlePlaceholder: 'Spieltitel',
    locationPlaceholder: 'Ort',
    notesPlaceholder: 'Notizen',
    saveChanges: 'Aenderungen speichern',
    createGame: 'Spiel erstellen',
    cancelAction: 'Abbrechen',
    registrationsUpcomingGame: 'Anmeldungen fuer kommendes Spiel',
    registrationsNextGame: 'Anmeldungen fuer naechstes Spiel',
    noRegistrationsYet: 'Noch keine Anmeldungen fuer dieses Spiel.',
    customRulesTitle: 'Angepasste Regeln nach Gruppe und Spieltyp',
    overflowLotteryLabel: 'Ueberlauf-Losung',
    noCustomRulesYet: 'Noch keine angepassten Regeln fuer diese Gruppe und diesen Spieltyp.',
    lotteryWhoOutTitle: 'Wer in der Losrunde raus ist',
    benchedLabel: 'Bank',
    timesLabel: 'mal',
    benchedCurrentRound: 'In aktueller Runde auf der Bank',
    playingCurrentRound: 'Spielt in aktueller Runde',
    notRegisteredCurrentGame: 'Nicht fuer aktuelles Spiel registriert',
    yourPosition: 'Deine Position',
    adminCredentialsIncorrect: 'Admin-Anmeldedaten sind falsch oder nicht konfiguriert.',
    playerMarkedInactive: 'Spieler als inaktiv markiert.',
    deletePlayerFailed: 'Loeschen des Spielers fehlgeschlagen.',
    playerPasswordUpdated: 'Spielerpasswort aktualisiert.',
    passwordUpdateFailed: 'Passwortaktualisierung fehlgeschlagen.',
    loadDataFailed: 'Daten konnten nicht geladen werden.',
    adminLoginSuccess: 'Admin-Anmeldung erfolgreich.',
    choosePlayerRequired: 'Bitte waehle einen Spieler aus der Liste.',
    selectedPlayerNotFound: 'Ausgewaehlter Spieler wurde nicht gefunden.',
    playerLoginConfirmMessage: 'Nach dem Login bitte fuer das kommende Spiel anmelden.',
    playerLoginSuccess: 'Login abgeschlossen. Bitte fuer das kommende Spiel anmelden.',
    playerLoginFailed: 'Anmeldung fehlgeschlagen.',
    joinGameSuccess: 'Erfolgreich fuer das Spiel angemeldet.',
    joinGameFailed: 'Beitritt ist derzeit nicht moeglich.',
    leaveGameSuccess: 'Anmeldung wurde storniert.',
    leaveGameFailed: 'Abmeldung ist derzeit nicht moeglich.',
    adminOnlyCreateGame: 'Nur Admin kann neue Spiele erstellen.',
    gameUpdatedSuccess: 'Spiel erfolgreich aktualisiert.',
    gameCreatedSuccess: 'Spiel erfolgreich erstellt.',
    saveGameFailed: 'Spiel konnte nicht gespeichert werden.',
    gameDeletedSuccess: 'Spiel geloescht.',
    deleteGameFailed: 'Spiel konnte nicht geloescht werden.',
    playerAddedSuccess: 'Spieler zur aktiven Liste hinzugefuegt.',
    addPlayerFailed: 'Spieler konnte nicht hinzugefuegt werden.',
    pendingApprovalsTitle: 'Ausstehende Genehmigungen',
    approveButton: 'Genehmigen',
    rejectButton: 'Ablehnen',
    blockButton: 'Sperren',
    noPendingUsers: 'Keine Benutzer warten auf Genehmigung.',
    playerApprovedSuccess: 'Spieler erfolgreich genehmigt.',
    playerRejectedSuccess: 'Spieler abgelehnt.',
    playerBlockedSuccess: 'Spieler gesperrt.',
    approvePlayerFailed: 'Spieler konnte nicht genehmigt werden.',
    rejectPlayerFailed: 'Spieler konnte nicht abgelehnt werden.',
    blockPlayerFailed: 'Spieler konnte nicht gesperrt werden.',
    lotteryDisabledRule: 'Wenn Losung deaktiviert ist, wird kein Ueberlauf gelost.',
    upcomingGame: 'Kommendes Spiel',
    noUpcomingLotteryGame: 'Kein kommendes Ereignis fuer Losanzeige.',
    lotteryRuleNoY: 'Wenn Y deaktiviert und Teilnehmer > X, Losung ueber alle Registrierten mit gleicher Rotation.',
    lotteryRuleWithY: 'Wenn Y aktiviert, Losung bei Teilnehmer > X und < Y oder bei Teilnehmer > Y.',
    paymentLinksTitle: 'Zahlungslinks',
    addPaymentLink: 'Zahlungslink hinzufuegen',
    paymentLinkUrl: 'Zahlungslink-URL',
    paymentLinkLabel: 'Link-Label (z.B. Bit, PayPal)',
    deletePaymentLink: 'Link entfernen',
    noPaymentLinks: 'Noch keine Zahlungslinks',
  },
  es: {
    language: 'Idioma',
    initialSetup: 'Configuracion inicial',
    chooseLanguage: 'Elegir idioma',
    registerAs: 'Registrar como',
    admin: 'Admin',
    player: 'Jugador',
    username: 'Nombre de usuario',
    password: 'Contrasena',
    passwordConfirm: 'Confirmar contrasena',
    finishSetup: 'Finalizar configuracion',
    passwordMismatch: 'Las contrasenas no coinciden.',
    passwordShort: 'La contrasena debe tener al menos 4 caracteres.',
    profileSelectTitle: 'Ingreso por lista de jugadores activos',
    selectPlayer: 'Seleccionar jugador',
    playerPasswordPlaceholder: 'Contrasena (si existe)',
    playerLogin: 'Entrar',
    adminLoginTitle: 'Ingreso de admin',
    adminUsernamePlaceholder: 'Usuario admin',
    adminPasswordPlaceholder: 'Contrasena admin',
    adminLoginButton: 'Ingresar como admin',
    mainTab: 'Partidos y registro',
    rulesTab: 'Como funciona el registro',
    lotteryTab: 'Rotacion de sorteo',
    instructionsTab: 'Guia de registro',
    registrationGuideTitle: 'Como registrarte',
    registrationGuideIntro: 'Sigue estos pasos para completar el registro rapidamente:',
    registrationGuideStep1: 'Primero elige el idioma.',
    registrationGuideStep2: 'Selecciona tu rol: Admin o Jugador.',
    registrationGuideStep3: 'Si eres Admin crea un grupo, si eres Jugador elige un grupo existente.',
    registrationGuideStep4: 'Ingresa usuario y contrasena y pulsa finalizar configuracion.',
    registrationGuideClose: 'Cerrar guia',
    adminLogout: 'Salir de admin',
    signedInSession: 'Sesion activa',
    signOut: 'Cerrar sesion',
    rulesSummaryPrefix: 'Reglas',
    rulesActiveGroup: 'Grupo activo',
    rulesActiveGameType: 'Tipo de juego activo',
    rulesMinPlayers: 'Jugadores minimos',
    rulesMaxX: 'Maximo X',
    rulesMaxY: 'Maximo Y',
    disabled: 'Desactivado',
    yesLabel: 'Si',
    noLabel: 'No',
    statusLabel: 'Estado',
    playingLabel: 'Jugando',
    notPlayingLabel: 'No juega',
    onBenchThisRound: 'En banco esta ronda',
    registeredCount: 'Registrados',
    locationTbd: 'Ubicacion por confirmar',
    registrationLock: 'Cierre de registro',
    registrationClosedMessagePrefix: 'El registro esta cerrado. El cierre ocurre un dia antes a las',
    registrationClosedShort: 'Registro cerrado',
    joinGame: 'Unirse al partido',
    cancelRegistration: 'Cancelar registro',
    noPlannedGame: 'No hay partido planificado. Admin puede crear uno nuevo.',
    upcomingGameTitle: 'Partido proximo',
    nextGameTitle: 'Siguiente partido',
    addToCalendar: 'Agregar al calendario',
    activePlayersManagement: 'Gestion de jugadores activos',
    newPlayerNamePlaceholder: 'Nombre del nuevo jugador',
    addPlayer: 'Agregar jugador',
    activeLabel: 'activo',
    inactiveLabel: 'inactivo',
    setPasswordPlaceholder: 'Definir contrasena',
    savePassword: 'Guardar contrasena',
    deleteAction: 'Eliminar',
    editGameTitle: 'Editar partido',
    createGameAdminOnlyTitle: 'Crear partido nuevo (solo admin)',
    editPrefix: 'Editar',
    deletePrefix: 'Eliminar',
    gameTitlePlaceholder: 'Titulo del partido',
    locationPlaceholder: 'Ubicacion',
    notesPlaceholder: 'Notas',
    saveChanges: 'Guardar cambios',
    createGame: 'Crear partido',
    cancelAction: 'Cancelar',
    registrationsUpcomingGame: 'Registros para el partido proximo',
    registrationsNextGame: 'Registros para el siguiente partido',
    noRegistrationsYet: 'Todavia no hay registros para este partido.',
    customRulesTitle: 'Reglas personalizadas por grupo y tipo de juego',
    overflowLotteryLabel: 'Sorteo de excedentes',
    noCustomRulesYet: 'Aun no hay reglas personalizadas para este grupo y tipo de juego.',
    lotteryWhoOutTitle: 'Quien quedo fuera en el sorteo',
    benchedLabel: 'En banco',
    timesLabel: 'veces',
    benchedCurrentRound: 'Fuera en ronda actual',
    playingCurrentRound: 'Jugando en ronda actual',
    notRegisteredCurrentGame: 'No registrado para el partido actual',
    yourPosition: 'Tu posicion',
    adminCredentialsIncorrect: 'Credenciales de admin incorrectas o no configuradas.',
    playerMarkedInactive: 'Jugador marcado como inactivo.',
    deletePlayerFailed: 'No se pudo eliminar al jugador.',
    playerPasswordUpdated: 'Contrasena del jugador actualizada.',
    passwordUpdateFailed: 'Error al actualizar contrasena.',
    loadDataFailed: 'No se pudieron cargar los datos.',
    adminLoginSuccess: 'Ingreso de admin exitoso.',
    choosePlayerRequired: 'Debes seleccionar un jugador de la lista.',
    selectedPlayerNotFound: 'No se encontro el jugador seleccionado.',
    playerLoginConfirmMessage: 'Despues de entrar a la app, registrate al partido proximo.',
    playerLoginSuccess: 'Ingreso completado. Registrate al partido proximo.',
    playerLoginFailed: 'Error de ingreso.',
    joinGameSuccess: 'Te registraste al partido con exito.',
    joinGameFailed: 'No se puede unir en este momento.',
    leaveGameSuccess: 'Registro cancelado.',
    leaveGameFailed: 'No se puede quitar el registro ahora.',
    adminOnlyCreateGame: 'Solo admin puede crear partidos nuevos.',
    gameUpdatedSuccess: 'Partido actualizado con exito.',
    gameCreatedSuccess: 'Partido creado con exito.',
    saveGameFailed: 'No se pudo guardar el partido.',
    gameDeletedSuccess: 'Partido eliminado.',
    deleteGameFailed: 'No se pudo eliminar el partido.',
    playerAddedSuccess: 'Jugador agregado a la lista activa.',
    addPlayerFailed: 'No se pudo agregar el jugador.',
    pendingApprovalsTitle: 'Aprobaciones pendientes',
    approveButton: 'Aprobar',
    rejectButton: 'Rechazar',
    blockButton: 'Bloquear',
    noPendingUsers: 'No hay usuarios pendientes de aprobacion.',
    playerApprovedSuccess: 'Jugador aprobado exitosamente.',
    playerRejectedSuccess: 'Jugador rechazado.',
    playerBlockedSuccess: 'Jugador bloqueado.',
    approvePlayerFailed: 'No se pudo aprobar al jugador.',
    rejectPlayerFailed: 'No se pudo rechazar al jugador.',
    blockPlayerFailed: 'No se pudo bloquear al jugador.',
    lotteryDisabledRule: 'Si el sorteo esta desactivado, no se aplica sorteo de excedentes.',
    upcomingGame: 'Evento proximo',
    noUpcomingLotteryGame: 'No hay evento proximo para mostrar sorteo.',
    lotteryRuleNoY: 'Si Y esta desactivado y participantes > X, sorteo entre todos los registrados con rotacion igual.',
    lotteryRuleWithY: 'Si Y esta activado, sorteo cuando participantes > X y < Y, o cuando participantes > Y.',
    paymentLinksTitle: 'Enlaces de pago',
    addPaymentLink: 'Agregar enlace de pago',
    paymentLinkUrl: 'URL del enlace de pago',
    paymentLinkLabel: 'Etiqueta del enlace (ej. Bit, PayPal)',
    deletePaymentLink: 'Eliminar enlace',
    noPaymentLinks: 'Sin enlaces de pago aun',
  },
  ru: {
    language: 'Yazyk',
    initialSetup: 'Pervonachalnaya nastroika',
    chooseLanguage: 'Vyberite yazyk',
    registerAs: 'Registraciya kak',
    admin: 'Admin',
    player: 'Igrok',
    username: 'Imya polzovatelya',
    password: 'Parol',
    passwordConfirm: 'Povtorite parol',
    finishSetup: 'Zavershit nastroiku',
    passwordMismatch: 'Paroli ne sovpadayut.',
    passwordShort: 'Parol dolzhen byt minimum 4 simvola.',
    profileSelectTitle: 'Vhod po spisku aktivnyh igrokov',
    selectPlayer: 'Vyberite igroka',
    playerPasswordPlaceholder: 'Parol (esli ustanovlen)',
    playerLogin: 'Voiti',
    adminLoginTitle: 'Vhod admina',
    adminUsernamePlaceholder: 'Imya admina',
    adminPasswordPlaceholder: 'Parol admina',
    adminLoginButton: 'Voiti kak admin',
    mainTab: 'Igry i registraciya',
    rulesTab: 'Kak rabotaet registraciya',
    lotteryTab: 'Rotaciya loterei',
    instructionsTab: 'Instrukciya',
    registrationGuideTitle: 'Kak zaregistrirovatsya',
    registrationGuideIntro: 'Sleduite etim shagom dlya bystroi registracii:',
    registrationGuideStep1: 'Snachala vyberite yazyk.',
    registrationGuideStep2: 'Vyberite rol: Admin ili Igrok.',
    registrationGuideStep3: 'Admin sozdaiot gruppu, igrok vybirayet suschestvuyuschuyu gruppu.',
    registrationGuideStep4: 'Vvedite imya i parol, zatem nazhmite zavershit nastroiku.',
    registrationGuideClose: 'Zakryt instrukciyu',
    adminLogout: 'Vyiti iz admin',
    signedInSession: 'Aktivnaya sessiya',
    signOut: 'Vyiti',
    rulesSummaryPrefix: 'Pravila',
    rulesActiveGroup: 'Aktivnaya gruppa',
    rulesActiveGameType: 'Aktivny tip igry',
    rulesMinPlayers: 'Minimum igrokov',
    rulesMaxX: 'Maksimum X',
    rulesMaxY: 'Maksimum Y',
    disabled: 'Otklyucheno',
    yesLabel: 'Da',
    noLabel: 'Net',
    statusLabel: 'Status',
    playingLabel: 'Igraet',
    notPlayingLabel: 'Ne igraet',
    onBenchThisRound: 'Na skameike v etom raunde',
    registeredCount: 'Zaregistrirovano',
    locationTbd: 'Mesto budet utochneno',
    registrationLock: 'Zakrytie registracii',
    registrationClosedMessagePrefix: 'Registraciya zakryta. Blokirovka za den do igry v',
    registrationClosedShort: 'Registraciya zakryta',
    joinGame: 'Zapisatsya na igru',
    cancelRegistration: 'Otmenit registraciyu',
    noPlannedGame: 'Seychas net zaplanirovannoi igry. Admin mozhet sozdat novuyu.',
    upcomingGameTitle: 'Blizhayshaya igra',
    nextGameTitle: 'Sleduyushchaya igra',
    addToCalendar: 'Dobavit v kalendar',
    activePlayersManagement: 'Upravlenie aktivnymi igrokami',
    newPlayerNamePlaceholder: 'Imya novogo igroka',
    addPlayer: 'Dobavit igroka',
    activeLabel: 'aktivnyi',
    inactiveLabel: 'neaktivnyi',
    setPasswordPlaceholder: 'Zadat parol',
    savePassword: 'Sohranit parol',
    deleteAction: 'Udalit',
    editGameTitle: 'Redaktirovat igru',
    createGameAdminOnlyTitle: 'Sozdat novuyu igru (tolko admin)',
    editPrefix: 'Redaktirovat',
    deletePrefix: 'Udalit',
    gameTitlePlaceholder: 'Nazvanie igry',
    locationPlaceholder: 'Mesto',
    notesPlaceholder: 'Zametki',
    saveChanges: 'Sohranit izmeneniya',
    createGame: 'Sozdat igru',
    cancelAction: 'Otmena',
    registrationsUpcomingGame: 'Registraciya na blizhayshuyu igru',
    registrationsNextGame: 'Registraciya na sleduyushchuyu igru',
    noRegistrationsYet: 'Poka net registracii na etu igru.',
    customRulesTitle: 'Nastroennye pravila po gruppe i tipu igry',
    overflowLotteryLabel: 'Zherebyevka dlya lishnih',
    noCustomRulesYet: 'Eshche net nastroennyh pravil dlya etoi gruppy i tipa igry.',
    lotteryWhoOutTitle: 'Kto vybyl v zherebyevke',
    benchedLabel: 'Na skameike',
    timesLabel: 'raz',
    benchedCurrentRound: 'Na skameike v tekushchem raunde',
    playingCurrentRound: 'Igraet v tekushchem raunde',
    notRegisteredCurrentGame: 'Ne zaregistrirovan na tekushchuyu igru',
    yourPosition: 'Vasha poziciya',
    adminCredentialsIncorrect: 'Dannye admin neverny ili ne nastroeny.',
    playerMarkedInactive: 'Igrok pometchen kak neaktivny.',
    deletePlayerFailed: 'Ne udalos udalit igroka.',
    playerPasswordUpdated: 'Parol igroka obnovlen.',
    passwordUpdateFailed: 'Ne udalos obnovit parol.',
    loadDataFailed: 'Ne udalos zagruzit dannye.',
    adminLoginSuccess: 'Vhod admina uspeshen.',
    choosePlayerRequired: 'Vyberite igroka iz spiska.',
    selectedPlayerNotFound: 'Vybrannyi igrok ne naiden.',
    playerLoginConfirmMessage: 'Posle vhoda zaregistriruites na blizhayshuyu igru.',
    playerLoginSuccess: 'Vhod vypolnen. Zaregistriruites na blizhayshuyu igru.',
    playerLoginFailed: 'Vhod ne udalsya.',
    joinGameSuccess: 'Vy uspeshno zaregistrirovalis na igru.',
    joinGameFailed: 'Nevozmozhno prisoyedinitsya seichas.',
    leaveGameSuccess: 'Registraciya otmenena.',
    leaveGameFailed: 'Nevozmozhno ubrat registraciyu seichas.',
    adminOnlyCreateGame: 'Tolko admin mozhet sozdavat novye igry.',
    gameUpdatedSuccess: 'Igra uspeshno obnovlena.',
    gameCreatedSuccess: 'Igra uspeshno sozdana.',
    saveGameFailed: 'Ne udalos sohranit igru.',
    gameDeletedSuccess: 'Igra udalena.',
    deleteGameFailed: 'Ne udalos udalit igru.',
    playerAddedSuccess: 'Igrok dobavlen v aktivnyi spisok.',
    addPlayerFailed: 'Ne udalos dobavit igroka.',
    pendingApprovalsTitle: 'Ozhidayushchie utverzhdeniya',
    approveButton: 'Odobriti',
    rejectButton: 'Otkloniti',
    blockButton: 'Zablokirovati',
    noPendingUsers: 'Net polzovateley, ozhidayushchikh utverzhdeniya.',
    playerApprovedSuccess: 'Igrok uspeshno odobren.',
    playerRejectedSuccess: 'Igrok otklonen.',
    playerBlockedSuccess: 'Igrok zablokirovan.',
    approvePlayerFailed: 'Ne udalos odobrit igroka.',
    rejectPlayerFailed: 'Ne udalos otkloniti igroka.',
    blockPlayerFailed: 'Ne udalos zablokirovati igroka.',
    lotteryDisabledRule: 'Esli zherebyevka otklyuchena, lishnie ne razygyrivayutsya.',
    upcomingGame: 'Blizhayshaya igra',
    noUpcomingLotteryGame: 'Net blizhayshei igry dlya pokazha zherebyevki.',
    lotteryRuleNoY: 'Esli Y otklyuchen i uchastnikov > X, zherebyevka sredi vseh registrirovannyh s ravnoi rotaciei.',
    lotteryRuleWithY: 'Esli Y vklyuchen, zherebyevka pri uchastnikah > X i < Y ili pri uchastnikah > Y.',
    paymentLinksTitle: 'Ssylki na oplatu',
    addPaymentLink: 'Dobavit ssylku',
    paymentLinkUrl: 'URL ssylki na oplatu',
    paymentLinkLabel: 'Metka ssylki (napr. Bit, PayPal)',
    deletePaymentLink: 'Udalit ssylku',
    noPaymentLinks: 'Net ssylok poka',
  },
  uk: {
    language: 'Mova',
    initialSetup: 'Pochatkove nalashtuvannya',
    chooseLanguage: 'Obraty movu',
    registerAs: 'Zareiestruvatys yak',
    admin: 'Admin',
    player: 'Gravec',
    username: 'Im ya korystuvacha',
    password: 'Parol',
    passwordConfirm: 'Pidtverdzhennia parolya',
    finishSetup: 'Zavershyty nalashtuvannya',
    passwordMismatch: 'Paroli ne zbigayutsya.',
    passwordShort: 'Parol maye mistyty shchonaymenshe 4 symvoly.',
    profileSelectTitle: 'Vkhid za spyskom aktyvnyh gravciv',
    selectPlayer: 'Vybraty gravcya',
    playerPasswordPlaceholder: 'Parol (yakshcho ye)',
    playerLogin: 'Uviyty',
    adminLoginTitle: 'Vkhid admina',
    adminUsernamePlaceholder: 'Login admina',
    adminPasswordPlaceholder: 'Parol admina',
    adminLoginButton: 'Uviyty yak admin',
    mainTab: 'Igry ta reiestraciya',
    rulesTab: 'Yak pracyuie reiestraciya',
    lotteryTab: 'Rotaciya zherebkuvannya',
    instructionsTab: 'Instrukciya',
    registrationGuideTitle: 'Yak zareiestruvatysya',
    registrationGuideIntro: 'Vykonai ce krok za krokom dlya shvydkoi reiestracii:',
    registrationGuideStep1: 'Spershu obery movu.',
    registrationGuideStep2: 'Obery rol: Admin abo Hravets.',
    registrationGuideStep3: 'Admin stvoryuie hrupu, hravets obyraye isnuyuchu hrupu.',
    registrationGuideStep4: 'Vvedy login i parol, potim natysny zavershyty nalashtuvannya.',
    registrationGuideClose: 'Zakryty instrukciyu',
    adminLogout: 'Vyity z admin',
    signedInSession: 'Aktyvna sesiia',
    signOut: 'Vyity',
    rulesSummaryPrefix: 'Pravyla',
    rulesActiveGroup: 'Aktyvna hrupa',
    rulesActiveGameType: 'Aktyvnyi typ hry',
    rulesMinPlayers: 'Minimum hravciv',
    rulesMaxX: 'Maksimum X',
    rulesMaxY: 'Maksimum Y',
    disabled: 'Vymkneno',
    yesLabel: 'Tak',
    noLabel: 'Ni',
    statusLabel: 'Status',
    playingLabel: 'Graie',
    notPlayingLabel: 'Ne graie',
    onBenchThisRound: 'Na lavi v cii rundi',
    registeredCount: 'Zareiestrovano',
    locationTbd: 'Misce utochnyuietsya',
    registrationLock: 'Zakryttia reiestracii',
    registrationClosedMessagePrefix: 'Reiestraciyu zakryto. Blokuvannya za den do gry o',
    registrationClosedShort: 'Reiestraciyu zakryto',
    joinGame: 'Zareiestruvatys na hru',
    cancelRegistration: 'Skasuvaty reiestraciyu',
    noPlannedGame: 'Nemaie zaplanovanoi hry. Admin mozhe stvoryty novu.',
    upcomingGameTitle: 'Nablyzhcha hra',
    nextGameTitle: 'Nastupna hra',
    addToCalendar: 'Dodaty v kalendar',
    activePlayersManagement: 'Keruvannya aktyvnymy hravcyamy',
    newPlayerNamePlaceholder: 'Imya novogo hravcya',
    addPlayer: 'Dodaty hravcya',
    activeLabel: 'aktyvnyi',
    inactiveLabel: 'neaktyvnyi',
    setPasswordPlaceholder: 'Vstanovyty parol',
    savePassword: 'Zberehty parol',
    deleteAction: 'Vydalyty',
    editGameTitle: 'Redahuvaty hru',
    createGameAdminOnlyTitle: 'Stvoryty novu hru (tilky admin)',
    editPrefix: 'Redahuvaty',
    deletePrefix: 'Vydalyty',
    gameTitlePlaceholder: 'Nazva hry',
    locationPlaceholder: 'Misce',
    notesPlaceholder: 'Prym itky',
    saveChanges: 'Zberehty zminy',
    createGame: 'Stvoryty hru',
    cancelAction: 'Skasuvaty',
    registrationsUpcomingGame: 'Reiestraciya na nablyzhchu hru',
    registrationsNextGame: 'Reiestraciya na nastupnu hru',
    noRegistrationsYet: 'Shche nemaie reiestracii na cyu hru.',
    customRulesTitle: 'Nalashtovani pravyla za hrupoyu ta typom hry',
    overflowLotteryLabel: 'Zherebkuvannya dlya nadlyshku',
    noCustomRulesYet: 'Shche nemaie nalashtovanyh pravyl dlya ciyeyi hrupy ta typu hry.',
    lotteryWhoOutTitle: 'Khto vyishov u zherebkuvanni',
    benchedLabel: 'Na lavi',
    timesLabel: 'raziv',
    benchedCurrentRound: 'Na lavi v potochniy rundi',
    playingCurrentRound: 'Graie v potochniy rundi',
    notRegisteredCurrentGame: 'Ne zareiestrovanyi na potochnu hru',
    yourPosition: 'Vasha pozyciya',
    adminCredentialsIncorrect: 'Dani admin nevirni abo ne nalashtovani.',
    playerMarkedInactive: 'Hravcya poznacheno yak neaktyvnogo.',
    deletePlayerFailed: 'Ne vdaloся vydalyty hravcya.',
    playerPasswordUpdated: 'Parol hravcya onovleno.',
    passwordUpdateFailed: 'Ne vdaloся onovyty parol.',
    loadDataFailed: 'Ne vdaloся zavantazhyty dani.',
    adminLoginSuccess: 'Vkhid admina uspishnyi.',
    choosePlayerRequired: 'Obyazkovo vyberit hravcya zi spysku.',
    selectedPlayerNotFound: 'Vybranogo hravcya ne znaydeno.',
    playerLoginConfirmMessage: 'Pislya vhodu v zastosunok zareiestruitesya na nablyzhchu hru.',
    playerLoginSuccess: 'Vkhid zaversheno. Zareiestruitesya na nablyzhchu hru.',
    playerLoginFailed: 'Vkhid ne vdavsya.',
    joinGameSuccess: 'Vy uspishno zareiestruvalys na hru.',
    joinGameFailed: 'Nemozhlyvo pryednatysya zaraz.',
    leaveGameSuccess: 'Reiestraciyu skasovano.',
    leaveGameFailed: 'Nemozhlyvo prybraty reiestraciyu zaraz.',
    adminOnlyCreateGame: 'Lyshe admin mozhe stvoryuvaty novi igry.',
    gameUpdatedSuccess: 'Hru uspishno onovleno.',
    gameCreatedSuccess: 'Hru uspishno stvoreno.',
    saveGameFailed: 'Ne vdaloся zberehty hru.',
    gameDeletedSuccess: 'Hru vydaleno.',
    deleteGameFailed: 'Ne vdaloся vydalyty hru.',
    playerAddedSuccess: 'Hravcya dodano do aktyvnogo spysku.',
    addPlayerFailed: 'Ne vdaloся dodaty hravcya.',
    pendingApprovalsTitle: 'Ochikuvani zatverdzhennya',
    approveButton: 'Zatverdjyty',
    rejectButton: 'Vidkhylyty',
    blockButton: 'Zablokvuvaty',
    noPendingUsers: 'Nema korystuvachiv, yaki chekayut na zatverdzhennya.',
    playerApprovedSuccess: 'Hravets uspishno zatverdzhen.',
    playerRejectedSuccess: 'Hravets vidkhylen.',
    playerBlockedSuccess: 'Hravets zablokovan.',
    approvePlayerFailed: 'Ne vdaloся zatverdjyty hravcya.',
    rejectPlayerFailed: 'Ne vdaloся vidkhylyty hravcya.',
    blockPlayerFailed: 'Ne vdaloся zablokvuvaty hravcya.',
    lotteryDisabledRule: 'Yakshcho zherebkuvannya vymkneno, dlya nadlyshku ne vykonuyetsya rozigrash.',
    upcomingGame: 'Nablyzhcha podiya',
    noUpcomingLotteryGame: 'Nemaie nablyzhchoi podiyi dlya pokazhu zherebkuvannya.',
    lotteryRuleNoY: 'Yakshcho Y vymkneno ta uchasnykiv > X, zherebkuvannya sered usih zareiestrovanyh z rivnoyu rotaciyeyu.',
    lotteryRuleWithY: 'Yakshcho Y vimkneno, zherebkuvannya pry uchasnykyh > X i < Y, abo pry uchasnykyh > Y.',
    paymentLinksTitle: 'Posilannya na oplatu',
    addPaymentLink: 'Dodaty posilannya',
    paymentLinkUrl: 'URL posilannya na oplatu',
    paymentLinkLabel: 'Marka posilannya (napr. Bit, PayPal)',
    deletePaymentLink: 'Vydalyty posilannya',
    noPaymentLinks: 'Posilannya poki scho nemaye',
  },
  hi: {
    language: 'Bhasha',
    initialSetup: 'Prarambhik setup',
    chooseLanguage: 'Bhasha chunen',
    registerAs: 'Is roop me register karen',
    admin: 'Admin',
    player: 'Player',
    username: 'Username',
    password: 'Password',
    passwordConfirm: 'Password dobara likhen',
    finishSetup: 'Setup poora karen',
    passwordMismatch: 'Passwords match nahi karte.',
    passwordShort: 'Password kam se kam 4 characters ka hona chahiye.',
    profileSelectTitle: 'Active players list se login',
    selectPlayer: 'Player chunen',
    playerPasswordPlaceholder: 'Password (agar set hai)',
    playerLogin: 'Login',
    adminLoginTitle: 'Admin login',
    adminUsernamePlaceholder: 'Admin username',
    adminPasswordPlaceholder: 'Admin password',
    adminLoginButton: 'Admin ke roop me login',
    mainTab: 'Games aur registration',
    rulesTab: 'Registration kaise kaam karta hai',
    lotteryTab: 'Lottery rotation',
    instructionsTab: 'Registration guide',
    registrationGuideTitle: 'Registration kaise karein',
    registrationGuideIntro: 'Registration jaldi complete karne ke liye ye steps follow karein:',
    registrationGuideStep1: 'Sabse pehle language choose karein.',
    registrationGuideStep2: 'Apna role select karein: Admin ya Player.',
    registrationGuideStep3: 'Admin naya group banaye, Player existing group choose kare.',
    registrationGuideStep4: 'Username aur password dal kar Finish setup dabayein.',
    registrationGuideClose: 'Guide band karein',
    adminLogout: 'Admin se bahar niklen',
    signedInSession: 'Sakriya session',
    signOut: 'Sign out',
    rulesSummaryPrefix: 'Rules',
    rulesActiveGroup: 'Active group',
    rulesActiveGameType: 'Active game type',
    rulesMinPlayers: 'Minimum players',
    rulesMaxX: 'Maximum X',
    rulesMaxY: 'Maximum Y',
    disabled: 'Band',
    yesLabel: 'Haan',
    noLabel: 'Nahi',
    statusLabel: 'Status',
    playingLabel: 'Khel raha hai',
    notPlayingLabel: 'Khel nahin raha',
    onBenchThisRound: 'Is round bench par',
    registeredCount: 'Registered',
    locationTbd: 'Location baad me update hoga',
    registrationLock: 'Registration lock',
    registrationClosedMessagePrefix: 'Registration band hai. Lock game se ek din pehle',
    registrationClosedShort: 'Registration band',
    joinGame: 'Game join karen',
    cancelRegistration: 'Registration cancel karen',
    noPlannedGame: 'Abhi koi game plan nahin hai. Admin naya game bana sakta hai.',
    upcomingGameTitle: 'Aane wala game',
    nextGameTitle: 'Agla game',
    addToCalendar: 'Calendar me joden',
    activePlayersManagement: 'Active players management',
    newPlayerNamePlaceholder: 'Naye player ka naam',
    addPlayer: 'Player joden',
    activeLabel: 'active',
    inactiveLabel: 'inactive',
    setPasswordPlaceholder: 'Password set karen',
    savePassword: 'Password save karen',
    deleteAction: 'Delete',
    editGameTitle: 'Game edit karen',
    createGameAdminOnlyTitle: 'Naya game banaye (sirf admin)',
    editPrefix: 'Edit',
    deletePrefix: 'Delete',
    gameTitlePlaceholder: 'Game title',
    locationPlaceholder: 'Location',
    notesPlaceholder: 'Notes',
    saveChanges: 'Changes save karen',
    createGame: 'Game banaye',
    cancelAction: 'Cancel',
    registrationsUpcomingGame: 'Aane wale game ke registrations',
    registrationsNextGame: 'Agla game registrations',
    noRegistrationsYet: 'Is game ke liye abhi registrations nahin hain.',
    customRulesTitle: 'Group aur game type ke hisab se custom rules',
    overflowLotteryLabel: 'Overflow lottery',
    noCustomRulesYet: 'Is group aur game type ke liye abhi custom rules nahin hain.',
    lotteryWhoOutTitle: 'Lottery rounds me kaun bahar gaya',
    benchedLabel: 'Bench',
    timesLabel: 'baar',
    benchedCurrentRound: 'Is round bench par',
    playingCurrentRound: 'Is round khel raha hai',
    notRegisteredCurrentGame: 'Current game ke liye registered nahin',
    yourPosition: 'Aapki position',
    adminCredentialsIncorrect: 'Admin credentials galat hain ya set nahin hain.',
    playerMarkedInactive: 'Player ko inactive mark kiya gaya.',
    deletePlayerFailed: 'Player delete nahin ho paya.',
    playerPasswordUpdated: 'Player password update ho gaya.',
    passwordUpdateFailed: 'Password update fail ho gaya.',
    loadDataFailed: 'Data load nahin ho paya.',
    adminLoginSuccess: 'Admin login safal hua.',
    choosePlayerRequired: 'List se player chunna zaruri hai.',
    selectedPlayerNotFound: 'Chuna gaya player nahin mila.',
    playerLoginConfirmMessage: 'App me aane ke baad aane wale game ke liye register karein.',
    playerLoginSuccess: 'Login ho gaya. Kripya aane wale game ke liye register karein.',
    playerLoginFailed: 'Login fail ho gaya.',
    joinGameSuccess: 'Aap game me safalta se register ho gaye.',
    joinGameFailed: 'Abhi join nahin kar sakte.',
    leaveGameSuccess: 'Registration cancel ho gayi.',
    leaveGameFailed: 'Abhi registration hata nahin sakte.',
    adminOnlyCreateGame: 'Naye game sirf admin bana sakta hai.',
    gameUpdatedSuccess: 'Game safalta se update hua.',
    gameCreatedSuccess: 'Game safalta se bana.',
    saveGameFailed: 'Game save nahin hua.',
    gameDeletedSuccess: 'Game delete ho gaya.',
    deleteGameFailed: 'Game delete nahin hua.',
    playerAddedSuccess: 'Player active list me add ho gaya.',
    addPlayerFailed: 'Player add nahin ho paya.',
    pendingApprovalsTitle: 'Manjar hone wali swikriti',
    approveButton: 'Swikar karen',
    rejectButton: 'Atkaro',
    blockButton: 'Band karen',
    noPendingUsers: 'Koi bhi user swikriti ke liye manjar nahin hai.',
    playerApprovedSuccess: 'Player safalta se swikar ho gaya.',
    playerRejectedSuccess: 'Player atkaar diya gaya.',
    playerBlockedSuccess: 'Player band kar diya gaya.',
    approvePlayerFailed: 'Player ko swikar karne me nakam.',
    rejectPlayerFailed: 'Player ko atkarne me nakam.',
    blockPlayerFailed: 'Player ko band karne me nakam.',
    lotteryDisabledRule: 'Lottery band hone par overflow lottery apply nahin hoti.',
    upcomingGame: 'Aane wala event',
    noUpcomingLotteryGame: 'Lottery dikhane ke liye koi aane wala event nahin hai.',
    lotteryRuleNoY: 'Agar Y band hai aur participants > X, to sab registered members me equal rotation lottery chalegi.',
    lotteryRuleWithY: 'Agar Y on hai, to lottery participants > X aur < Y par, ya participants > Y par chalegi.',
    paymentLinksTitle: 'Payment links',
    addPaymentLink: 'Add payment link',
    paymentLinkUrl: 'Payment link URL',
    paymentLinkLabel: 'Link label (e.g. Bit, PayPal)',
    deletePaymentLink: 'Remove link',
    noPaymentLinks: 'No payment links yet',
  },
  zh: {
    language: 'Language',
    initialSetup: 'Initial setup',
    chooseLanguage: 'Choose language',
    registerAs: 'Register as',
    admin: 'Admin',
    player: 'Player',
    username: 'Username',
    password: 'Password',
    passwordConfirm: 'Confirm password',
    finishSetup: 'Finish setup',
    passwordMismatch: 'Passwords do not match.',
    passwordShort: 'Password must be at least 4 characters.',
    profileSelectTitle: 'Sign in by active players list',
    selectPlayer: 'Select player',
    playerPasswordPlaceholder: 'Password (if set)',
    playerLogin: 'Enter',
    adminLoginTitle: 'Admin sign in',
    adminUsernamePlaceholder: 'Admin username',
    adminPasswordPlaceholder: 'Admin password',
    adminLoginButton: 'Sign in as admin',
    mainTab: 'Games and registration',
    rulesTab: 'How registration works',
    lotteryTab: 'Lottery rotation',
    instructionsTab: 'Registration guide',
    registrationGuideTitle: 'How to register',
    registrationGuideIntro: 'Follow these steps to complete registration quickly:',
    registrationGuideStep1: 'Choose your language first.',
    registrationGuideStep2: 'Select your role: Admin or Player.',
    registrationGuideStep3: 'If you are Admin create a group, if you are Player choose an existing group.',
    registrationGuideStep4: 'Enter username and password, then tap Finish setup.',
    registrationGuideClose: 'Close guide',
    adminLogout: 'Exit admin',
    signedInSession: 'Active session',
    signOut: 'Sign out',
    rulesSummaryPrefix: 'Rules',
    rulesActiveGroup: 'Active group',
    rulesActiveGameType: 'Active game type',
    rulesMinPlayers: 'Minimum players',
    rulesMaxX: 'Maximum X',
    rulesMaxY: 'Maximum Y',
    disabled: 'Disabled',
    yesLabel: 'Yes',
    noLabel: 'No',
    statusLabel: 'Status',
    playingLabel: 'Playing',
    notPlayingLabel: 'Not playing',
    onBenchThisRound: 'On bench this round',
    registeredCount: 'Registered',
    locationTbd: 'Location to be confirmed',
    registrationLock: 'Registration lock',
    registrationClosedMessagePrefix: 'Registration is closed. Lock happens one day before the game at',
    registrationClosedShort: 'Registration closed',
    joinGame: 'Join game',
    cancelRegistration: 'Cancel registration',
    noPlannedGame: 'No game is currently planned. Admin can create a new game.',
    upcomingGameTitle: 'Upcoming game',
    nextGameTitle: 'Next game',
    addToCalendar: 'Add to calendar',
    activePlayersManagement: 'Active players management',
    newPlayerNamePlaceholder: 'New player name',
    addPlayer: 'Add player',
    activeLabel: 'active',
    inactiveLabel: 'inactive',
    setPasswordPlaceholder: 'Set password',
    savePassword: 'Save password',
    deleteAction: 'Delete',
    editGameTitle: 'Edit game',
    createGameAdminOnlyTitle: 'Create new game (admin only)',
    editPrefix: 'Edit',
    deletePrefix: 'Delete',
    gameTitlePlaceholder: 'Game title',
    locationPlaceholder: 'Location',
    notesPlaceholder: 'Notes',
    saveChanges: 'Save changes',
    createGame: 'Create game',
    cancelAction: 'Cancel',
    registrationsUpcomingGame: 'Registrations for upcoming game',
    registrationsNextGame: 'Registrations for next game',
    noRegistrationsYet: 'No registrations yet for this game.',
    customRulesTitle: 'Customized rules by group and game type',
    overflowLotteryLabel: 'Overflow lottery',
    noCustomRulesYet: 'No customized rules are defined yet for this group and game type.',
    lotteryWhoOutTitle: 'Who moved to bench in lottery rounds',
    benchedLabel: 'Benched',
    timesLabel: 'times',
    benchedCurrentRound: 'Benched in current round',
    playingCurrentRound: 'Playing in current round',
    notRegisteredCurrentGame: 'Not registered for current game',
    yourPosition: 'Your position',
    adminCredentialsIncorrect: 'Admin credentials are incorrect or not configured.',
    playerMarkedInactive: 'Player marked as inactive.',
    deletePlayerFailed: 'Failed to delete player.',
    playerPasswordUpdated: 'Player password updated.',
    passwordUpdateFailed: 'Password update failed.',
    loadDataFailed: 'Failed to load data.',
    adminLoginSuccess: 'Admin login successful.',
    choosePlayerRequired: 'Please choose a player from the list.',
    selectedPlayerNotFound: 'Selected player was not found.',
    playerLoginConfirmMessage: 'After entering the app, please register for the upcoming game.',
    playerLoginSuccess: 'Login completed. Please register for the upcoming game.',
    playerLoginFailed: 'Login failed.',
    joinGameSuccess: 'Successfully joined the game.',
    joinGameFailed: 'Cannot join right now.',
    leaveGameSuccess: 'Registration cancelled.',
    leaveGameFailed: 'Cannot remove registration right now.',
    adminOnlyCreateGame: 'Only admin can create new games.',
    gameUpdatedSuccess: 'Game updated successfully.',
    gameCreatedSuccess: 'Game created successfully.',
    saveGameFailed: 'Failed to save game.',
    gameDeletedSuccess: 'Game deleted.',
    deleteGameFailed: 'Failed to delete game.',
    playerAddedSuccess: 'Player added to active list.',
    addPlayerFailed: 'Failed to add player.',
    pendingApprovalsTitle: 'Pending approvals',
    approveButton: 'Approve',
    rejectButton: 'Reject',
    blockButton: 'Block',
    noPendingUsers: 'No users pending approval.',
    playerApprovedSuccess: 'Player approved successfully.',
    playerRejectedSuccess: 'Player rejected.',
    playerBlockedSuccess: 'Player blocked.',
    approvePlayerFailed: 'Failed to approve player.',
    rejectPlayerFailed: 'Failed to reject player.',
    blockPlayerFailed: 'Failed to block player.',
    lotteryDisabledRule: 'When lottery is disabled, no overflow lottery is applied.',
    upcomingGame: 'Upcoming event',
    noUpcomingLotteryGame: 'There is no upcoming event to display lottery results.',
    lotteryRuleNoY: 'If Y is disabled and participants > X, lottery runs across all registered participants with equal rotation.',
    lotteryRuleWithY: 'If round 2 is enabled, lottery runs when participants exceed round 1 and stay below round 2, or when participants exceed round 2.',
    paymentLinksTitle: 'Payment links',
    addPaymentLink: 'Add payment link',
    paymentLinkUrl: 'Payment link URL',
    paymentLinkLabel: 'Link label (e.g. Bit, PayPal)',
    deletePaymentLink: 'Remove link',
    noPaymentLinks: 'No payment links yet',
  },
}

const GROUP_PASSWORD_SALT_BYTES = 16

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function createRandomSaltHex(): string {
  const bytes = new Uint8Array(GROUP_PASSWORD_SALT_BYTES)
  crypto.getRandomValues(bytes)
  return bytesToHex(bytes)
}

async function hashGroupPassword(password: string, saltHex: string): Promise<string> {
  const payload = new TextEncoder().encode(`${saltHex}:${password}`)
  const digest = await crypto.subtle.digest('SHA-256', payload)
  return bytesToHex(new Uint8Array(digest))
}

async function verifyGroupPassword(group: LocalGroup, plainPassword: string): Promise<boolean> {
  const password = plainPassword.trim()
  if (!password) return false

  if (group.groupPasswordHash && group.groupPasswordSalt) {
    const computedHash = await hashGroupPassword(password, group.groupPasswordSalt)
    return computedHash === group.groupPasswordHash
  }

  return String(group.groupPassword || '').trim() === password
}

function readStoredLanguage(): AppLanguage {
  try {
    const saved = String(localStorage.getItem(LANGUAGE_KEY) || '').trim() as AppLanguage
    if (SUPPORTED_LANGUAGES.some((entry) => entry.code === saved)) {
      return saved
    }
  } catch (_error) {
    // Ignore storage issues.
  }
  return 'en'
}

function writeStoredLanguage(language: AppLanguage) {
  try {
    localStorage.setItem(LANGUAGE_KEY, language)
  } catch (_error) {
    // Ignore storage issues.
  }
}

function readRegistrationProfile(): LocalRegistrationProfile | null {
  try {
    const raw = localStorage.getItem(REGISTRATION_PROFILE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as LocalRegistrationProfile
    if (!parsed || !parsed.role || !parsed.username || !parsed.password || !parsed.groupId) {
      return null
    }
    if (parsed.role !== 'admin' && parsed.role !== 'player') {
      return null
    }
    return parsed
  } catch (_error) {
    return null
  }
}

function writeRegistrationProfile(profile: LocalRegistrationProfile) {
  try {
    localStorage.setItem(REGISTRATION_PROFILE_KEY, JSON.stringify(profile))
  } catch (_error) {
    // Ignore storage issues.
  }
}

function clearRegistrationProfile() {
  try {
    localStorage.removeItem(REGISTRATION_PROFILE_KEY)
  } catch (_error) {
    // Ignore storage issues.
  }
}

function readGroups(): LocalGroup[] {
  try {
    const raw = localStorage.getItem(GROUPS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as Array<Partial<LocalGroup>>
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((group) => Boolean(group?.id && group?.name))
      .map((group) => ({
        id: String(group.id || ''),
        name: String(group.name || '').trim(),
        createdBy: String(group.createdBy || '').trim(),
        groupPasswordHash: String(group.groupPasswordHash || '').trim(),
        groupPasswordSalt: String(group.groupPasswordSalt || '').trim(),
        groupPassword: String(group.groupPassword || '').trim(),
        paymentLinks: Array.isArray(group.paymentLinks) ? group.paymentLinks.map((link: any, index: number) => ({
          id: link?.id || `link-${Date.now()}-${index}`,
          url: String(link?.url || '').trim(),
          label: String(link?.label || '').trim(),
        })) : [],
      }))
  } catch (_error) {
    return []
  }
}

function writeGroups(groups: LocalGroup[]) {
  try {
    localStorage.setItem(GROUPS_KEY, JSON.stringify(groups))
  } catch (_error) {
    // Ignore storage issues.
  }
}

function readGroupConfigs(): LocalGroupConfig[] {
  try {
    const raw = localStorage.getItem(GROUP_CONFIGS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as LocalGroupConfig[]
    if (!Array.isArray(parsed)) return []
    return parsed.filter((entry) => Boolean(entry?.groupId && Array.isArray(entry.gameTypes)))
  } catch (_error) {
    return []
  }
}

function writeGroupConfigs(configs: LocalGroupConfig[]) {
  try {
    localStorage.setItem(GROUP_CONFIGS_KEY, JSON.stringify(configs))
  } catch (_error) {
    // Ignore storage issues.
  }
}

function readSelectedGroupId(): string {
  try {
    return String(localStorage.getItem(SELECTED_GROUP_KEY) || '')
  } catch (_error) {
    return ''
  }
}

function writeSelectedGroupId(groupId: string) {
  try {
    localStorage.setItem(SELECTED_GROUP_KEY, groupId)
  } catch (_error) {
    // Ignore storage issues.
  }
}

function createDefaultGameTypeConfig(): LocalGameTypeConfig {
  const now = new Date()
  const defaultNextGame = new Date(now)
  defaultNextGame.setDate(now.getDate() + 7)
  defaultNextGame.setHours(19, 0, 0, 0)

  const defaultLock = new Date(defaultNextGame)
  defaultLock.setDate(defaultLock.getDate() - 1)
  defaultLock.setHours(20, 0, 0, 0)

  return {
    id: `type-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
    name: 'Open Match',
    minPlayers: 6,
    maxPlayersX: 12,
    enableMaxPlayersY: false,
    maxPlayersY: 16,
    lockDateTime: toLocalDateTimeInput(defaultLock.toISOString()),
    enableLottery: true,
    nextGameDateTime: toLocalDateTimeInput(defaultNextGame.toISOString()),
    repeatWeekly: false,
    repeatDayOfWeek: 5,
    repeatTime: '19:00',
  }
}

const configuredApiBase = String(import.meta.env.VITE_API_BASE_URL || '').trim()
const API_BASE = configuredApiBase ? configuredApiBase.replace(/\/$/, '') : ''
const USER_ID_KEY = 'come2court_user_id_v2'
const ADMIN_TOKEN_KEY = 'come2court_admin_token_v2'

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
      return 'Open'
    case 'CONFIRMED':
      return 'Confirmed'
    case 'WAITING':
      return 'Waiting'
    case 'LOCKED':
      return 'Locked'
    case 'CANCELLED':
      return 'Cancelled'
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
    title: 'Come 2 Court Game',
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
    text: game.title || 'Come 2 Court game',
    dates: `${formatTime(startTime)}/${formatTime(endTime)}`,
    location: game.location || '',
    description: game.notes || 'Come 2 Court game',
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
    const message = (payload as { message?: string })?.message || 'Server request failed.'
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
      <p className="intro-title">Come 2 Court</p>
    </div>
  )
}

function App() {
  const [language, setLanguage] = useState<AppLanguage>(() => readStoredLanguage())
  const [registrationProfile, setRegistrationProfile] = useState<LocalRegistrationProfile | null>(() =>
    readRegistrationProfile()
  )
  const [groups, setGroups] = useState<LocalGroup[]>(() => readGroups())
  const [groupConfigs, setGroupConfigs] = useState<LocalGroupConfig[]>(() => readGroupConfigs())
  const [selectedGroupId, setSelectedGroupId] = useState<string>(() => readSelectedGroupId())
  const [onboardingRole, setOnboardingRole] = useState<RegistrationRole>('player')
  const [onboardingGroupName, setOnboardingGroupName] = useState('')
  const [onboardingGroupPassword, setOnboardingGroupPassword] = useState('')
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupPassword, setNewGroupPassword] = useState('')
  const [editingGroupName, setEditingGroupName] = useState('')
  const [editingGroupPassword, setEditingGroupPassword] = useState('')
  const [paymentLinkUrl, setPaymentLinkUrl] = useState('')
  const [paymentLinkLabel, setPaymentLinkLabel] = useState('')
  const [onboardingUsername, setOnboardingUsername] = useState('')
  const [onboardingPassword, setOnboardingPassword] = useState('')
  const [onboardingPasswordConfirm, setOnboardingPasswordConfirm] = useState('')
  const [onboardingError, setOnboardingError] = useState('')

  const [user, setUser] = useState<User | null>(null)
  const [game, setGame] = useState<Game | null>(null)
  const [upcomingGames, setUpcomingGames] = useState<Game[]>([])
  const [maxActiveGames, setMaxActiveGames] = useState(2)
  const [apiConfig, setApiConfig] = useState<ApiConfig | null>(null)
  const [playerOptions, setPlayerOptions] = useState<PlayerOption[]>([])
  const [adminPlayers, setAdminPlayers] = useState<AdminPlayer[]>([])
  const [selectedPlayerId, setSelectedPlayerId] = useState<number | null>(null)
  const [playerPassword, setPlayerPassword] = useState('')
  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [showIntro, setShowIntro] = useState(true)
  const [showWelcomeGuide, setShowWelcomeGuide] = useState(true)
  const [showRegistrationGuide, setShowRegistrationGuide] = useState(false)
  const [heroTitleWordIndex, setHeroTitleWordIndex] = useState(0)
  const [gameForm, setGameForm] = useState<GameFormState>(() => createEmptyGameForm())
  const [isEditingGame, setIsEditingGame] = useState(false)
  const [editingGameId, setEditingGameId] = useState<number | null>(null)
  const [adminUsername, setAdminUsername] = useState('gilad')
  const [adminPassword, setAdminPassword] = useState('')
  const [adminToken, setAdminToken] = useState<string>(() => readStoredAdminToken())
  const [authTab, setAuthTab] = useState<'player' | 'admin'>('player')
  const [activeTab, setActiveTab] = useState<AppTab>('main')
  const [lotteryOverview, setLotteryOverview] = useState<LotteryOverviewResponse | null>(null)
  const [selectedGameTypeId, setSelectedGameTypeId] = useState('')
  const [editingGameType, setEditingGameType] = useState<LocalGameTypeConfig>(() => createDefaultGameTypeConfig())

  const text = I18N[language] || I18N.en
  const translate = (key: string) => text[key] || I18N.en[key] || key
  const isOnboardingOpen = !registrationProfile || !selectedGroupId
  const currentHeroWord = HERO_TITLE_LOOP_WORDS[heroTitleWordIndex]
  const registrationGuideSteps = [
    translate('registrationGuideStep1'),
    translate('registrationGuideStep2'),
    translate('registrationGuideStep3'),
    translate('registrationGuideStep4'),
  ]
  const welcomeGuideBullets = [
    translate('welcomeBullet1'),
    translate('welcomeBullet2'),
    translate('welcomeBullet3'),
  ]

  const registeredUserId = useMemo(() => readStoredUserId(), [])
  const hasAdminSession = Boolean(adminToken)
  const selectedGroup = groups.find((group) => group.id === selectedGroupId) || null
  const selectedGroupConfig = groupConfigs.find((entry) => entry.groupId === selectedGroupId) || null
  const selectedGameType = selectedGroupConfig?.gameTypes.find((entry) => entry.id === selectedGameTypeId) || null

  useEffect(() => {
    document.documentElement.lang = language
    document.documentElement.dir = RTL_LANGUAGES.has(language) ? 'rtl' : 'ltr'
  }, [language])

  useEffect(() => {
    if (!registrationProfile) return
    setAuthTab(registrationProfile.role)
    setSelectedGroupId(registrationProfile.groupId)
    if (registrationProfile.role === 'admin') {
      setAdminUsername(registrationProfile.username)
      setAdminPassword(registrationProfile.password)
    }
  }, [registrationProfile])

  useEffect(() => {
    writeGroups(groups)
  }, [groups])

  useEffect(() => {
    let isCancelled = false

    async function migrateLegacyGroupPasswords() {
      const hasLegacyPasswords = groups.some((group) => !group.groupPasswordHash && Boolean(group.groupPassword))
      if (!hasLegacyPasswords) return

      const migrated = await Promise.all(
        groups.map(async (group) => {
          if (group.groupPasswordHash || !group.groupPassword) {
            return group
          }

          const groupPasswordSalt = createRandomSaltHex()
          const groupPasswordHash = await hashGroupPassword(group.groupPassword, groupPasswordSalt)
          return {
            ...group,
            groupPasswordHash,
            groupPasswordSalt,
            groupPassword: '',
          }
        })
      )

      if (!isCancelled) {
        setGroups(migrated)
      }
    }

    void migrateLegacyGroupPasswords()

    return () => {
      isCancelled = true
    }
  }, [groups])

  useEffect(() => {
    writeGroupConfigs(groupConfigs)
  }, [groupConfigs])

  useEffect(() => {
    if (!selectedGroup) {
      setEditingGroupName('')
      setEditingGroupPassword('')
      return
    }

    setEditingGroupName(selectedGroup.name)
    setEditingGroupPassword('')
  }, [selectedGroup])

  useEffect(() => {
    if (!selectedGroupId && groups.length) {
      setSelectedGroupId(groups[0].id)
      return
    }

    if (selectedGroupId && !groups.some((group) => group.id === selectedGroupId)) {
      setSelectedGroupId(groups[0]?.id || '')
    }
  }, [groups, selectedGroupId])

  useEffect(() => {
    writeSelectedGroupId(selectedGroupId)
  }, [selectedGroupId])

  useEffect(() => {
    const firstType = selectedGroupConfig?.gameTypes[0]
    if (!firstType) {
      setSelectedGameTypeId('')
      setEditingGameType(createDefaultGameTypeConfig())
      return
    }

    if (!selectedGameTypeId || !selectedGroupConfig?.gameTypes.some((item) => item.id === selectedGameTypeId)) {
      setSelectedGameTypeId(firstType.id)
      setEditingGameType(firstType)
    }
  }, [selectedGroupConfig, selectedGameTypeId])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setShowIntro(false), 2200)
    return () => window.clearTimeout(timeoutId)
  }, [])

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setHeroTitleWordIndex((currentIndex) => (currentIndex + 1) % HERO_TITLE_LOOP_WORDS.length)
    }, 1200)

    return () => window.clearInterval(intervalId)
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
        const errorMessage = requestError instanceof Error ? requestError.message : translate('loadDataFailed')
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

  async function refreshLotteryOverview() {
    const response = await apiRequest<LotteryOverviewResponse>('/api/lottery/overview')
    setLotteryOverview(response)
  }

  async function refreshAll(userId?: number) {
    await Promise.all([refreshGame(userId), refreshUpcomingGames(userId), refreshPlayersList(), refreshLotteryOverview()])
  }

  function logout() {
    clearStoredUserId()
    setUser(null)
    setSuccess('Signed out successfully.')
    setError('')
  }

  function logoutAdmin() {
    clearStoredAdminToken()
    setAdminToken('')
    setAdminPassword('')
    setAdminPlayers([])
    setSuccess('Signed out from admin mode.')
    setError('')
  }

  function changeLanguage(nextLanguage: AppLanguage) {
    setLanguage(nextLanguage)
    writeStoredLanguage(nextLanguage)
  }

  async function completeInitialSetup(event: FormEvent) {
    event.preventDefault()
    setOnboardingError('')

    const username = onboardingUsername.trim()
    if (!username) {
      setOnboardingError(`${translate('username')} is required.`)
      return
    }

    if (onboardingPassword.length < 4) {
      setOnboardingError(translate('passwordShort'))
      return
    }

    if (onboardingPassword !== onboardingPasswordConfirm) {
      setOnboardingError(translate('passwordMismatch'))
      return
    }

    let nextGroupId = ''
    const groupName = onboardingGroupName.trim()
    const groupPassword = onboardingGroupPassword.trim()

    if (!groupName) {
      setOnboardingError(`${translate('groupName')} is required.`)
      return
    }

    if (onboardingRole === 'admin') {
      if (groupPassword.length < 4) {
        setOnboardingError(translate('groupPasswordShort'))
        return
      }

      const exists = groups.some((group) => group.name.toLowerCase() === groupName.toLowerCase())
      if (exists) {
        setOnboardingError(translate('groupNameTaken'))
        return
      }

      const groupId = `group-${Date.now()}-${Math.floor(Math.random() * 100000)}`
      const groupPasswordSalt = createRandomSaltHex()
      const groupPasswordHash = await hashGroupPassword(groupPassword, groupPasswordSalt)
      const newGroup: LocalGroup = {
        id: groupId,
        name: groupName,
        createdBy: username,
        groupPasswordHash,
        groupPasswordSalt,
      }

      try {
        await apiRequest<{ ok: true }>('/api/admin/bootstrap', {
          method: 'POST',
          body: JSON.stringify({ username, password: onboardingPassword }),
        })
      } catch (requestError: unknown) {
        const errorMessage = requestError instanceof Error ? requestError.message : 'Failed to configure admin account.'
        setOnboardingError(errorMessage)
        return
      }

      nextGroupId = groupId
      setGroups((current) => [...current, newGroup])
      setGroupConfigs((current) => [
        ...current,
        {
          groupId,
          gameTypes: [createDefaultGameTypeConfig()],
        },
      ])
    } else {
      const selectedGroup = groups.find((group) => group.name.toLowerCase() === groupName.toLowerCase())
      if (!selectedGroup) {
        setOnboardingError(translate('groupNotFound'))
        return
      }

      if (!groupPassword) {
        setOnboardingError(`${translate('groupPassword')} is required.`)
        return
      }

      const passwordMatches = await verifyGroupPassword(selectedGroup, groupPassword)
      if (!passwordMatches) {
        setOnboardingError(translate('groupPasswordIncorrect'))
        return
      }

      nextGroupId = selectedGroup.id
    }

    const profile: LocalRegistrationProfile = {
      role: onboardingRole,
      username,
      password: onboardingPassword,
      groupId: nextGroupId,
    }

    writeStoredLanguage(language)
    writeRegistrationProfile(profile)
    writeSelectedGroupId(nextGroupId)
    setRegistrationProfile(profile)
    setSelectedGroupId(nextGroupId)
    setOnboardingGroupName('')
    setOnboardingGroupPassword('')
    setOnboardingUsername('')
    setOnboardingPassword('')
    setOnboardingPasswordConfirm('')
  }

  async function deleteGroupFromOnboarding() {
    if (onboardingRole !== 'admin') return

    setOnboardingError('')
    const groupName = onboardingGroupName.trim()
    const groupPassword = onboardingGroupPassword.trim()

    if (!groupName) {
      setOnboardingError(`${translate('groupName')} is required.`)
      return
    }

    const targetGroup = groups.find((group) => group.name.toLowerCase() === groupName.toLowerCase())
    if (!targetGroup) {
      setOnboardingError(translate('groupNotFound'))
      return
    }

    if (!groupPassword) {
      setOnboardingError(`${translate('groupPassword')} is required.`)
      return
    }

    const passwordMatches = await verifyGroupPassword(targetGroup, groupPassword)
    if (!passwordMatches) {
      setOnboardingError(translate('groupPasswordIncorrect'))
      return
    }

    const confirmed = window.confirm(translate('deleteGroupConfirm'))
    if (!confirmed) return

    const remainingGroups = groups.filter((group) => group.id !== targetGroup.id)
    const fallbackGroupId = remainingGroups[0]?.id || ''

    setGroups(remainingGroups)
    setGroupConfigs((current) => current.filter((entry) => entry.groupId !== targetGroup.id))

    if (registrationProfile?.groupId === targetGroup.id) {
      if (!fallbackGroupId) {
        clearRegistrationProfile()
        setRegistrationProfile(null)
      } else {
        const nextProfile: LocalRegistrationProfile = {
          ...registrationProfile,
          groupId: fallbackGroupId,
        }
        writeRegistrationProfile(nextProfile)
        setRegistrationProfile(nextProfile)
      }
    }

    if (selectedGroupId === targetGroup.id) {
      setSelectedGroupId(fallbackGroupId)
    }

    setOnboardingGroupName('')
    setOnboardingGroupPassword('')
    setSuccess(translate('groupDeleted'))
    setError('')
  }

  function saveCurrentGameType() {
    if (!selectedGroupId || !hasAdminSession) return

    const name = editingGameType.name.trim()
    if (!name) {
      setError(`${translate('gameTypeName')} is required.`)
      return
    }

    const normalizedConfig: LocalGameTypeConfig = {
      ...editingGameType,
      name,
      minPlayers: Math.max(2, Math.min(100, Number(editingGameType.minPlayers) || 6)),
      maxPlayersX: Math.max(2, Math.min(100, Number(editingGameType.maxPlayersX) || 12)),
      maxPlayersY: Math.max(2, Math.min(100, Number(editingGameType.maxPlayersY) || 16)),
      repeatDayOfWeek: Math.max(0, Math.min(6, Number(editingGameType.repeatDayOfWeek) || 5)),
      repeatTime: editingGameType.repeatTime || '19:00',
    }

    if (normalizedConfig.maxPlayersX < normalizedConfig.minPlayers) {
      setError('X must be greater than or equal to minimum players.')
      return
    }

    if (normalizedConfig.enableMaxPlayersY && normalizedConfig.maxPlayersY <= normalizedConfig.maxPlayersX) {
      setError('Y must be greater than X.')
      return
    }

    setGroupConfigs((current) => {
      const existingGroupIndex = current.findIndex((entry) => entry.groupId === selectedGroupId)

      if (existingGroupIndex === -1) {
        return [...current, { groupId: selectedGroupId, gameTypes: [normalizedConfig] }]
      }

      const next = [...current]
      const groupEntry = next[existingGroupIndex]
      const typeIndex = groupEntry.gameTypes.findIndex((item) => item.id === normalizedConfig.id)

      if (typeIndex === -1) {
        if (groupEntry.gameTypes.length >= 3) {
          setError(translate('maxThreeGameTypes'))
          return current
        }
        next[existingGroupIndex] = {
          ...groupEntry,
          gameTypes: [...groupEntry.gameTypes, normalizedConfig],
        }
      } else {
        const gameTypes = [...groupEntry.gameTypes]
        gameTypes[typeIndex] = normalizedConfig
        next[existingGroupIndex] = {
          ...groupEntry,
          gameTypes,
        }
      }

      return next
    })

    setSelectedGameTypeId(normalizedConfig.id)
    setSuccess('Saved game type settings.')
    setError('')
  }

  function addNewGameType() {
    if (!selectedGroupId || !hasAdminSession) return
    const existingCount = selectedGroupConfig?.gameTypes.length || 0
    if (existingCount >= 3) {
      setError(translate('maxThreeGameTypes'))
      return
    }

    const next = createDefaultGameTypeConfig()
    setEditingGameType(next)
    setSelectedGameTypeId(next.id)
  }

  async function addGroupByAdmin() {
    if (!hasAdminSession) return
    if (groups.length >= 3) {
      setError(translate('maxThreeGroups'))
      return
    }

    const name = newGroupName.trim()
    const password = newGroupPassword.trim()
    if (!name) {
      setError(`${translate('groupName')} is required.`)
      return
    }

    if (password.length < 4) {
      setError(translate('groupPasswordShort'))
      return
    }

    if (groups.some((group) => group.name.toLowerCase() === name.toLowerCase())) {
      setError(translate('groupNameTaken'))
      return
    }

    const id = `group-${Date.now()}-${Math.floor(Math.random() * 100000)}`
    const groupPasswordSalt = createRandomSaltHex()
    const groupPasswordHash = await hashGroupPassword(password, groupPasswordSalt)
    const group: LocalGroup = {
      id,
      name,
      createdBy: adminUsername || 'admin',
      groupPasswordHash,
      groupPasswordSalt,
    }

    setGroups((current) => [...current, group])
    setGroupConfigs((current) => [...current, { groupId: id, gameTypes: [createDefaultGameTypeConfig()] }])
    setSelectedGroupId(id)
    setNewGroupName('')
    setNewGroupPassword('')
    setSuccess('Group created.')
    setError('')
  }

  async function saveGroupByAdmin() {
    if (!hasAdminSession || !selectedGroup) return

    const name = editingGroupName.trim()
    if (!name) {
      setError(`${translate('groupName')} is required.`)
      return
    }

    const isNameTaken = groups.some(
      (group) => group.id !== selectedGroup.id && group.name.toLowerCase() === name.toLowerCase()
    )
    if (isNameTaken) {
      setError(translate('groupNameTaken'))
      return
    }

    const nextPassword = editingGroupPassword.trim()
    if (nextPassword && nextPassword.length < 4) {
      setError(translate('groupPasswordShort'))
      return
    }

    let nextPasswordHash = selectedGroup.groupPasswordHash
    let nextPasswordSalt = selectedGroup.groupPasswordSalt
    if (nextPassword) {
      nextPasswordSalt = createRandomSaltHex()
      nextPasswordHash = await hashGroupPassword(nextPassword, nextPasswordSalt)
    }

    setGroups((current) =>
      current.map((group) =>
        group.id === selectedGroup.id
          ? {
              ...group,
              name,
              groupPasswordHash: nextPasswordHash,
              groupPasswordSalt: nextPasswordSalt,
              groupPassword: '',
            }
          : group
      )
    )

    setEditingGroupPassword('')
    setSuccess(translate('groupUpdated'))
    setError('')
  }

  function deleteGroupByAdmin() {
    if (!hasAdminSession || !selectedGroup) return

    const confirmed = window.confirm(translate('deleteGroupConfirm'))
    if (!confirmed) return

    const remainingGroups = groups.filter((group) => group.id !== selectedGroup.id)
    const fallbackGroupId = remainingGroups[0]?.id || ''

    setGroups(remainingGroups)
    setGroupConfigs((current) => current.filter((entry) => entry.groupId !== selectedGroup.id))

    if (registrationProfile?.groupId === selectedGroup.id) {
      if (!fallbackGroupId) {
        clearRegistrationProfile()
        setRegistrationProfile(null)
      } else {
        const nextProfile: LocalRegistrationProfile = {
          ...registrationProfile,
          groupId: fallbackGroupId,
        }
        writeRegistrationProfile(nextProfile)
        setRegistrationProfile(nextProfile)
      }
    }

    setSelectedGroupId(fallbackGroupId)
    setSuccess(translate('groupDeleted'))
    setError('')
  }

  function addPaymentLink() {
    if (!hasAdminSession || !selectedGroup) return

    const url = paymentLinkUrl.trim()
    const label = paymentLinkLabel.trim()

    if (!url) {
      setError(translate('paymentLinkUrl') + ' is required.')
      return
    }

    if (!label) {
      setError(translate('paymentLinkLabel') + ' is required.')
      return
    }

    try {
      new URL(url)
    } catch (_e) {
      setError('Invalid URL format.')
      return
    }

    setGroups((current) =>
      current.map((group) => {
        if (group.id !== selectedGroup.id) return group
        const links = group.paymentLinks || []
        const newLink: LocalGroupPaymentLink = {
          id: `link-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
          url,
          label,
        }
        return { ...group, paymentLinks: [...links, newLink] }
      }),
    )

    setPaymentLinkUrl('')
    setPaymentLinkLabel('')
    setSuccess('Payment link added.')
    setError('')
  }

  function deletePaymentLink(linkId: string) {
    if (!hasAdminSession || !selectedGroup) return

    setGroups((current) =>
      current.map((group) => {
        if (group.id !== selectedGroup.id) return group
        return { ...group, paymentLinks: (group.paymentLinks || []).filter((link) => link.id !== linkId) }
      }),
    )
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
      setSuccess(translate('adminLoginSuccess'))
      await refreshAdminPlayers()
    } catch (requestError: unknown) {
      const errorMessage = requestError instanceof Error ? requestError.message : 'Admin login failed.'
      const normalizedMessage = language === 'he' ? errorMessage : translate('adminCredentialsIncorrect')
      setError(normalizedMessage)
    } finally {
      setIsBusy(false)
    }
  }

  async function loginAsSelectedPlayer() {
    if (!selectedPlayerId) {
      setError(translate('choosePlayerRequired'))
      return
    }

    const selectedPlayer = playerOptions.find((item) => item.id === selectedPlayerId)
    if (!selectedPlayer) {
      setError(translate('selectedPlayerNotFound'))
      return
    }

    const confirmed = window.confirm(translate('playerLoginConfirmMessage'))
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
      setSuccess(translate('playerLoginSuccess'))
    } catch (requestError: unknown) {
      const errorMessage = requestError instanceof Error ? requestError.message : translate('playerLoginFailed')
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
      setSuccess(translate('joinGameSuccess'))
    } catch (requestError: unknown) {
      const errorMessage = requestError instanceof Error ? requestError.message : translate('joinGameFailed')
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
      setSuccess(translate('leaveGameSuccess'))
    } catch (requestError: unknown) {
      const errorMessage = requestError instanceof Error ? requestError.message : translate('leaveGameFailed')
      setError(errorMessage)
    } finally {
      setIsBusy(false)
    }
  }

  async function submitGameForm(event: FormEvent) {
    event.preventDefault()
    if (!hasAdminSession) {
      setError(translate('adminOnlyCreateGame'))
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
        setSuccess(translate('gameUpdatedSuccess'))
      } else {
        const response = await apiRequest<{ game: Game; message?: string }>('/api/games', {
          method: 'POST',
          body: JSON.stringify(payload),
        })
        setGame(response.game)
        setSuccess(response.message || translate('gameCreatedSuccess'))
      }

      await refreshUpcomingGames(user?.id)
    } catch (requestError: unknown) {
      const errorMessage = requestError instanceof Error ? requestError.message : translate('saveGameFailed')
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
      setSuccess(translate('gameDeletedSuccess'))
    } catch (requestError: unknown) {
      const errorMessage = requestError instanceof Error ? requestError.message : translate('deleteGameFailed')
      setError(errorMessage)
    } finally {
      setIsBusy(false)
    }
  }

  async function approvePlayerByAdmin(playerId: number) {
    if (!hasAdminSession) return

    setError('')
    setSuccess('')
    setIsBusy(true)
    try {
      await apiRequest(`/api/admin/players/${playerId}/approve`, {
        method: 'POST',
        body: JSON.stringify({ adminToken }),
      })
      await Promise.all([refreshAdminPlayers(), refreshPlayersList()])
      setSuccess(translate('playerApprovedSuccess'))
    } catch (requestError: unknown) {
      const errorMessage = requestError instanceof Error ? requestError.message : translate('approvePlayerFailed')
      setError(errorMessage)
    } finally {
      setIsBusy(false)
    }
  }

  async function rejectPlayerByAdmin(playerId: number) {
    if (!hasAdminSession) return

    setError('')
    setSuccess('')
    setIsBusy(true)
    try {
      await apiRequest(`/api/admin/players/${playerId}/reject`, {
        method: 'POST',
        body: JSON.stringify({ adminToken }),
      })
      await refreshAdminPlayers()
      setSuccess(translate('playerRejectedSuccess'))
    } catch (requestError: unknown) {
      const errorMessage = requestError instanceof Error ? requestError.message : translate('rejectPlayerFailed')
      setError(errorMessage)
    } finally {
      setIsBusy(false)
    }
  }

  async function blockPlayerByAdmin(playerId: number) {
    if (!hasAdminSession) return

    setError('')
    setSuccess('')
    setIsBusy(true)
    try {
      await apiRequest(`/api/admin/players/${playerId}/block`, {
        method: 'POST',
        body: JSON.stringify({ adminToken }),
      })
      await refreshAdminPlayers()
      setSuccess(translate('playerBlockedSuccess'))
    } catch (requestError: unknown) {
      const errorMessage = requestError instanceof Error ? requestError.message : translate('blockPlayerFailed')
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
      setSuccess(translate('playerRejectedSuccess'))
    } catch (requestError: unknown) {
      const errorMessage = requestError instanceof Error ? requestError.message : translate('deletePlayerFailed')
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

      {showWelcomeGuide && isOnboardingOpen && !showIntro && (
        <section className="instructions-overlay">
          <article className="instructions-card">
            <h2>{translate('welcomeTitle')}</h2>
            <p className="muted">{translate('welcomeIntro')}</p>
            <ul className="instructions-list">
              {welcomeGuideBullets.map((item, index) => (
                <li key={`welcome-guide-${index}`}>{item}</li>
              ))}
            </ul>
            <button
              type="button"
              className="cta cta-primary"
              onClick={() => {
                setShowWelcomeGuide(false)
                setShowRegistrationGuide(true)
              }}
            >
              {translate('welcomeAcknowledge')}
            </button>
          </article>
        </section>
      )}

      {!showWelcomeGuide && showRegistrationGuide && isOnboardingOpen && !showIntro && (
        <section className="instructions-overlay">
          <article className="instructions-card">
            <h2>{translate('registrationGuideTitle')}</h2>
            <p className="muted">{translate('registrationGuideIntro')}</p>
            <ol className="instructions-list">
              {registrationGuideSteps.map((step, index) => (
                <li key={`guide-step-${index}`}>{step}</li>
              ))}
            </ol>
            <button
              type="button"
              className="cta cta-primary"
              onClick={() => setShowRegistrationGuide(false)}
            >
              {translate('registrationGuideClose')}
            </button>
          </article>
        </section>
      )}

      {isOnboardingOpen && (
        <section className="onboarding-overlay">
          <form className="onboarding-card" onSubmit={completeInitialSetup}>
            <h2>{translate('initialSetup')}</h2>

            <label className="onboarding-label" htmlFor="setup-language">
              {translate('chooseLanguage')}
            </label>
            <select
              id="setup-language"
              className="select-input"
              value={language}
              onChange={(event) => changeLanguage(event.target.value as AppLanguage)}
            >
              {SUPPORTED_LANGUAGES.map((entry) => (
                <option key={entry.code} value={entry.code}>
                  {entry.label}
                </option>
              ))}
            </select>

            <p className="onboarding-label">{translate('registerAs')}</p>
            <div className="onboarding-role-row">
              <button
                type="button"
                className={`auth-chip ${onboardingRole === 'admin' ? 'auth-chip-active' : ''}`}
                onClick={() => setOnboardingRole('admin')}
              >
                {translate('admin')}
              </button>
              <button
                type="button"
                className={`auth-chip ${onboardingRole === 'player' ? 'auth-chip-active' : ''}`}
                onClick={() => setOnboardingRole('player')}
              >
                {translate('player')}
              </button>
            </div>

            <p className="onboarding-label">{translate('createGroupHint')}</p>

            <input
              required
              className="text-input"
              placeholder={translate('groupName')}
              value={onboardingGroupName}
              onChange={(event) => setOnboardingGroupName(event.target.value)}
            />

            <input
              required
              type="password"
              className="text-input"
              placeholder={translate('groupPassword')}
              value={onboardingGroupPassword}
              onChange={(event) => setOnboardingGroupPassword(event.target.value)}
            />

            {onboardingRole === 'admin' && groups.length > 0 && (
              <button
                type="button"
                className="cta cta-danger"
                onClick={() => void deleteGroupFromOnboarding()}
              >
                {translate('deleteGroup')}
              </button>
            )}

            <input
              required
              className="text-input"
              placeholder={translate('username')}
              value={onboardingUsername}
              onChange={(event) => setOnboardingUsername(event.target.value)}
            />
            <input
              required
              type="password"
              className="text-input"
              placeholder={translate('password')}
              value={onboardingPassword}
              onChange={(event) => setOnboardingPassword(event.target.value)}
            />
            <input
              required
              type="password"
              className="text-input"
              placeholder={translate('passwordConfirm')}
              value={onboardingPasswordConfirm}
              onChange={(event) => setOnboardingPasswordConfirm(event.target.value)}
            />

            {onboardingError && <p className="message message-error">{onboardingError}</p>}

            <button type="submit" className="cta cta-primary">
              {translate('finishSetup')}
            </button>
          </form>
        </section>
      )}

      <section className="hero hero-sport">
        <div className="topbar">
          <div className="admin-corner">
            {hasAdminSession ? (
              <div className="row">
                {!user && (
                  <button
                    type="button"
                    className="auth-chip"
                    onClick={() => setAuthTab('player')}
                  >
                    {translate('adminAsPlayer')}
                  </button>
                )}
                <button disabled={isBusy} className="auth-chip auth-chip-active" onClick={logoutAdmin}>
                  {translate('adminLogout')}
                </button>
              </div>
            ) : !user ? (
              <button
                type="button"
                className={`auth-chip ${authTab === 'admin' ? 'auth-chip-active' : ''}`}
                onClick={() => setAuthTab((current) => (current === 'admin' ? 'player' : 'admin'))}
              >
                {authTab === 'admin' ? translate('player') : translate('admin')}
              </button>
            ) : null}
          </div>

          <div className="language-switcher">
            <label htmlFor="language-select" className="language-switcher-label">
              {translate('language')}
            </label>
            <select
              id="language-select"
              className="select-input language-switcher-select"
              value={language}
              onChange={(event) => changeLanguage(event.target.value as AppLanguage)}
            >
              {SUPPORTED_LANGUAGES.map((entry) => (
                <option key={entry.code} value={entry.code}>
                  {entry.label}
                </option>
              ))}
            </select>
          </div>

          <div className="brand-block">
            <h1 className="hero-title-neon" aria-label="Come 2 Court">
              <span key={currentHeroWord} className="hero-title-line hero-title-loop">{currentHeroWord}</span>
            </h1>
          </div>
        </div>

        {user && (
          <div className="hero-strip hero-strip-compact">
            <div>
              <strong>{user.name}</strong>
              <p>{translate('signedInSession')}</p>
            </div>
            <button disabled={isBusy} className="cta cta-ghost" onClick={logout}>
              {translate('signOut')}
            </button>
          </div>
        )}
      </section>

      {!isOnboardingOpen && groups.length > 0 && (
        <section className="card full-width tabs-card" style={{ marginTop: 12 }}>
          <div className="section-head" style={{ marginBottom: 8 }}>
            <div>
              <p className="section-kicker">{translate('groupTabTitle')}</p>
            </div>
          </div>
          <div className="tabs-row">
            {groups.map((group) => (
              <button
                key={group.id}
                type="button"
                className={`tab-btn ${selectedGroupId === group.id ? 'tab-btn-active' : ''}`}
                onClick={() => setSelectedGroupId(group.id)}
              >
                {group.name}
              </button>
            ))}
          </div>

          {hasAdminSession && (
            <>
              <div className="row" style={{ marginTop: 10 }}>
                <input
                  className="text-input"
                  placeholder={translate('groupName')}
                  value={newGroupName}
                  onChange={(event) => setNewGroupName(event.target.value)}
                />
                <input
                  type="password"
                  className="text-input"
                  placeholder={translate('groupPassword')}
                  value={newGroupPassword}
                  onChange={(event) => setNewGroupPassword(event.target.value)}
                />
                <button
                  type="button"
                  className="cta cta-soft"
                  onClick={() => void addGroupByAdmin()}
                  disabled={groups.length >= 3}
                >
                  {translate('addGroup')}
                </button>
                <button
                  type="button"
                  className="cta cta-danger"
                  onClick={deleteGroupByAdmin}
                  disabled={!selectedGroup}
                >
                  {translate('deleteGroup')}
                </button>
                <span className="muted">{translate('maxThreeGroups')}</span>
              </div>

              {selectedGroup && (
                <>
                  <div className="row" style={{ marginTop: 8 }}>
                    <input
                      className="text-input"
                      placeholder={translate('groupName')}
                      value={editingGroupName}
                      onChange={(event) => setEditingGroupName(event.target.value)}
                    />
                    <input
                      type="password"
                      className="text-input"
                      placeholder={translate('newGroupPassword')}
                      value={editingGroupPassword}
                      onChange={(event) => setEditingGroupPassword(event.target.value)}
                    />
                    <button
                      type="button"
                      className="cta cta-soft"
                      onClick={() => void saveGroupByAdmin()}
                    >
                      {translate('editGroup')}
                    </button>
                    <button
                      type="button"
                      className="cta cta-danger"
                      onClick={deleteGroupByAdmin}
                    >
                      {translate('deleteGroup')}
                    </button>
                    <span className="muted">{translate('keepCurrentPassword')}</span>
                  </div>

                  {/* Payment Links Management */}
                  <div className="row" style={{ marginTop: 14 }}>
                  <div className="section-head" style={{ width: '100%', marginBottom: 8 }}>
                    <p className="section-kicker">{translate('paymentLinksTitle')}</p>
                  </div>
                  {selectedGroup.paymentLinks && selectedGroup.paymentLinks.length > 0 ? (
                    <div style={{ width: '100%', marginBottom: 12 }}>
                      {selectedGroup.paymentLinks.map((link) => (
                        <div
                          key={link.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '8px 12px',
                            backgroundColor: '#f5f5f5',
                            borderRadius: '4px',
                            marginBottom: '6px',
                          }}
                        >
                          <div>
                            <strong>{link.label}</strong>: <a href={link.url} target="_blank" rel="noopener noreferrer" style={{ color: '#0066cc', textDecoration: 'none' }}>{link.url}</a>
                          </div>
                          <button
                            type="button"
                            className="cta cta-danger"
                            style={{ padding: '4px 8px', fontSize: '12px' }}
                            onClick={() => deletePaymentLink(link.id)}
                          >
                            {translate('deletePaymentLink')}
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ width: '100%', marginBottom: 12, color: '#999' }}>
                      {translate('noPaymentLinks')}
                    </div>
                  )}
                  <input
                    type="text"
                    className="text-input"
                    placeholder={translate('paymentLinkLabel')}
                    value={paymentLinkLabel}
                    onChange={(event) => setPaymentLinkLabel(event.target.value)}
                  />
                  <input
                    type="url"
                    className="text-input"
                    placeholder={translate('paymentLinkUrl')}
                    value={paymentLinkUrl}
                    onChange={(event) => setPaymentLinkUrl(event.target.value)}
                  />
                    <button
                      type="button"
                      className="cta cta-soft"
                      onClick={addPaymentLink}
                    >
                      {translate('addPaymentLink')}
                    </button>
                  </div>
                </>
              )}
            </>
          )}

          {selectedGroupConfig?.gameTypes?.length ? (
            <>
              <div className="section-head" style={{ marginTop: 14, marginBottom: 8 }}>
                <div>
                  <p className="section-kicker">{translate('gameTypeTabTitle')}</p>
                </div>
              </div>
              <div className="tabs-row">
                {selectedGroupConfig.gameTypes.map((gameType) => (
                  <button
                    key={gameType.id}
                    type="button"
                    className={`tab-btn ${selectedGameTypeId === gameType.id ? 'tab-btn-active' : ''}`}
                    onClick={() => {
                      setSelectedGameTypeId(gameType.id)
                      setEditingGameType(gameType)
                    }}
                  >
                    {gameType.name}
                  </button>
                ))}
              </div>
            </>
          ) : null}
        </section>
      )}

      <section className="grid">
        {!user && authTab === 'player' && (
          <article className="card full-width card-compact landing-card">
            <div className="section-head">
              <div>
                <p className="section-kicker">Player Select</p>
                <h2>{translate('profileSelectTitle')}</h2>
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
                <option value="">{translate('selectPlayer')}</option>
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
                  placeholder={translate('playerPasswordPlaceholder')}
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
                {translate('playerLogin')}
              </button>
            </div>
          </article>
        )}

        {!user && !hasAdminSession && authTab === 'admin' && (
          <article className="card full-width card-compact">
            <div className="section-head">
              <div>
                <p className="section-kicker">Admin Bench</p>
                <h2>{translate('adminLoginTitle')}</h2>
              </div>
            </div>
            <form className="input-grid" onSubmit={loginAdmin}>
              <input
                required
                placeholder={translate('adminUsernamePlaceholder')}
                value={adminUsername}
                onChange={(event) => setAdminUsername(event.target.value)}
              />
              <input
                required
                type="password"
                placeholder={translate('adminPasswordPlaceholder')}
                value={adminPassword}
                onChange={(event) => setAdminPassword(event.target.value)}
              />
              <button disabled={isBusy} className="cta cta-primary" type="submit">
                {translate('adminLoginButton')}
              </button>
            </form>
          </article>
        )}

        {!isLandingMode && (
          <>
            <article className="card full-width tabs-card">
              <div className="tabs-row">
                <button
                  type="button"
                  className={`tab-btn ${activeTab === 'main' ? 'tab-btn-active' : ''}`}
                  onClick={() => setActiveTab('main')}
                >
                  {translate('mainTab')}
                </button>
                <button
                  type="button"
                  className={`tab-btn ${activeTab === 'rules' ? 'tab-btn-active' : ''}`}
                  onClick={() => setActiveTab('rules')}
                >
                  {translate('rulesTab')}
                </button>
                <button
                  type="button"
                  className={`tab-btn ${activeTab === 'lottery' ? 'tab-btn-active' : ''}`}
                  onClick={() => setActiveTab('lottery')}
                >
                  {translate('lotteryTab')}
                </button>
                <button
                  type="button"
                  className={`tab-btn ${activeTab === 'instructions' ? 'tab-btn-active' : ''}`}
                  onClick={() => setActiveTab('instructions')}
                >
                  {translate('instructionsTab')}
                </button>
              </div>
            </article>

            {activeTab === 'main' && (
              <>
            <article className="card full-width game-spotlight">
              <div className="section-head">
                <div>
                  <p className="section-kicker">Tip Off</p>
                  <h2>{translate('upcomingGameTitle')}</h2>
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
                      <span>{translate('registeredCount')}</span>
                      <strong>{spotlightGame.playersCount}</strong>
                    </div>
                  </div>

                  <div className="meta-grid">
                    <div className="meta-pill">{spotlightGame.location || translate('locationTbd')}</div>
                    <div className="meta-pill">
                      {translate('registrationLock')}:{' '}
                      {selectedGameType?.lockDateTime
                        ? formatGameDateTime(new Date(selectedGameType.lockDateTime).toISOString())
                        : formatGameDateTime(spotlightGame.registrationDeadline)}
                    </div>
                    <div className="meta-pill">
                      {translate('rulesSummaryPrefix')}: {translate('rulesMinPlayers')} {selectedGameType?.minPlayers || 6}, {translate('rulesMaxX')} {selectedGameType?.maxPlayersX || 12}
                      {selectedGameType?.enableMaxPlayersY ? `, ${translate('rulesMaxY')} ${selectedGameType.maxPlayersY}` : ''}
                    </div>
                  </div>

                  {spotlightGame.notes && <p className="muted">{spotlightGame.notes}</p>}

                  {user && game && game.viewerPosition && (
                    <p className="message message-ok inline-message">
                      {translate('yourPosition')}: #{game.viewerPosition} | {translate('statusLabel')}: {game.viewerRole === 'PLAYING' ? translate('playingLabel') : translate('notPlayingLabel')}
                    </p>
                  )}

                  {game?.isRegistrationClosed && (
                    <p className="message message-error inline-message">
                      {translate('registrationClosedMessagePrefix')} {String(apiConfig?.registrationLockHour || 20).padStart(2, '0')}:00.
                    </p>
                  )}

                  <div className="row actions-row">
                    {spotlightGame && (
                      <button
                        className="cta cta-secondary"
                        onClick={() => window.open(createGoogleCalendarUrl(spotlightGame), '_blank')}
                      >
                        {translate('addToCalendar')}
                      </button>
                    )}

                    {user && game && !isUserInGame ? (
                      <button
                        disabled={isBusy || game.isRegistrationClosed}
                        className="cta cta-primary"
                        onClick={joinGame}
                      >
                        {game.isRegistrationClosed ? translate('registrationClosedShort') : translate('joinGame')}
                      </button>
                    ) : null}

                    {game && isUserInGame ? (
                      <button disabled={isBusy} className="cta cta-danger" onClick={leaveGame}>
                        {translate('cancelRegistration')}
                      </button>
                    ) : null}
                  </div>
                </>
              ) : (
                <p className="muted">{translate('noPlannedGame')}</p>
              )}
            </article>

            {nextGame && (
              <article className="card full-width next-game-card">
                <div className="section-head">
                  <div>
                    <p className="section-kicker">On Deck</p>
                    <h2>{translate('nextGameTitle')}</h2>
                  </div>
                  <span className={`status-badge status-${nextGame.status}`}>{getStatusLabel(nextGame.status)}</span>
                </div>
                <div className="game-headline compact-headline">
                  <div>
                    <h3>{nextGame.title}</h3>
                    <p className="game-time">{formatGameDateTime(nextGame.gameDate)}</p>
                  </div>
                  <div className="game-scoreboard game-scoreboard-small">
                    <span>{translate('registeredCount')}</span>
                    <strong>{nextGame.playersCount}</strong>
                  </div>
                </div>
                <button
                  className="cta cta-secondary"
                  style={{ width: '100%', marginTop: '12px' }}
                  onClick={() => window.open(createGoogleCalendarUrl(nextGame), '_blank')}
                >
                  {translate('addToCalendar')}
                </button>
              </article>
            )}

            {hasAdminSession && (
              <>
                {/* Pending Approvals Section */}
                <article className="card full-width card-compact">
                  <div className="section-head">
                    <div>
                      <p className="section-kicker">Player Management</p>
                      <h2>{translate('pendingApprovalsTitle')}</h2>
                    </div>
                  </div>

                  <ul className="players players-grid">
                    {adminPlayers.filter((p) => p.status === 'pending').length === 0 ? (
                      <li style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '16px', color: '#666' }}>
                        {translate('noPendingUsers')}
                      </li>
                    ) : (
                      adminPlayers
                        .filter((p) => p.status === 'pending')
                        .map((player) => (
                          <li key={player.id}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
                              <div>
                                <strong>{player.name}</strong>
                              </div>
                              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  className="cta cta-primary"
                                  style={{ flex: 1, minWidth: '60px', padding: '6px 8px', fontSize: '12px' }}
                                  onClick={() => approvePlayerByAdmin(player.id)}
                                >
                                  {translate('approveButton')}
                                </button>
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  className="cta cta-secondary"
                                  style={{ flex: 1, minWidth: '60px', padding: '6px 8px', fontSize: '12px' }}
                                  onClick={() => rejectPlayerByAdmin(player.id)}
                                >
                                  {translate('rejectButton')}
                                </button>
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  className="cta cta-danger"
                                  style={{ flex: 1, minWidth: '60px', padding: '6px 8px', fontSize: '12px' }}
                                  onClick={() => blockPlayerByAdmin(player.id)}
                                >
                                  {translate('blockButton')}
                                </button>
                              </div>
                            </div>
                          </li>
                        ))
                    )}
                  </ul>
                </article>

                {/* Active Players Section */}
                <article className="card full-width card-compact">
                  <div className="section-head">
                    <div>
                      <p className="section-kicker">Player Management</p>
                      <h2>{translate('activePlayersManagement')}</h2>
                    </div>
                  </div>

                  <ul className="players players-grid">
                    {adminPlayers.filter((p) => p.status === 'active').length === 0 ? (
                      <li style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '16px', color: '#666' }}>
                        {translate('noActivePlayersYet')}
                      </li>
                    ) : (
                      adminPlayers
                        .filter((p) => p.status === 'active')
                        .map((player) => (
                          <li key={player.id}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
                              <div>
                                <strong>{player.name}</strong>
                              </div>
                              <button
                                disabled={isBusy}
                                className="cta cta-danger"
                                onClick={() => removePlayerByAdmin(player.id)}
                              >
                                {translate('deleteAction')}
                              </button>
                            </div>
                          </li>
                        ))
                    )}
                  </ul>
                </article>
              </>
            )}

            {hasAdminSession && selectedGroup && (
              <article className="card full-width card-compact">
                <div className="section-head">
                  <div>
                    <p className="section-kicker">{translate('gameTypeTabTitle')}</p>
                    <h2>{translate('adminSetupTitle')}</h2>
                  </div>
                </div>

                <p className="muted">{selectedGroup.name}</p>

                <div className="input-grid">
                  <input
                    className="text-input"
                    placeholder={translate('gameTypeName')}
                    value={editingGameType.name}
                    onChange={(event) => setEditingGameType((current) => ({ ...current, name: event.target.value }))}
                  />

                  <input
                    type="number"
                    min={2}
                    max={100}
                    className="text-input"
                    placeholder={translate('minPlayersCount')}
                    value={editingGameType.minPlayers}
                    onChange={(event) =>
                      setEditingGameType((current) => ({ ...current, minPlayers: Number(event.target.value) || 6 }))
                    }
                  />

                  <input
                    type="number"
                    min={2}
                    max={100}
                    className="text-input"
                    placeholder={translate('maxPlayersX')}
                    value={editingGameType.maxPlayersX}
                    onChange={(event) =>
                      setEditingGameType((current) => ({ ...current, maxPlayersX: Number(event.target.value) || 12 }))
                    }
                  />

                  <label className="onboarding-check">
                    <input
                      type="checkbox"
                      checked={editingGameType.enableMaxPlayersY}
                      onChange={(event) =>
                        setEditingGameType((current) => ({ ...current, enableMaxPlayersY: event.target.checked }))
                      }
                    />
                    <span>{translate('enableMaxPlayersY')}</span>
                  </label>

                  {editingGameType.enableMaxPlayersY && (
                    <input
                      type="number"
                      min={2}
                      max={100}
                      className="text-input"
                      placeholder={translate('maxPlayersY')}
                      value={editingGameType.maxPlayersY}
                      onChange={(event) =>
                        setEditingGameType((current) => ({ ...current, maxPlayersY: Number(event.target.value) || 16 }))
                      }
                    />
                  )}

                  <label className="onboarding-label">{translate('lockTime')}</label>
                  <input
                    type="datetime-local"
                    className="text-input"
                    value={editingGameType.lockDateTime}
                    onChange={(event) => setEditingGameType((current) => ({ ...current, lockDateTime: event.target.value }))}
                  />

                  <label className="onboarding-label">{translate('nextGameTime')}</label>
                  <input
                    type="datetime-local"
                    className="text-input"
                    value={editingGameType.nextGameDateTime}
                    onChange={(event) =>
                      setEditingGameType((current) => ({ ...current, nextGameDateTime: event.target.value }))
                    }
                  />

                  <label className="onboarding-check">
                    <input
                      type="checkbox"
                      checked={editingGameType.enableLottery}
                      onChange={(event) =>
                        setEditingGameType((current) => ({ ...current, enableLottery: event.target.checked }))
                      }
                    />
                    <span>{translate('enableLottery')}</span>
                  </label>

                  <label className="onboarding-check">
                    <input
                      type="checkbox"
                      checked={editingGameType.repeatWeekly}
                      onChange={(event) =>
                        setEditingGameType((current) => ({ ...current, repeatWeekly: event.target.checked }))
                      }
                    />
                    <span>{translate('weeklyRepeat')}</span>
                  </label>

                  {editingGameType.repeatWeekly && (
                    <>
                      <label className="onboarding-label">{translate('repeatDay')}</label>
                      <select
                        className="select-input"
                        value={editingGameType.repeatDayOfWeek}
                        onChange={(event) =>
                          setEditingGameType((current) => ({
                            ...current,
                            repeatDayOfWeek: Number(event.target.value),
                          }))
                        }
                      >
                        <option value={0}>Sunday</option>
                        <option value={1}>Monday</option>
                        <option value={2}>Tuesday</option>
                        <option value={3}>Wednesday</option>
                        <option value={4}>Thursday</option>
                        <option value={5}>Friday</option>
                        <option value={6}>Saturday</option>
                      </select>

                      <label className="onboarding-label">{translate('repeatTime')}</label>
                      <input
                        type="time"
                        className="text-input"
                        value={editingGameType.repeatTime}
                        onChange={(event) =>
                          setEditingGameType((current) => ({ ...current, repeatTime: event.target.value }))
                        }
                      />
                    </>
                  )}
                </div>

                <div className="row" style={{ marginTop: 12 }}>
                  <button type="button" className="cta cta-primary" onClick={saveCurrentGameType}>
                    {translate('saveGameType')}
                  </button>
                  <button
                    type="button"
                    className="cta cta-soft"
                    onClick={addNewGameType}
                    disabled={(selectedGroupConfig?.gameTypes.length || 0) >= 3}
                  >
                    {translate('addGameType')}
                  </button>
                  <span className="muted">{translate('maxThreeGameTypes')}</span>
                </div>
              </article>
            )}

            {showCreateBlock && (
              <article className="card full-width">
                <div className="section-head">
                  <div>
                    <p className="section-kicker">Next Match Setup</p>
                    <h2>{isEditingGame ? translate('editGameTitle') : translate('createGameAdminOnlyTitle')}</h2>
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
                        {translate('editPrefix')} {formatGameDate(item.gameDate)}
                      </button>
                    ))}
                    {upcomingGames.map((item) => (
                      <button
                        key={`delete-${item.id}`}
                        className="cta cta-danger"
                        disabled={isBusy}
                        onClick={() => deleteGame(item.id)}
                      >
                        {translate('deletePrefix')} {formatGameDate(item.gameDate)}
                      </button>
                    ))}
                  </div>
                ) : (
                  <form className="input-grid" onSubmit={submitGameForm}>
                    <input
                      required
                      placeholder={translate('gameTitlePlaceholder')}
                      value={gameForm.title}
                      onChange={(event) => setGameForm((current) => ({ ...current, title: event.target.value }))}
                    />
                    <input
                      placeholder={translate('locationPlaceholder')}
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
                      placeholder={translate('notesPlaceholder')}
                      value={gameForm.notes}
                      onChange={(event) => setGameForm((current) => ({ ...current, notes: event.target.value }))}
                      style={{ minHeight: 100 }}
                    />
                    <div className="row">
                      <button disabled={isBusy} className="cta cta-primary" type="submit">
                        {isEditingGame ? translate('saveChanges') : translate('createGame')}
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
                          {translate('cancelAction')}
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
                    <h2>{index === 0 ? translate('registrationsUpcomingGame') : translate('registrationsNextGame')}</h2>
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
                  {translate('addToCalendar')}
                </button>
                <ul className="players players-grid">
                  {rosterGame.players.length ? (
                    rosterGame.players.map((player) => (
                      <li key={player.registrationId}>
                        <span>
                          <strong>#{player.position}</strong> {player.name}
                        </span>
                        <span className={`tag ${player.role === 'PLAYING' ? 'tag-play' : 'tag-wait'}`}>
                          {player.role === 'PLAYING' ? translate('playingLabel') : translate('onBenchThisRound')}
                        </span>
                      </li>
                    ))
                  ) : (
                    <li className="muted">{translate('noRegistrationsYet')}</li>
                  )}
                </ul>
              </article>
            ))}
              </>
            )}

            {activeTab === 'rules' && (
              <article className="card full-width info-card">
                <div className="section-head">
                  <div>
                    <p className="section-kicker">Registration Rules</p>
                    <h2>{translate('customRulesTitle')}</h2>
                  </div>
                </div>

                {selectedGroup && selectedGameType ? (
                  <ul className="rules-list">
                    <li>{translate('rulesActiveGroup')}: {selectedGroup.name}</li>
                    <li>{translate('rulesActiveGameType')}: {selectedGameType.name}</li>
                    <li>{translate('rulesMinPlayers')}: {selectedGameType.minPlayers}</li>
                    <li>{translate('rulesMaxX')}: {selectedGameType.maxPlayersX}</li>
                    <li>{translate('rulesMaxY')}: {selectedGameType.enableMaxPlayersY ? selectedGameType.maxPlayersY : translate('disabled')}</li>
                    <li>
                      {translate('lockTime')}: {formatGameDateTime(new Date(selectedGameType.lockDateTime).toISOString())}
                    </li>
                    <li>{translate('overflowLotteryLabel')}: {selectedGameType.enableLottery ? translate('yesLabel') : translate('noLabel')}</li>
                    {selectedGameType.enableLottery ? (
                      selectedGameType.enableMaxPlayersY ? (
                        <li>{translate('lotteryRuleWithY')}</li>
                      ) : (
                        <li>{translate('lotteryRuleNoY')}</li>
                      )
                    ) : (
                      <li>{translate('lotteryDisabledRule')}</li>
                    )}
                    <li>
                      {translate('upcomingGame')}: {formatGameDateTime(new Date(selectedGameType.nextGameDateTime).toISOString())}
                    </li>
                    <li>{translate('weeklyRepeat')}: {selectedGameType.repeatWeekly ? translate('yesLabel') : translate('noLabel')}</li>
                  </ul>
                ) : (
                  <p className="muted">{translate('noCustomRulesYet')}</p>
                )}
              </article>
            )}

            {activeTab === 'lottery' && (
              <article className="card full-width info-card">
                <div className="section-head">
                  <div>
                    <p className="section-kicker">Lottery Rotation</p>
                    <h2>{translate('lotteryWhoOutTitle')}</h2>
                  </div>
                </div>

                {lotteryOverview?.game ? (
                  <p className="muted roster-meta">
                    {lotteryOverview.game.title} | {formatGameDateTime(lotteryOverview.game.gameDate)} | {translate('registeredCount')} {lotteryOverview.game.playersCount}
                  </p>
                ) : (
                  <p className="muted roster-meta">{translate('noUpcomingLotteryGame')}</p>
                )}

                <ul className="players players-grid lottery-list">
                  {(lotteryOverview?.players || []).map((player) => (
                    <li key={player.id} className={player.isOutInCurrentLottery ? 'lottery-out' : ''}>
                      <span>
                        <strong>{player.name}</strong>
                        {' | '}{translate('benchedLabel')} {player.benchCount} {translate('timesLabel')}
                      </span>
                      <span className={`tag ${player.isOutInCurrentLottery ? 'tag-wait' : 'tag-play'}`}>
                        {player.isOutInCurrentLottery
                          ? translate('benchedCurrentRound')
                          : player.isRegisteredToCurrentGame
                            ? translate('playingCurrentRound')
                            : translate('notRegisteredCurrentGame')}
                      </span>
                    </li>
                  ))}
                </ul>
              </article>
            )}

            {activeTab === 'instructions' && (
              <article className="card full-width info-card">
                <div className="section-head">
                  <div>
                    <p className="section-kicker">Registration Guide</p>
                    <h2>{translate('registrationGuideTitle')}</h2>
                  </div>
                </div>
                <p className="muted">{translate('welcomeIntro')}</p>
                <ul className="instructions-list" style={{ marginBottom: 12 }}>
                  {welcomeGuideBullets.map((item, index) => (
                    <li key={`instructions-welcome-${index}`}>{item}</li>
                  ))}
                </ul>
                <p className="muted">{translate('registrationGuideIntro')}</p>
                <ol className="instructions-list">
                  {registrationGuideSteps.map((step, index) => (
                    <li key={`instructions-tab-step-${index}`}>{step}</li>
                  ))}
                </ol>
              </article>
            )}
          </>
        )}
      </section>

      {error && <section className="message message-error">{error}</section>}
      {success && <section className="message message-ok">{success}</section>}
    </main>
  )
}

export default App
