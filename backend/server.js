const cors = require('cors');
const dotenv = require('dotenv');
const express = require('express');
const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');
const webPush = require('web-push');

dotenv.config();

const PORT = Number(process.env.PORT || 8787);
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';
const DB_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DB_DIR, 'yomshishi.sqlite');
const APPROVED_EMAILS = (process.env.APPROVED_EMAILS || '')
  .split(',')
  .map((item) => item.trim().toLowerCase())
  .filter(Boolean);

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';
const REMINDER_SECRET = process.env.REMINDER_SECRET || '';

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

let db;

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

function nextFridayIso() {
  const current = new Date();
  const day = current.getDay();
  const targetDay = 5;
  const delta = (targetDay - day + 7) % 7 || 7;
  const target = new Date(current);
  target.setDate(current.getDate() + delta);
  target.setHours(21, 0, 0, 0);
  return target.toISOString();
}

function gameStatusByCount(totalPlayers, cancelled) {
  if (cancelled) return 'CANCELLED';
  if (totalPlayers === 12) return 'LOCKED';
  if (totalPlayers >= 10) return 'WAITING';
  if (totalPlayers >= 6) return 'CONFIRMED';
  return 'OPEN';
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

function ensureCurrentGame() {
  const existing = get(
    `SELECT id, game_date, status, is_cancelled
     FROM games
     WHERE is_cancelled = 0
     ORDER BY game_date ASC
     LIMIT 1`
  );

  if (existing) {
    return Number(existing.id);
  }

  run(
    `INSERT INTO games (game_date, status, is_cancelled, created_at, updated_at)
     VALUES (?, 'OPEN', 0, ?, ?)`,
    [nextFridayIso(), nowIso(), nowIso()]
  );

  const row = get('SELECT last_insert_rowid() AS id');
  persistDb();
  return Number(row.id);
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
  const game = get('SELECT is_cancelled FROM games WHERE id = ?', [gameId]);
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

  run('UPDATE games SET status = ?, updated_at = ? WHERE id = ?', [
    gameStatusByCount(totalPlayers, isCancelled),
    nowIso(),
    gameId,
  ]);

  persistDb();
}

function serializeGame(gameId, viewerUserId = null) {
  const game = get(
    `SELECT id, game_date, status, is_cancelled, created_at, updated_at
     FROM games
     WHERE id = ?`,
    [gameId]
  );

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

  const viewerPosition = viewerUserId
    ? players.find((player) => player.userId === Number(viewerUserId))?.position || null
    : null;

  const viewerRole = viewerUserId
    ? players.find((player) => player.userId === Number(viewerUserId))?.role || null
    : null;

  return {
    id: Number(game.id),
    gameDate: game.game_date,
    status: game.status,
    isCancelled: Number(game.is_cancelled) === 1,
    minPlayersForConfirmation: 6,
    maxPlayers: 12,
    playersCount: players.length,
    players,
    viewerPosition,
    viewerRole,
    createdAt: game.created_at,
    updatedAt: game.updated_at,
  };
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
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS games (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_date TEXT NOT NULL,
      status TEXT NOT NULL,
      is_cancelled INTEGER NOT NULL DEFAULT 0,
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

  ensureCurrentGame();
  persistDb();
}

async function startServer() {
  await bootstrapDatabase();

  const app = express();

  app.use(
    cors({
      origin: FRONTEND_ORIGIN,
      methods: ['GET', 'POST', 'OPTIONS'],
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
    });
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

    const existingUser = get('SELECT id, name, email FROM users WHERE email = ?', [email]);
    if (existingUser) {
      if (existingUser.name !== name) {
        run('UPDATE users SET name = ?, updated_at = ? WHERE id = ?', [
          name,
          nowIso(),
          existingUser.id,
        ]);
        persistDb();
      }
      const refreshed = get('SELECT id, name, email FROM users WHERE id = ?', [existingUser.id]);
      return res.json({ user: { id: Number(refreshed.id), name: refreshed.name, email: refreshed.email } });
    }

    run('INSERT INTO users (name, email, created_at, updated_at) VALUES (?, ?, ?, ?)', [
      name,
      email,
      nowIso(),
      nowIso(),
    ]);
    const row = get('SELECT last_insert_rowid() AS id');
    persistDb();

    const user = get('SELECT id, name, email FROM users WHERE id = ?', [row.id]);
    return res.status(201).json({ user: { id: Number(user.id), name: user.name, email: user.email } });
  });

  app.get('/api/users/:userId', (req, res) => {
    const userId = Number(req.params.userId);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ message: 'מזהה משתמש לא תקין.' });
    }
    const user = get('SELECT id, name, email FROM users WHERE id = ?', [userId]);
    if (!user) {
      return res.status(404).json({ message: 'משתמש לא נמצא.' });
    }
    return res.json({ user: { id: Number(user.id), name: user.name, email: user.email } });
  });

  app.get('/api/games/current', (req, res) => {
    const userId = req.query.userId ? Number(req.query.userId) : null;
    const gameId = ensureCurrentGame();
    recalculateGame(gameId);
    return res.json({ game: serializeGame(gameId, userId) });
  });

  app.post('/api/games/current/join', (req, res) => {
    const userId = Number(req.body?.userId);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ message: 'מזהה משתמש לא תקין.' });
    }

    const user = get('SELECT id FROM users WHERE id = ?', [userId]);
    if (!user) {
      return res.status(404).json({ message: 'משתמש לא נמצא.' });
    }

    const gameId = ensureCurrentGame();
    const currentGame = get('SELECT id, is_cancelled FROM games WHERE id = ?', [gameId]);
    if (Number(currentGame.is_cancelled) === 1) {
      return res.status(409).json({ message: 'המשחק בוטל ולא ניתן להצטרף.' });
    }

    const existing = get(
      'SELECT id FROM registrations WHERE game_id = ? AND user_id = ?',
      [gameId, userId]
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
      [gameId, userId, currentCount + 1, nowIso()]
    );

    recalculateGame(gameId);
    return res.status(201).json({ game: serializeGame(gameId, userId) });
  });

  app.post('/api/games/current/leave', (req, res) => {
    const userId = Number(req.body?.userId);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ message: 'מזהה משתמש לא תקין.' });
    }

    const gameId = ensureCurrentGame();
    const existing = get(
      'SELECT id FROM registrations WHERE game_id = ? AND user_id = ?',
      [gameId, userId]
    );
    if (!existing) {
      return res.status(409).json({ message: 'לא נמצאה הרשמה פעילה למשתמש הזה.' });
    }

    run('DELETE FROM registrations WHERE id = ?', [existing.id]);
    reorderPositions(gameId);
    recalculateGame(gameId);
    return res.json({ game: serializeGame(gameId, userId) });
  });

  app.post('/api/push/subscribe', (req, res) => {
    const userId = Number(req.body?.userId);
    const subscription = req.body?.subscription;

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ message: 'מזהה משתמש לא תקין.' });
    }
    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return res.status(400).json({ message: 'נתוני subscription לא תקינים.' });
    }

    const user = get('SELECT id FROM users WHERE id = ?', [userId]);
    if (!user) {
      return res.status(404).json({ message: 'משתמש לא נמצא.' });
    }

    const existing = get('SELECT id FROM push_subscriptions WHERE endpoint = ?', [subscription.endpoint]);
    if (existing) {
      run(
        `UPDATE push_subscriptions
         SET user_id = ?, p256dh = ?, auth = ?, payload = ?, updated_at = ?
         WHERE id = ?`,
        [
          userId,
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
          userId,
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

  app.post('/api/games/current/remind', async (req, res) => {
    const providedSecret = String(req.body?.secret || '');
    if (!REMINDER_SECRET || providedSecret !== REMINDER_SECRET) {
      return res.status(403).json({ message: 'הרשאה חסרה לשליחת תזכורת.' });
    }
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      return res.status(400).json({ message: 'VAPID אינו מוגדר בשרת.' });
    }

    const gameId = ensureCurrentGame();
    recalculateGame(gameId);
    const game = serializeGame(gameId);
    const playingUserIds = game.players
      .filter((player) => player.role === 'PLAYING')
      .map((player) => player.userId);

    if (!playingUserIds.length) {
      return res.json({ sent: 0, failed: 0 });
    }

    const placeholders = playingUserIds.map(() => '?').join(',');
    const subs = all(
      `SELECT id, payload
       FROM push_subscriptions
       WHERE user_id IN (${placeholders})`,
      playingUserIds
    );

    const title = String(req.body?.title || 'תזכורת למשחק יום שישי');
    const message = String(
      req.body?.message || 'המשחק מתקרב. נא לוודא הגעה בזמן.'
    );

    let sent = 0;
    let failed = 0;

    for (const sub of subs) {
      try {
        await webPush.sendNotification(
          JSON.parse(sub.payload),
          JSON.stringify({ title, message, gameDate: game.gameDate })
        );
        sent += 1;
      } catch (_error) {
        failed += 1;
      }
    }

    return res.json({ sent, failed });
  });

  app.use((_req, res) => {
    res.status(404).json({ message: 'Endpoint לא נמצא.' });
  });

  app.listen(PORT, () => {
    console.log(`API listening on http://localhost:${PORT}`);
  });
}

startServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
