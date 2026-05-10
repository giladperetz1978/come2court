const cors = require('cors');
const crypto = require('crypto');
const dotenv = require('dotenv');
const express = require('express');
const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

dotenv.config();

const PORT = Number(process.env.PORT || 8787);
const DEFAULT_LOCAL_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  `http://localhost:${PORT}`,
  `http://127.0.0.1:${PORT}`,
];
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || DEFAULT_LOCAL_ORIGINS.join(',');
const FRONTEND_ORIGINS = Array.from(
  new Set(
    FRONTEND_ORIGIN.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean)
      .concat(DEFAULT_LOCAL_ORIGINS)
  )
);
const DB_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DB_DIR, 'yomshishi.sqlite');
const FRONTEND_DIST_DIR = path.join(__dirname, '..', 'frontend', 'dist');
const ADMIN_USERNAME = String(process.env.ADMIN_USERNAME || '').trim();
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || '').trim();
const ADMIN_TOKEN_TTL_MS = 1000 * 60 * 60 * 12;
const REGISTRATION_LOCK_HOUR = Number(process.env.REGISTRATION_LOCK_HOUR || 20);
const MAX_ACTIVE_GAMES = 2;

let db;
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

function parseDate(value) {
  const date = new Date(String(value || ''));
  return Number.isNaN(date.getTime()) ? null : date;
}

function registrationDeadlineIso(gameDate) {
  const game = new Date(gameDate);
  const deadline = new Date(game);
  deadline.setDate(deadline.getDate() - 1);
  deadline.setHours(REGISTRATION_LOCK_HOUR, 0, 0, 0);
  return deadline.toISOString();
}

function isRegistrationOpen(gameDate) {
  return Date.now() < new Date(registrationDeadlineIso(gameDate)).getTime();
}

function gameStatusByCount(totalPlayers, cancelled) {
  if (cancelled) return 'CANCELLED';
  if (totalPlayers >= 13 || totalPlayers === 10 || totalPlayers === 11) return 'WAITING';
  if (totalPlayers === 12) return 'LOCKED';
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

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const iterations = 100000;
  const hash = crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256').toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash) {
    return false;
  }
  const [salt, hash] = storedHash.split(':');
  if (!salt || !hash) {
    return false;
  }
  const iterations = 100000;
  const testHash = crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256').toString('hex');
  return testHash === hash;
}

function getSetting(key) {
  const row = get('SELECT value FROM app_settings WHERE key = ?', [key]);
  return row ? String(row.value || '') : '';
}

function setSetting(key, value) {
  run(
    `INSERT INTO app_settings (key, value)
     VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [String(key), String(value)]
  );
}

function getConfiguredAdminCredentials() {
  const storedUsername = getSetting('admin_username').trim();
  const storedPasswordHash = getSetting('admin_password_hash').trim();

  if (storedUsername && storedPasswordHash) {
    return {
      username: storedUsername,
      passwordHash: storedPasswordHash,
      source: 'db',
    };
  }

  if (ADMIN_USERNAME && ADMIN_PASSWORD) {
    return {
      username: ADMIN_USERNAME,
      password: ADMIN_PASSWORD,
      source: 'env',
    };
  }

  return null;
}

function composeDisplayName(firstName, lastName, fallback) {
  const normalizedFirstName = String(firstName || '').trim();
  const normalizedLastName = String(lastName || '').trim();
  const normalizedFallback = String(fallback || '').trim();

  if (normalizedFirstName && normalizedLastName) {
    return `${normalizedFirstName} ${normalizedLastName}`.trim();
  }

  if (normalizedFallback) {
    return normalizedFallback;
  }

  return `${normalizedFirstName} ${normalizedLastName}`.trim();
}

function getUserRow(userId) {
  return get(
    'SELECT id, name, email, first_name, last_name, password_hash, profile_completed, is_active FROM users WHERE id = ?',
    [userId]
  );
}

function getActivePlayerRows() {
  return all(
    `SELECT id, name, email, first_name, last_name, profile_completed, is_active
     FROM users
     WHERE is_active = 1
     ORDER BY name COLLATE NOCASE ASC, id ASC`
  );
}

function createLocalEmailForPlayer() {
  return `player-${Date.now()}-${Math.floor(Math.random() * 1000000)}@local`;
}

function createPlayer(name) {
  const displayName = String(name || '').trim().replace(/\s+/g, ' ');
  if (!displayName) {
    return { error: 'יש להזין שם שחקן.' };
  }

  const [firstToken = displayName, ...restTokens] = displayName.split(' ');
  const lastToken = restTokens.join(' ').trim();
  run(
    `INSERT INTO users (name, email, first_name, last_name, profile_completed, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, 1, 1, ?, ?)`,
    [displayName, createLocalEmailForPlayer(), firstToken, lastToken, nowIso(), nowIso()]
  );
  const row = get('SELECT last_insert_rowid() AS id');
  return { user: getUserRow(Number(row.id)) };
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
    isAdmin: false,
    isActive: Number(user.is_active) === 1,
  };
}

function getRequester(userId) {
  if (!Number.isInteger(userId) || userId <= 0) {
    return { error: { status: 400, message: 'מזהה משתמש לא תקין.' } };
  }

  const user = getUserRow(userId);
  if (!user || Number(user.is_active) !== 1) {
    return { error: { status: 404, message: 'שחקן לא נמצא או לא פעיל.' } };
  }

  return { user };
}

function ensureAdmin(userId, adminToken = '') {
  if (isValidAdminToken(adminToken)) {
    return {
      user: {
        id: 0,
        name: 'Admin',
      },
    };
  }

  const requester = getRequester(userId);
  if (requester.error) {
    return requester;
  }

  return { error: { status: 403, message: 'נדרשת כניסת אדמין.' } };
}

function getUpcomingGameIds(limit = MAX_ACTIVE_GAMES) {
  const rows = all(
    `SELECT id
     FROM games
     WHERE is_cancelled = 0 AND game_date >= ?
     ORDER BY game_date ASC
     LIMIT ?`,
    [nowIso(), limit]
  );

  return rows.map((row) => Number(row.id));
}

function getUpcomingGameId() {
  const ids = getUpcomingGameIds(1);
  return ids.length ? ids[0] : null;
}

function getUpcomingGames(viewerUserId = null, limit = MAX_ACTIVE_GAMES) {
  const gameIds = getUpcomingGameIds(limit);
  return gameIds.map((gameId) => serializeGame(gameId, viewerUserId)).filter(Boolean);
}

function getUpcomingGamesCount() {
  const row = get(
    `SELECT COUNT(*) AS count
     FROM games
     WHERE is_cancelled = 0 AND game_date >= ?`,
    [nowIso()]
  );

  return row ? Number(row.count) : 0;
}

function getGameRow(gameId) {
  return get(
    `SELECT id,
            title,
            location,
            notes,
            game_date,
            status,
            is_cancelled,
            created_by_user_id,
            created_at,
            updated_at,
            lottery_signature
     FROM games
     WHERE id = ?`,
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

function shuffle(array) {
  const items = [...array];
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const temp = items[index];
    items[index] = items[swapIndex];
    items[swapIndex] = temp;
  }
  return items;
}

function pickBenchedUsersByRotation(candidateUserIds, benchCount) {
  if (!candidateUserIds.length || benchCount <= 0) {
    return [];
  }

  const stats = new Map();
  candidateUserIds.forEach((userId) => {
    const row = get('SELECT bench_count FROM lottery_stats WHERE user_id = ?', [userId]);
    stats.set(userId, row ? Number(row.bench_count) : 0);
  });

  const picked = [];
  const pool = [...candidateUserIds];

  while (picked.length < benchCount && pool.length > 0) {
    let minBench = Number.MAX_SAFE_INTEGER;
    pool.forEach((userId) => {
      minBench = Math.min(minBench, Number(stats.get(userId) || 0));
    });

    const tier = pool.filter((userId) => Number(stats.get(userId) || 0) === minBench);
    const randomizedTier = shuffle(tier);
    const needed = benchCount - picked.length;
    const toTake = randomizedTier.slice(0, needed);

    toTake.forEach((userId) => {
      picked.push(userId);
      const index = pool.indexOf(userId);
      if (index >= 0) {
        pool.splice(index, 1);
      }
    });
  }

  picked.forEach((userId) => {
    const existing = get('SELECT user_id, bench_count FROM lottery_stats WHERE user_id = ?', [userId]);
    if (existing) {
      run('UPDATE lottery_stats SET bench_count = ?, updated_at = ? WHERE user_id = ?', [
        Number(existing.bench_count) + 1,
        nowIso(),
        userId,
      ]);
    } else {
      run(
        'INSERT INTO lottery_stats (user_id, bench_count, created_at, updated_at) VALUES (?, 1, ?, ?)',
        [userId, nowIso(), nowIso()]
      );
    }
  });

  return picked;
}

function resolveLottery(registrations, shouldRunLottery) {
  if (!shouldRunLottery) {
    return { benchCount: 0, candidateUserIds: [] };
  }

  const totalPlayers = registrations.length;
  if (totalPlayers <= 9 || totalPlayers === 12) {
    return { benchCount: 0, candidateUserIds: [] };
  }

  if (totalPlayers === 10) {
    return {
      benchCount: 1,
      candidateUserIds: registrations.map((item) => Number(item.user_id)),
    };
  }

  if (totalPlayers === 11) {
    return {
      benchCount: 2,
      candidateUserIds: registrations.map((item) => Number(item.user_id)),
    };
  }

  const extras = registrations.filter((item) => Number(item.position) >= 13);
  return {
    benchCount: totalPlayers - 12,
    candidateUserIds: extras.map((item) => Number(item.user_id)),
  };
}

function recalculateGame(gameId) {
  const game = get('SELECT id, game_date, is_cancelled, lottery_signature FROM games WHERE id = ?', [gameId]);
  if (!game) {
    return;
  }

  const registrations = all(
    `SELECT id, user_id, position
     FROM registrations
     WHERE game_id = ?
     ORDER BY position ASC, joined_at ASC, id ASC`,
    [gameId]
  );

  const totalPlayers = registrations.length;
  const isCancelled = Number(game.is_cancelled) === 1;
  const shouldRunLottery = !isRegistrationOpen(game.game_date);
  const lotteryPlan = resolveLottery(registrations, shouldRunLottery);
  const signature = `${registrations.map((item) => Number(item.user_id)).join(',')}|${lotteryPlan.benchCount}|${lotteryPlan.candidateUserIds.join(',')}`;

  let benchedUserIds = [];

  if (lotteryPlan.benchCount > 0) {
    const existing = all('SELECT user_id FROM game_lottery WHERE game_id = ? ORDER BY user_id ASC', [gameId]).map(
      (row) => Number(row.user_id)
    );

    const canReuseExisting =
      String(game.lottery_signature || '') === signature &&
      existing.length === lotteryPlan.benchCount &&
      existing.every((userId) => lotteryPlan.candidateUserIds.includes(userId));

    if (canReuseExisting) {
      benchedUserIds = existing;
    } else {
      benchedUserIds = pickBenchedUsersByRotation(lotteryPlan.candidateUserIds, lotteryPlan.benchCount);
      run('DELETE FROM game_lottery WHERE game_id = ?', [gameId]);
      benchedUserIds.forEach((userId) => {
        run('INSERT INTO game_lottery (game_id, user_id, created_at) VALUES (?, ?, ?)', [gameId, userId, nowIso()]);
      });
    }
  } else {
    run('DELETE FROM game_lottery WHERE game_id = ?', [gameId]);
    benchedUserIds = [];
  }

  registrations.forEach((item) => {
    const role = benchedUserIds.includes(Number(item.user_id)) ? 'WAITING' : 'PLAYING';
    run('UPDATE registrations SET role = ? WHERE id = ?', [role, item.id]);
  });

  run(
    `UPDATE games
     SET status = ?, lottery_signature = ?, updated_at = ?
     WHERE id = ?`,
    [gameStatusByCount(totalPlayers, isCancelled), lotteryPlan.benchCount > 0 ? signature : '', nowIso(), gameId]
  );

  persistDb();
}

function recalculateLockedGames() {
  const gameIds = getUpcomingGameIds(MAX_ACTIVE_GAMES);
  gameIds.forEach((gameId) => {
    const game = getGameRow(gameId);
    if (!game) {
      return;
    }

    if (!isRegistrationOpen(game.game_date)) {
      recalculateGame(gameId);
    }
  });
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
            u.name
     FROM registrations r
     JOIN users u ON u.id = r.user_id
     WHERE r.game_id = ?
     ORDER BY r.position ASC`,
    [gameId]
  ).map((row) => ({
    registrationId: Number(row.registration_id),
    userId: Number(row.user_id),
    name: row.name,
    email: '',
    position: Number(row.position),
    role: row.role,
    joinedAt: row.joined_at,
  }));

  const viewerPlayer = viewerUserId
    ? players.find((player) => player.userId === Number(viewerUserId)) || null
    : null;

  return {
    id: Number(game.id),
    title: game.title || 'משחק שישי',
    location: game.location || '',
    notes: game.notes || '',
    gameDate: game.game_date,
    status: game.status,
    isCancelled: Number(game.is_cancelled) === 1,
    minPlayersForConfirmation: 6,
    maxPlayers: 999,
    playersCount: players.length,
    players,
    viewerPosition: viewerPlayer?.position || null,
    viewerRole: viewerPlayer?.role || null,
    createdByUserId: game.created_by_user_id ? Number(game.created_by_user_id) : null,
    createdByName: 'אדמין',
    registrationDeadline: registrationDeadlineIso(game.game_date),
    canRegister: isRegistrationOpen(game.game_date),
    isRegistrationClosed: !isRegistrationOpen(game.game_date),
    reminderDueAt: registrationDeadlineIso(game.game_date),
    reminderSentAt: null,
    createdAt: game.created_at,
    updatedAt: game.updated_at,
  };
}

function getLotteryOverview() {
  const currentGameId = getUpcomingGameId();
  const currentGame = currentGameId ? serializeGame(currentGameId, null) : null;
  const roleByUserId = new Map();

  if (currentGameId) {
    const rows = all(
      `SELECT user_id, role
       FROM registrations
       WHERE game_id = ?`,
      [currentGameId]
    );

    rows.forEach((row) => {
      roleByUserId.set(Number(row.user_id), String(row.role || ''));
    });
  }

  const players = all(
    `SELECT u.id, u.name, COALESCE(ls.bench_count, 0) AS bench_count
     FROM users u
     LEFT JOIN lottery_stats ls ON ls.user_id = u.id
     WHERE u.is_active = 1
     ORDER BY u.name COLLATE NOCASE ASC, u.id ASC`
  ).map((row) => {
    const userId = Number(row.id);
    const role = roleByUserId.get(userId) || null;
    return {
      id: userId,
      name: row.name,
      benchCount: Number(row.bench_count),
      isRegisteredToCurrentGame: role !== null,
      role,
      isOutInCurrentLottery: role === 'WAITING',
    };
  });

  return {
    game: currentGame
      ? {
          id: currentGame.id,
          title: currentGame.title,
          gameDate: currentGame.gameDate,
          registrationDeadline: currentGame.registrationDeadline,
          status: currentGame.status,
          playersCount: currentGame.playersCount,
        }
      : null,
    players,
  };
}

function validateGameInput(payload) {
  const title = String(payload?.title || '').trim() || 'משחק שישי';
  const location = String(payload?.location || '').trim();
  const notes = String(payload?.notes || '').trim();
  const gameDate = parseDate(payload?.gameDate);

  if (!gameDate) {
    return { error: 'יש להזין תאריך ושעה תקינים למשחק.' };
  }

  if (Date.now() >= new Date(registrationDeadlineIso(gameDate.toISOString())).getTime()) {
    return {
      error: `יש ליצור משחק לפני מועד הנעילה: יום קודם בשעה ${String(REGISTRATION_LOCK_HOUR).padStart(2, '0')}:00.`,
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
      password_hash TEXT,
      profile_completed INTEGER NOT NULL DEFAULT 1,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS games (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL DEFAULT 'Come 2 Court Game',
      location TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      game_date TEXT NOT NULL,
      status TEXT NOT NULL,
      is_cancelled INTEGER NOT NULL DEFAULT 0,
      created_by_user_id INTEGER,
      lottery_signature TEXT NOT NULL DEFAULT '',
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

    CREATE TABLE IF NOT EXISTS game_lottery (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(game_id, user_id),
      FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS lottery_stats (
      user_id INTEGER PRIMARY KEY,
      bench_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  ensureColumn('users', 'first_name', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('users', 'last_name', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('users', 'password_hash', 'TEXT');
  ensureColumn('users', 'profile_completed', 'INTEGER NOT NULL DEFAULT 1');
  ensureColumn('users', 'is_active', 'INTEGER NOT NULL DEFAULT 1');
  ensureColumn('users', 'approval_status', "TEXT NOT NULL DEFAULT 'pending'");

  ensureColumn('games', 'title', "TEXT NOT NULL DEFAULT 'Come 2 Court Game'");
  ensureColumn('games', 'location', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('games', 'notes', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('games', 'created_by_user_id', 'INTEGER');
  ensureColumn('games', 'lottery_signature', "TEXT NOT NULL DEFAULT ''");

  const games = all('SELECT id FROM games');
  games.forEach((game) => {
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
    const credentials = getConfiguredAdminCredentials();
    res.json({
      vapidPublicKey: '',
      closedGroupEnabled: false,
      registrationLeadHours: 0,
      registrationLockHour: REGISTRATION_LOCK_HOUR,
      googleClientId: '',
      adminLoginEnabled: Boolean(credentials),
    });
  });

  app.post('/api/admin/bootstrap', (req, res) => {
    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '').trim();

    if (!username) {
      return res.status(400).json({ message: 'יש להזין שם משתמש לאדמין.' });
    }

    if (password.length < 4) {
      return res.status(400).json({ message: 'סיסמת אדמין חייבת להכיל לפחות 4 תווים.' });
    }

    const passwordHash = hashPassword(password);
    setSetting('admin_username', username);
    setSetting('admin_password_hash', passwordHash);
    persistDb();

    return res.status(201).json({ ok: true });
  });

  app.post('/api/admin/login', (req, res) => {
    const credentials = getConfiguredAdminCredentials();
    if (!credentials) {
      return res.status(503).json({ message: 'כניסת אדמין אינה מוגדרת בשרת.' });
    }

    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '');
    if (!username || !password) {
      return res.status(400).json({ message: 'יש להזין שם משתמש וסיסמה.' });
    }

    if (username !== credentials.username) {
      return res.status(401).json({ message: 'פרטי אדמין שגויים.' });
    }

    const isValidPassword =
      credentials.source === 'db'
        ? verifyPassword(password, credentials.passwordHash)
        : password === credentials.password;

    if (!isValidPassword) {
      return res.status(401).json({ message: 'פרטי אדמין שגויים.' });
    }

    const session = issueAdminToken();
    return res.json({
      token: session.token,
      expiresAt: new Date(session.expiresAt).toISOString(),
    });
  });

  app.get('/api/players/active', (_req, res) => {
    const players = getActivePlayerRows().map((user) => ({ id: Number(user.id), name: user.name }));
    return res.json({ players });
  });

  app.get('/api/lottery/overview', (_req, res) => {
    return res.json(getLotteryOverview());
  });

  app.post('/api/auth/select-player', (req, res) => {
    const playerId = Number(req.body?.playerId);
    const confirmed = Boolean(req.body?.confirmed);
    const password = String(req.body?.password || '').trim();

    if (!confirmed) {
      return res.status(400).json({ message: 'יש לאשר את ההרשמה בשם השחקן שנבחר.' });
    }

    if (!Number.isInteger(playerId) || playerId <= 0) {
      return res.status(400).json({ message: 'מזהה שחקן לא תקין.' });
    }

    const player = getUserRow(playerId);
    if (!player || Number(player.is_active) !== 1) {
      return res.status(404).json({ message: 'השחקן לא נמצא ברשימת הפעילים.' });
    }

    // If player has a password set, require password verification
    if (player.password_hash) {
      if (!password) {
        return res.status(401).json({ message: 'נדרשת סיסמה להתחברות.' });
      }
      if (!verifyPassword(password, player.password_hash)) {
        return res.status(401).json({ message: 'סיסמה שגויה.' });
      }
    }

    return res.json({ user: serializeUser(player) });
  });

  app.get('/api/users/:userId', (req, res) => {
    const userId = Number(req.params.userId);
    const requester = getRequester(userId);
    if (requester.error) {
      return res.status(requester.error.status).json({ message: requester.error.message });
    }

    return res.json({ user: serializeUser(requester.user) });
  });

  app.get('/api/admin/players', (req, res) => {
    const requester = ensureAdmin(Number(req.query.userId || 0), String(req.query.adminToken || ''));
    if (requester.error) {
      return res.status(requester.error.status).json({ message: requester.error.message });
    }

    const players = all(
      `SELECT id, name, approval_status, created_at
       FROM users
       ORDER BY approval_status DESC, name COLLATE NOCASE ASC, id ASC`
    ).map((row) => ({
      id: Number(row.id),
      name: row.name,
      status: String(row.approval_status || 'pending'),
      createdAt: row.created_at,
    }));

    return res.json({ players });
  });

  app.post('/api/admin/players', (req, res) => {
    const requester = ensureAdmin(Number(req.body?.userId || 0), String(req.body?.adminToken || ''));
    if (requester.error) {
      return res.status(requester.error.status).json({ message: requester.error.message });
    }

    const created = createPlayer(req.body?.name);
    if (created.error) {
      return res.status(400).json({ message: created.error });
    }

    persistDb();
    return res.status(201).json({ player: { id: Number(created.user.id), name: created.user.name } });
  });

  app.delete('/api/admin/players/:playerId', (req, res) => {
    const requester = ensureAdmin(Number(req.body?.userId || 0), String(req.body?.adminToken || ''));
    if (requester.error) {
      return res.status(requester.error.status).json({ message: requester.error.message });
    }

    const playerId = Number(req.params.playerId);
    if (!Number.isInteger(playerId) || playerId <= 0) {
      return res.status(400).json({ message: 'מזהה שחקן לא תקין.' });
    }

    const existing = get('SELECT id FROM users WHERE id = ?', [playerId]);
    if (!existing) {
      return res.status(404).json({ message: 'השחקן לא נמצא.' });
    }

    // When deleting, move back to pending status instead of marking inactive
    run('UPDATE users SET approval_status = ?, updated_at = ? WHERE id = ?', ['pending', nowIso(), playerId]);
    persistDb();
    return res.json({ ok: true });
  });

  app.post('/api/admin/players/:playerId/password', (req, res) => {
    const requester = ensureAdmin(Number(req.body?.userId || 0), String(req.body?.adminToken || ''));
    if (requester.error) {
      return res.status(requester.error.status).json({ message: requester.error.message });
    }

    const playerId = Number(req.params.playerId);
    const newPassword = String(req.body?.password || '').trim();

    if (!Number.isInteger(playerId) || playerId <= 0) {
      return res.status(400).json({ message: 'מזהה שחקן לא תקין.' });
    }

    if (!newPassword) {
      return res.status(400).json({ message: 'יש להזין סיסמה.' });
    }

    const existing = get('SELECT id FROM users WHERE id = ?', [playerId]);
    if (!existing) {
      return res.status(404).json({ message: 'השחקן לא נמצא.' });
    }

    const passwordHash = hashPassword(newPassword);
    run('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', [passwordHash, nowIso(), playerId]);
    persistDb();
    return res.json({ ok: true });
  });

  app.post('/api/admin/players/:playerId/approve', (req, res) => {
    const requester = ensureAdmin(Number(req.body?.userId || 0), String(req.body?.adminToken || ''));
    if (requester.error) {
      return res.status(requester.error.status).json({ message: requester.error.message });
    }

    const playerId = Number(req.params.playerId);
    if (!Number.isInteger(playerId) || playerId <= 0) {
      return res.status(400).json({ message: 'מזהה שחקן לא תקין.' });
    }

    const existing = get('SELECT id FROM users WHERE id = ?', [playerId]);
    if (!existing) {
      return res.status(404).json({ message: 'השחקן לא נמצא.' });
    }

    run('UPDATE users SET approval_status = ?, is_active = 1, updated_at = ? WHERE id = ?', ['active', nowIso(), playerId]);
    persistDb();
    return res.json({ ok: true });
  });

  app.post('/api/admin/players/:playerId/reject', (req, res) => {
    const requester = ensureAdmin(Number(req.body?.userId || 0), String(req.body?.adminToken || ''));
    if (requester.error) {
      return res.status(requester.error.status).json({ message: requester.error.message });
    }

    const playerId = Number(req.params.playerId);
    if (!Number.isInteger(playerId) || playerId <= 0) {
      return res.status(400).json({ message: 'מזהה שחקן לא תקין.' });
    }

    const existing = get('SELECT id FROM users WHERE id = ?', [playerId]);
    if (!existing) {
      return res.status(404).json({ message: 'השחקן לא נמצא.' });
    }

    // Rejecting keeps the user in pending status
    run('UPDATE users SET approval_status = ?, updated_at = ? WHERE id = ?', ['pending', nowIso(), playerId]);
    persistDb();
    return res.json({ ok: true });
  });

  app.post('/api/admin/players/:playerId/block', (req, res) => {
    const requester = ensureAdmin(Number(req.body?.userId || 0), String(req.body?.adminToken || ''));
    if (requester.error) {
      return res.status(requester.error.status).json({ message: requester.error.message });
    }

    const playerId = Number(req.params.playerId);
    if (!Number.isInteger(playerId) || playerId <= 0) {
      return res.status(400).json({ message: 'מזהה שחקן לא תקין.' });
    }

    const existing = get('SELECT id FROM users WHERE id = ?', [playerId]);
    if (!existing) {
      return res.status(404).json({ message: 'השחקן לא נמצא.' });
    }

    run('UPDATE users SET approval_status = ?, updated_at = ? WHERE id = ?', ['blocked', nowIso(), playerId]);
    persistDb();
    return res.json({ ok: true });
  });

  app.get('/api/games/current', (req, res) => {
    const userId = req.query.userId ? Number(req.query.userId) : null;
    const gameId = getUpcomingGameId();
    if (!gameId) {
      return res.json({ game: null });
    }

    return res.json({ game: serializeGame(gameId, userId) });
  });

  app.get('/api/games/upcoming', (req, res) => {
    const userId = req.query.userId ? Number(req.query.userId) : null;
    return res.json({
      games: getUpcomingGames(userId, MAX_ACTIVE_GAMES),
      maxActiveGames: MAX_ACTIVE_GAMES,
    });
  });

  app.post('/api/games', (req, res) => {
    const requester = ensureAdmin(Number(req.body?.userId || 0), String(req.body?.adminToken || ''));
    if (requester.error) {
      return res.status(requester.error.status).json({ message: requester.error.message });
    }

    if (getUpcomingGamesCount() >= MAX_ACTIVE_GAMES) {
      return res.status(409).json({
        message: `ניתן להחזיק עד ${MAX_ACTIVE_GAMES} משחקים פעילים עתידיים במקביל.`,
      });
    }

    const validated = validateGameInput(req.body);
    if (validated.error) {
      return res.status(400).json({ message: validated.error });
    }

    const createdAt = nowIso();
    run(
      `INSERT INTO games (title, location, notes, game_date, status, is_cancelled, created_by_user_id, lottery_signature, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'OPEN', 0, NULL, '', ?, ?)`,
      [validated.value.title, validated.value.location, validated.value.notes, validated.value.gameDate, createdAt, createdAt]
    );

    const row = get('SELECT last_insert_rowid() AS id');
    const gameId = Number(row.id);
    recalculateGame(gameId);
    return res.status(201).json({ game: serializeGame(gameId, null), message: 'המשחק נוצר על ידי אדמין.' });
  });

  app.patch('/api/games/:gameId', (req, res) => {
    const requester = ensureAdmin(Number(req.body?.userId || 0), String(req.body?.adminToken || ''));
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
       SET title = ?, location = ?, notes = ?, game_date = ?, lottery_signature = '', updated_at = ?
       WHERE id = ?`,
      [validated.value.title, validated.value.location, validated.value.notes, validated.value.gameDate, nowIso(), gameId]
    );

    run('DELETE FROM game_lottery WHERE game_id = ?', [gameId]);
    recalculateGame(gameId);
    return res.json({ game: serializeGame(gameId, null) });
  });

  app.delete('/api/games/:gameId', (req, res) => {
    const requester = ensureAdmin(Number(req.body?.userId || 0), String(req.body?.adminToken || ''));
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
        message: `ההרשמה נסגרה. הנעילה מתבצעת יום לפני המשחק בשעה ${String(REGISTRATION_LOCK_HOUR).padStart(2, '0')}:00.`,
      });
    }

    const existing = get('SELECT id FROM registrations WHERE game_id = ? AND user_id = ?', [gameId, requester.user.id]);
    if (existing) {
      return res.status(409).json({ message: 'כבר נרשמת למשחק.' });
    }

    const countRow = get('SELECT COUNT(*) AS count FROM registrations WHERE game_id = ?', [gameId]);
    const currentCount = Number(countRow.count);

    run(
      `INSERT INTO registrations (game_id, user_id, position, role, joined_at)
       VALUES (?, ?, ?, 'PLAYING', ?)`,
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

    const existing = get('SELECT id FROM registrations WHERE game_id = ? AND user_id = ?', [gameId, requester.user.id]);
    if (!existing) {
      return res.status(409).json({ message: 'לא נמצאה הרשמה פעילה למשתמש הזה.' });
    }

    run('DELETE FROM registrations WHERE id = ?', [existing.id]);
    reorderPositions(gameId);
    run('UPDATE games SET lottery_signature = ? WHERE id = ?', ['', gameId]);
    recalculateGame(gameId);
    return res.json({ game: serializeGame(gameId, requester.user.id) });
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

  recalculateLockedGames();
  setInterval(() => {
    recalculateLockedGames();
  }, 60000);

  app.listen(PORT, () => {
    console.log(`API listening on http://localhost:${PORT}`);
  });
}

startServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
