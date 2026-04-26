const cors = require('cors');
const crypto = require('crypto');
const dotenv = require('dotenv');
const express = require('express');
const fs = require('fs');
const { OAuth2Client } = require('google-auth-library');
const path = require('path');
const initSqlJs = require('sql.js');
const webPush = require('web-push');

dotenv.config();

const PORT = Number(process.env.PORT || 8787);
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';
const FRONTEND_ORIGINS = FRONTEND_ORIGIN.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const DB_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DB_DIR, 'yomshishi.sqlite');
const FRONTEND_DIST_DIR = path.join(__dirname, '..', 'frontend', 'dist');
const APPROVED_EMAILS = (process.env.APPROVED_EMAILS || '')
  .split(',')
  .map((item) => item.trim().toLowerCase())
  .filter(Boolean);
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map((item) => item.trim().toLowerCase())
  .filter(Boolean);
const ADMIN_USERNAME = String(process.env.ADMIN_USERNAME || '').trim();
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || '').trim();
const ADMIN_TOKEN_TTL_MS = 1000 * 60 * 60 * 12;
const REGISTRATION_LEAD_HOURS = Number(process.env.REGISTRATION_LEAD_HOURS || 24);
const REGISTRATION_LEAD_MS = REGISTRATION_LEAD_HOURS * 60 * 60 * 1000;
const GOOGLE_CLIENT_ID = String(process.env.GOOGLE_CLIENT_ID || '').trim();

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';
const REMINDER_SECRET = process.env.REMINDER_SECRET || '';
const googleOAuthClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

let db;
let reminderInterval = null;
let reminderDispatchInFlight = false;
const adminSessions = new Map();

function all(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

function get(sql, params = []) {
  const rows = all(sql, params);
  return rows.length ? rows[0] : null;
}

function run(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  stmt.step();
  stmt.free();
}

function persistDb() {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }
  fs.writeFileSync(DB_FILE, Buffer.from(db.export()));
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function ensureApproved(email) {
  if (!APPROVED_EMAILS.length) {
    return {
      ok: false,
      message:
        'אין רשימת משתמשים מאושרת בשרת. יש להגדיר APPROVED_EMAILS בקובץ הסביבה.',
    };
  }
  if (!APPROVED_EMAILS.includes(normalizeEmail(email))) {
    return { ok: false, message: 'האימייל אינו בקבוצה הסגורה המאושרת.' };
  }
  return { ok: true };
}

function isAdminEmail(email) {
  return ADMIN_EMAILS.includes(normalizeEmail(email));
}

function splitName(fullName) {
  const normalized = String(fullName || '').trim().replace(/\s+/g, ' ');
  if (!normalized) {
    return { firstName: '', lastName: '' };
  }

  const parts = normalized.split(' ');
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: '' };
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  };
}

function composeDisplayName(firstName, lastName, fallback) {
  const full = `${String(firstName || '').trim()} ${String(lastName || '').trim()}`.trim();
  if (full) {
    return full;
  }

  return String(fallback || '').trim();
}

function clearExpiredAdminSessions() {
  const now = Date.now();
  for (const [token, session] of adminSessions.entries()) {
    if (!session || session.expiresAt <= now) {
      adminSessions.delete(token);
    }
  }
}

function issueAdminToken() {
  clearExpiredAdminSessions();
  const token = crypto.randomBytes(24).toString('hex');
  const expiresAt = Date.now() + ADMIN_TOKEN_TTL_MS;
  adminSessions.set(token, { expiresAt });
  return { token, expiresAt };
}

function isValidAdminToken(token) {
  clearExpiredAdminSessions();
  if (!token) {
    return false;
  }

  const session = adminSessions.get(String(token));
  if (!session) {
    return false;
  }

  return session.expiresAt > Date.now();
}

function parseDate(value) {
  const date = new Date(String(value || ''));
  return Number.isNaN(date.getTime()) ? null : date;
}

function registrationDeadlineIso(gameDate) {
  return new Date(new Date(gameDate).getTime() - REGISTRATION_LEAD_MS).toISOString();
}

function isRegistrationOpen(gameDate) {
  return Date.now() < new Date(registrationDeadlineIso(gameDate)).getTime();
}

function formatDateTime(dateValue) {
  return new Date(dateValue).toLocaleString('he-IL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function gameStatusByCount(totalPlayers, cancelled) {
  if (cancelled) return 'CANCELLED';
  if (totalPlayers === 12) return 'LOCKED';
  if (totalPlayers >= 10) return 'WAITING';
  if (totalPlayers >= 6) return 'CONFIRMED';
  return 'OPEN';
}

function ensureColumn(tableName, columnName, definition) {
  const columns = all(`PRAGMA table_info(${tableName})`);
  if (columns.some((column) => column.name === columnName)) {
    return;
  }

  run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
}

function getUserRow(userId) {
  return get(
    'SELECT id, name, email, first_name, last_name, profile_completed FROM users WHERE id = ?',
    [userId]
  );
}

function upsertUser(name, email, firstName = '', lastName = '') {
  const existingUser = get(
    'SELECT id, name, email, first_name, last_name, profile_completed FROM users WHERE email = ?',
    [email]
  );
  const mergedName = composeDisplayName(firstName, lastName, name);

  if (existingUser) {
    if (
      existingUser.name !== mergedName ||
      String(existingUser.first_name || '') !== String(firstName || '') ||
      String(existingUser.last_name || '') !== String(lastName || '')
    ) {
      run('UPDATE users SET name = ?, first_name = ?, last_name = ?, updated_at = ? WHERE id = ?', [
        mergedName,
        String(firstName || ''),
        String(lastName || ''),
        nowIso(),
        existingUser.id,
      ]);
      persistDb();
    }

    return getUserRow(Number(existingUser.id));
  }

  run(
    'INSERT INTO users (name, email, first_name, last_name, profile_completed, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)',
    [
      mergedName,
      email,
      String(firstName || ''),
      String(lastName || ''),
      nowIso(),
      nowIso(),
    ]
  );
  const row = get('SELECT last_insert_rowid() AS id');
  persistDb();
  return getUserRow(Number(row.id));
}

function serializeUser(user) {
  const firstName = String(user.first_name || '').trim();
  const lastName = String(user.last_name || '').trim();
  return {
    id: Number(user.id),
    name: composeDisplayName(firstName, lastName, user.name),
    firstName,
    lastName,
    profileCompleted: Number(user.profile_completed) === 1,
    email: user.email,
    isAdmin: isAdminEmail(user.email),
  };
}

function ensureProfileCompleted(user) {
  if (Number(user.profile_completed) === 1) {
    return { ok: true };
  }

  return {
    ok: false,
    message: 'לפני פעולת משחק יש להשלים שם פרטי ושם משפחה ולשמור.',
  };
}

function getRequester(userId) {
  if (!Number.isInteger(userId) || userId <= 0) {
    return { error: { status: 400, message: 'מזהה משתמש לא תקין.' } };
  }

  const user = getUserRow(userId);
  if (!user) {
    return { error: { status: 404, message: 'משתמש לא נמצא.' } };
  }

  return { user };
}

function ensureAdmin(userId, adminToken = '') {
  if (isValidAdminToken(adminToken)) {
    return {
      user: {
        id: 0,
        name: 'Admin',
        email: 'admin@local',
      },
    };
  }

  const requester = getRequester(userId);
  if (requester.error) {
    return requester;
  }

  if (!isAdminEmail(requester.user.email)) {
    return { error: { status: 403, message: 'רק אדמין יכול לבצע פעולה זו.' } };
  }

  return requester;
}

function getUpcomingGameId() {
  const row = get(
    `SELECT id
     FROM games
     WHERE is_cancelled = 0 AND game_date >= ?
     ORDER BY game_date ASC
     LIMIT 1`,
    [nowIso()]
  );

  return row ? Number(row.id) : null;
}

function getGameRow(gameId) {
  return get(
    `SELECT g.id,
            g.title,
            g.location,
            g.notes,
            g.game_date,
            g.status,
            g.is_cancelled,
            g.created_by_user_id,
            g.reminder_due_at,
            g.reminder_sent_at,
            g.created_at,
            g.updated_at,
            u.name AS created_by_name
     FROM games g
     LEFT JOIN users u ON u.id = g.created_by_user_id
     WHERE g.id = ?`,
    [gameId]
  );
}

function reorderPositions(gameId) {
  const rows = all(
    `SELECT id
     FROM registrations
     WHERE game_id = ?
     ORDER BY position ASC, joined_at ASC, id ASC`,
    [gameId]
  );

  rows.forEach((row, index) => {
    run('UPDATE registrations SET position = ? WHERE id = ?', [index + 1, row.id]);
  });
}

function recalculateGame(gameId) {
  const game = get('SELECT game_date, is_cancelled FROM games WHERE id = ?', [gameId]);
  if (!game) {
    return;
  }

  const registrations = all(
    `SELECT id, position
     FROM registrations
     WHERE game_id = ?
     ORDER BY position ASC, joined_at ASC, id ASC`,
    [gameId]
  );

  const totalPlayers = registrations.length;
  const isCancelled = Number(game.is_cancelled) === 1;

  registrations.forEach((item) => {
    const role = totalPlayers === 12 || Number(item.position) <= 9 ? 'PLAYING' : 'WAITING';
    run('UPDATE registrations SET role = ? WHERE id = ?', [role, item.id]);
  });

  run(
    `UPDATE games
     SET status = ?, reminder_due_at = ?, updated_at = ?
     WHERE id = ?`,
    [
      gameStatusByCount(totalPlayers, isCancelled),
      registrationDeadlineIso(game.game_date),
      nowIso(),
      gameId,
    ]
  );

  persistDb();
}

function serializeGame(gameId, viewerUserId = null) {
  const game = getGameRow(gameId);
  if (!game) {
    return null;
  }

  const players = all(
    `SELECT r.id AS registration_id,
            r.position,
            r.role,
            r.joined_at,
            u.id AS user_id,
            u.name,
            u.email
     FROM registrations r
     JOIN users u ON u.id = r.user_id
     WHERE r.game_id = ?
     ORDER BY r.position ASC`,
    [gameId]
  ).map((row) => ({
    registrationId: Number(row.registration_id),
    userId: Number(row.user_id),
    name: row.name,
    email: row.email,
    position: Number(row.position),
    role: row.role,
    joinedAt: row.joined_at,
  }));

  const viewerPlayer = viewerUserId
    ? players.find((player) => player.userId === Number(viewerUserId)) || null
    : null;

  return {
    id: Number(game.id),
    title: game.title || 'משחק 3x3',
    location: game.location || '',
    notes: game.notes || '',
    gameDate: game.game_date,
    status: game.status,
    isCancelled: Number(game.is_cancelled) === 1,
    minPlayersForConfirmation: 6,
    maxPlayers: 12,
    playersCount: players.length,
    players,
    viewerPosition: viewerPlayer?.position || null,
    viewerRole: viewerPlayer?.role || null,
    createdByUserId: game.created_by_user_id ? Number(game.created_by_user_id) : null,
    createdByName: game.created_by_name || '',
    registrationDeadline: registrationDeadlineIso(game.game_date),
    canRegister: isRegistrationOpen(game.game_date),
    isRegistrationClosed: !isRegistrationOpen(game.game_date),
    reminderDueAt: game.reminder_due_at || registrationDeadlineIso(game.game_date),
    reminderSentAt: game.reminder_sent_at || null,
    createdAt: game.created_at,
    updatedAt: game.updated_at,
  };
}

function validateGameInput(payload) {
  const title = String(payload?.title || '').trim() || 'משחק 3x3';
  const location = String(payload?.location || '').trim();
  const notes = String(payload?.notes || '').trim();
  const gameDate = parseDate(payload?.gameDate);

  if (!gameDate) {
    return { error: 'יש להזין תאריך ושעה תקינים למשחק.' };
  }

  if (gameDate.getTime() - Date.now() <= REGISTRATION_LEAD_MS) {
    return {
      error: `יש ליצור משחק לפחות ${REGISTRATION_LEAD_HOURS} שעות לפני מועד המשחק כדי לאפשר הרשמה בזמן.`,
    };
  }

  return {
    value: {
      title,
      location,
      notes,
      gameDate: gameDate.toISOString(),
    },
  };
}

async function sendPushNotification(subscriptionPayload, payload) {
  await webPush.sendNotification(subscriptionPayload, JSON.stringify(payload));
}

async function dispatchDueReminders(trigger) {
  if (reminderDispatchInFlight) {
    return { processedGames: 0, sent: 0, failed: 0, skipped: 'dispatch-in-flight' };
  }

  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return { processedGames: 0, sent: 0, failed: 0, skipped: 'vapid-not-configured' };
  }

  reminderDispatchInFlight = true;

  try {
    const dueGames = all(
      `SELECT id
       FROM games
       WHERE is_cancelled = 0
         AND reminder_sent_at IS NULL
         AND reminder_due_at IS NOT NULL
         AND reminder_due_at <= ?
         AND game_date > ?
       ORDER BY game_date ASC`,
      [nowIso(), nowIso()]
    );

    let processedGames = 0;
    let sent = 0;
    let failed = 0;

    for (const dueGame of dueGames) {
      const game = serializeGame(Number(dueGame.id));
      if (!game) {
        continue;
      }

      const subscriptions = all('SELECT id, payload FROM push_subscriptions ORDER BY id ASC');

      for (const subscription of subscriptions) {
        try {
          await sendPushNotification(JSON.parse(subscription.payload), {
            title: `נפתחה הרשמה: ${game.title}`,
            message: `${formatDateTime(game.gameDate)} ב${game.location || 'מיקום שייקבע'}. יש להירשם עד עכשיו.`,
            gameId: game.id,
            gameDate: game.gameDate,
          });
          sent += 1;
        } catch (_error) {
          failed += 1;
        }
      }

      const updatedAt = nowIso();
      run('UPDATE games SET reminder_sent_at = ?, updated_at = ? WHERE id = ?', [
        updatedAt,
        updatedAt,
        game.id,
      ]);
      processedGames += 1;
    }

    if (processedGames) {
      persistDb();
      console.log(`[reminders:${trigger}] processed=${processedGames} sent=${sent} failed=${failed}`);
    }

    return { processedGames, sent, failed };
  } finally {
    reminderDispatchInFlight = false;
  }
}

function startReminderScheduler() {
  if (reminderInterval) {
    clearInterval(reminderInterval);
  }

  reminderInterval = setInterval(() => {
    dispatchDueReminders('scheduler').catch((error) => {
      console.error('Reminder dispatch failed:', error);
    });
  }, 5 * 60 * 1000);

  dispatchDueReminders('startup').catch((error) => {
    console.error('Initial reminder dispatch failed:', error);
  });
}

async function bootstrapDatabase() {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  const SQL = await initSqlJs({
    locateFile: (fileName) => path.join(__dirname, 'node_modules', 'sql.js', 'dist', fileName),
  });

  if (fs.existsSync(DB_FILE)) {
    const fileBuffer = fs.readFileSync(DB_FILE);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      first_name TEXT NOT NULL DEFAULT '',
      last_name TEXT NOT NULL DEFAULT '',
      profile_completed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS games (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL DEFAULT 'משחק 3x3',
      location TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      game_date TEXT NOT NULL,
      status TEXT NOT NULL,
      is_cancelled INTEGER NOT NULL DEFAULT 0,
      created_by_user_id INTEGER,
      reminder_due_at TEXT,
      reminder_sent_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS registrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      position INTEGER NOT NULL,
      role TEXT NOT NULL,
      joined_at TEXT NOT NULL,
      UNIQUE(game_id, user_id),
      FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      endpoint TEXT NOT NULL UNIQUE,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  ensureColumn('games', 'title', "TEXT NOT NULL DEFAULT 'משחק 3x3'");
  ensureColumn('games', 'location', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('games', 'notes', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('games', 'created_by_user_id', 'INTEGER');
  ensureColumn('games', 'reminder_due_at', 'TEXT');
  ensureColumn('games', 'reminder_sent_at', 'TEXT');
  ensureColumn('users', 'first_name', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('users', 'last_name', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('users', 'profile_completed', 'INTEGER NOT NULL DEFAULT 0');

  const users = all('SELECT id, name, first_name, last_name FROM users');
  users.forEach((user) => {
    const existingFirst = String(user.first_name || '').trim();
    const existingLast = String(user.last_name || '').trim();
    if (existingFirst && existingLast) {
      return;
    }

    const split = splitName(user.name);
    run('UPDATE users SET first_name = ?, last_name = ?, updated_at = ? WHERE id = ?', [
      existingFirst || split.firstName,
      existingLast || split.lastName,
      nowIso(),
      user.id,
    ]);
  });

  run("UPDATE games SET title = COALESCE(NULLIF(title, ''), 'משחק 3x3')");
  run("UPDATE games SET location = COALESCE(location, '')");
  run("UPDATE games SET notes = COALESCE(notes, '')");

  const games = all('SELECT id, game_date FROM games');
  games.forEach((game) => {
    const updatedAt = nowIso();
    run(
      `UPDATE games
       SET reminder_due_at = COALESCE(reminder_due_at, ?),
           updated_at = COALESCE(updated_at, ?)
       WHERE id = ?`,
      [registrationDeadlineIso(game.game_date), updatedAt, game.id]
    );
    recalculateGame(Number(game.id));
  });

  persistDb();
}

async function startServer() {
  await bootstrapDatabase();

  const app = express();

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || FRONTEND_ORIGINS.includes(origin)) {
          callback(null, true);
          return;
        }

        callback(new Error('Origin not allowed by CORS'));
      },
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type'],
    })
  );
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, now: nowIso() });
  });

  app.get('/api/config', (_req, res) => {
    res.json({
      vapidPublicKey: VAPID_PUBLIC_KEY,
      closedGroupEnabled: true,
      registrationLeadHours: REGISTRATION_LEAD_HOURS,
      googleClientId: GOOGLE_CLIENT_ID,
      adminLoginEnabled: Boolean(ADMIN_USERNAME && ADMIN_PASSWORD),
    });
  });

  app.post('/api/admin/login', (req, res) => {
    if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
      return res.status(503).json({ message: 'כניסת אדמין אינה מוגדרת בשרת.' });
    }

    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '');
    if (!username || !password) {
      return res.status(400).json({ message: 'יש להזין שם משתמש וסיסמה.' });
    }

    if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
      return res.status(401).json({ message: 'פרטי אדמין שגויים.' });
    }

    const session = issueAdminToken();
    return res.json({
      token: session.token,
      expiresAt: new Date(session.expiresAt).toISOString(),
    });
  });

  app.post('/api/auth/google', async (req, res) => {
    const idToken = String(req.body?.idToken || '');
    if (!idToken) {
      return res.status(400).json({ message: 'חסר Google ID token.' });
    }
    if (!GOOGLE_CLIENT_ID || !googleOAuthClient) {
      return res.status(500).json({ message: 'Google Sign-In אינו מוגדר בשרת.' });
    }

    try {
      const ticket = await googleOAuthClient.verifyIdToken({
        idToken,
        audience: GOOGLE_CLIENT_ID,
      });
      const payload = ticket.getPayload();
      const email = normalizeEmail(payload?.email || '');
      const name = String(payload?.name || '').trim();
      const givenName = String(payload?.given_name || '').trim();
      const familyName = String(payload?.family_name || '').trim();
      const isEmailVerified = Boolean(payload?.email_verified);

      if (!email || !name || !isEmailVerified) {
        return res.status(403).json({ message: 'חשבון Google לא מאומת או חסרים פרטים.' });
      }

      const approved = ensureApproved(email);
      if (!approved.ok) {
        return res.status(403).json({ message: approved.message });
      }

      const split = splitName(name);
      const user = upsertUser(name, email, givenName || split.firstName, familyName || split.lastName);
      return res.json({ user: serializeUser(user) });
    } catch (_error) {
      return res.status(401).json({ message: 'אימות Google נכשל.' });
    }
  });

  app.patch('/api/users/:userId/profile', (req, res) => {
    const userId = Number(req.params.userId);
    const requester = getRequester(userId);
    if (requester.error) {
      return res.status(requester.error.status).json({ message: requester.error.message });
    }

    const firstName = String(req.body?.firstName || '').trim();
    const lastName = String(req.body?.lastName || '').trim();
    if (!firstName || !lastName) {
      return res.status(400).json({ message: 'יש להזין שם פרטי ושם משפחה.' });
    }

    const displayName = `${firstName} ${lastName}`.trim();
    run('UPDATE users SET first_name = ?, last_name = ?, name = ?, updated_at = ? WHERE id = ?', [
      firstName,
      lastName,
      displayName,
      nowIso(),
      requester.user.id,
    ]);
    run('UPDATE users SET profile_completed = 1, updated_at = ? WHERE id = ?', [
      nowIso(),
      requester.user.id,
    ]);
    persistDb();

    const updated = getUserRow(requester.user.id);
    return res.json({ user: serializeUser(updated) });
  });

  app.post('/api/auth/register', (req, res) => {
    const name = String(req.body?.name || '').trim();
    const email = normalizeEmail(req.body?.email || '');

    if (!name || !email) {
      return res.status(400).json({ message: 'יש להזין שם ואימייל.' });
    }

    const approved = ensureApproved(email);
    if (!approved.ok) {
      return res.status(403).json({ message: approved.message });
    }

    const user = upsertUser(name, email);
    return res.status(201).json({ user: serializeUser(user) });
  });

  app.get('/api/users/:userId', (req, res) => {
    const userId = Number(req.params.userId);
    const requester = getRequester(userId);
    if (requester.error) {
      return res.status(requester.error.status).json({ message: requester.error.message });
    }

    return res.json({ user: serializeUser(requester.user) });
  });

  app.get('/api/games/current', (req, res) => {
    const userId = req.query.userId ? Number(req.query.userId) : null;
    const gameId = getUpcomingGameId();

    if (!gameId) {
      return res.json({ game: null });
    }

    recalculateGame(gameId);
    return res.json({ game: serializeGame(gameId, userId) });
  });

  app.post('/api/games', (req, res) => {
    const userId = Number(req.body?.userId);
    const requester = getRequester(userId);
    if (requester.error) {
      return res.status(requester.error.status).json({ message: requester.error.message });
    }

    const profileCheck = ensureProfileCompleted(requester.user);
    if (!profileCheck.ok) {
      return res.status(409).json({ message: profileCheck.message });
    }

    if (getUpcomingGameId()) {
      return res.status(409).json({
        message: 'כבר קיים משחק פעיל במערכת. רק אדמין יכול לערוך או למחוק אותו.',
      });
    }

    const validated = validateGameInput(req.body);
    if (validated.error) {
      return res.status(400).json({ message: validated.error });
    }

    const createdAt = nowIso();
    run(
      `INSERT INTO games (
        title,
        location,
        notes,
        game_date,
        status,
        is_cancelled,
        created_by_user_id,
        reminder_due_at,
        reminder_sent_at,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, 'OPEN', 0, ?, ?, NULL, ?, ?)`,
      [
        validated.value.title,
        validated.value.location,
        validated.value.notes,
        validated.value.gameDate,
        requester.user.id,
        registrationDeadlineIso(validated.value.gameDate),
        createdAt,
        createdAt,
      ]
    );

    const row = get('SELECT last_insert_rowid() AS id');
    const gameId = Number(row.id);
    recalculateGame(gameId);
    return res.status(201).json({
      game: serializeGame(gameId, requester.user.id),
      message: 'המשחק נוצר. שים לב: גם מי שיצר את המשחק חייב להירשם אליו בנפרד.',
    });
  });

  app.patch('/api/games/:gameId', (req, res) => {
    const userId = Number(req.body?.userId);
    const requester = ensureAdmin(userId, String(req.body?.adminToken || ''));
    if (requester.error) {
      return res.status(requester.error.status).json({ message: requester.error.message });
    }

    const gameId = Number(req.params.gameId);
    if (!Number.isInteger(gameId) || gameId <= 0) {
      return res.status(400).json({ message: 'מזהה משחק לא תקין.' });
    }

    const existingGame = getGameRow(gameId);
    if (!existingGame) {
      return res.status(404).json({ message: 'משחק לא נמצא.' });
    }

    const validated = validateGameInput(req.body);
    if (validated.error) {
      return res.status(400).json({ message: validated.error });
    }

    run(
      `UPDATE games
       SET title = ?,
           location = ?,
           notes = ?,
           game_date = ?,
           reminder_due_at = ?,
           reminder_sent_at = NULL,
           updated_at = ?
       WHERE id = ?`,
      [
        validated.value.title,
        validated.value.location,
        validated.value.notes,
        validated.value.gameDate,
        registrationDeadlineIso(validated.value.gameDate),
        nowIso(),
        gameId,
      ]
    );

    recalculateGame(gameId);
    return res.json({ game: serializeGame(gameId, requester.user.id) });
  });

  app.delete('/api/games/:gameId', (req, res) => {
    const userId = Number(req.body?.userId);
    const requester = ensureAdmin(userId, String(req.body?.adminToken || ''));
    if (requester.error) {
      return res.status(requester.error.status).json({ message: requester.error.message });
    }

    const gameId = Number(req.params.gameId);
    if (!Number.isInteger(gameId) || gameId <= 0) {
      return res.status(400).json({ message: 'מזהה משחק לא תקין.' });
    }

    const existingGame = getGameRow(gameId);
    if (!existingGame) {
      return res.status(404).json({ message: 'משחק לא נמצא.' });
    }

    run('DELETE FROM games WHERE id = ?', [gameId]);
    persistDb();
    return res.json({ ok: true });
  });

  app.post('/api/games/current/join', (req, res) => {
    const userId = Number(req.body?.userId);
    const requester = getRequester(userId);
    if (requester.error) {
      return res.status(requester.error.status).json({ message: requester.error.message });
    }

    const profileCheck = ensureProfileCompleted(requester.user);
    if (!profileCheck.ok) {
      return res.status(409).json({ message: profileCheck.message });
    }

    const gameId = getUpcomingGameId();
    if (!gameId) {
      return res.status(404).json({ message: 'אין כרגע משחק פתוח להרשמה.' });
    }

    const currentGame = getGameRow(gameId);
    if (Number(currentGame.is_cancelled) === 1) {
      return res.status(409).json({ message: 'המשחק בוטל ולא ניתן להצטרף.' });
    }

    if (!isRegistrationOpen(currentGame.game_date)) {
      return res.status(409).json({
        message: `ההרשמה נסגרה ${REGISTRATION_LEAD_HOURS} שעות לפני מועד המשחק.`,
      });
    }

    const existing = get(
      'SELECT id FROM registrations WHERE game_id = ? AND user_id = ?',
      [gameId, requester.user.id]
    );
    if (existing) {
      return res.status(409).json({ message: 'כבר נרשמת למשחק.' });
    }

    const countRow = get('SELECT COUNT(*) AS count FROM registrations WHERE game_id = ?', [gameId]);
    const currentCount = Number(countRow.count);
    if (currentCount >= 12) {
      return res.status(409).json({ message: 'המשחק מלא (12 שחקנים).' });
    }

    run(
      `INSERT INTO registrations (game_id, user_id, position, role, joined_at)
       VALUES (?, ?, ?, 'WAITING', ?)`,
      [gameId, requester.user.id, currentCount + 1, nowIso()]
    );

    recalculateGame(gameId);
    return res.status(201).json({ game: serializeGame(gameId, requester.user.id) });
  });

  app.post('/api/games/current/leave', (req, res) => {
    const userId = Number(req.body?.userId);
    const requester = getRequester(userId);
    if (requester.error) {
      return res.status(requester.error.status).json({ message: requester.error.message });
    }

    const gameId = getUpcomingGameId();
    if (!gameId) {
      return res.status(404).json({ message: 'אין כרגע משחק פעיל להסרה.' });
    }

    const existing = get(
      'SELECT id FROM registrations WHERE game_id = ? AND user_id = ?',
      [gameId, requester.user.id]
    );
    if (!existing) {
      return res.status(409).json({ message: 'לא נמצאה הרשמה פעילה למשתמש הזה.' });
    }

    run('DELETE FROM registrations WHERE id = ?', [existing.id]);
    reorderPositions(gameId);
    recalculateGame(gameId);
    return res.json({ game: serializeGame(gameId, requester.user.id) });
  });

  app.post('/api/push/subscribe', (req, res) => {
    const userId = Number(req.body?.userId);
    const subscription = req.body?.subscription;

    const requester = getRequester(userId);
    if (requester.error) {
      return res.status(requester.error.status).json({ message: requester.error.message });
    }
    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return res.status(400).json({ message: 'נתוני subscription לא תקינים.' });
    }

    const existing = get('SELECT id FROM push_subscriptions WHERE endpoint = ?', [subscription.endpoint]);
    if (existing) {
      run(
        `UPDATE push_subscriptions
         SET user_id = ?, p256dh = ?, auth = ?, payload = ?, updated_at = ?
         WHERE id = ?`,
        [
          requester.user.id,
          subscription.keys.p256dh,
          subscription.keys.auth,
          JSON.stringify(subscription),
          nowIso(),
          existing.id,
        ]
      );
    } else {
      run(
        `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, payload, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          requester.user.id,
          subscription.endpoint,
          subscription.keys.p256dh,
          subscription.keys.auth,
          JSON.stringify(subscription),
          nowIso(),
          nowIso(),
        ]
      );
    }

    persistDb();
    return res.status(201).json({ ok: true });
  });

  app.post('/api/reminders/dispatch', async (req, res) => {
    const providedSecret = String(req.body?.secret || '');
    if (!REMINDER_SECRET || providedSecret !== REMINDER_SECRET) {
      return res.status(403).json({ message: 'הרשאה חסרה לשליחת תזכורות.' });
    }

    const result = await dispatchDueReminders('manual');
    return res.json(result);
  });

  if (fs.existsSync(FRONTEND_DIST_DIR)) {
    app.use(express.static(FRONTEND_DIST_DIR));

    app.get(/^(?!\/api).*/, (_req, res) => {
      res.sendFile(path.join(FRONTEND_DIST_DIR, 'index.html'));
    });
  }

  app.use((error, _req, res, next) => {
    if (error?.message === 'Origin not allowed by CORS') {
      return res.status(403).json({ message: 'Origin not allowed by CORS' });
    }

    return next(error);
  });

  app.use((_req, res) => {
    res.status(404).json({ message: 'Endpoint לא נמצא.' });
  });

  app.listen(PORT, () => {
    console.log(`API listening on http://localhost:${PORT}`);
  });

  startReminderScheduler();
}

startServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
