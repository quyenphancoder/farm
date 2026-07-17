import crypto from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { Router } from "express";
import { runTransaction } from "./transaction.js";
import { t } from "../i18n.js";

// Authentication, sessions, and new-game initialization routes.
const router = Router();
const SESSION_COOKIE = "sunnyfarm_session";
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const requestContext = new AsyncLocalStorage();

router.get("/session", (req, res) => {
  const user = getAuthenticatedUser(req);
  res.json(user
    ? { authenticated: true, user: publicUser(user) }
    : { authenticated: false });
});

router.post("/register", (req, res) => {
  const username = normalizeUsername(req.body.username);
  const password = String(req.body.password || "");
  const displayName = String(req.body.displayName || "").trim().slice(0, 30);

  if (!/^[a-zA-Z0-9_]{3,24}$/.test(username)) {
    return res.status(400).json({ error: "Tên đăng nhập phải có 3–24 ký tự, chỉ gồm chữ, số và dấu gạch dưới." });
  }
  if (password.length < 6 || password.length > 128) {
    return res.status(400).json({ error: "Mật khẩu phải có từ 6 đến 128 ký tự." });
  }
  if (!displayName) {
    return res.status(400).json({ error: "Vui lòng nhập tên hiển thị." });
  }

  const db = req.app.locals.db;
  if (db.prepare("SELECT 1 FROM users WHERE username = ? COLLATE NOCASE").get(username)) {
    return res.status(409).json({ error: "Tên đăng nhập đã tồn tại." });
  }

  const salt = crypto.randomBytes(16).toString("hex");
  const passwordHash = hashPassword(password, salt);
  let userId;
  try {
    runTransaction(db, () => {
      // Legacy databases may contain players created before authentication was
      // introduced. Pick an id that is free in both sides of the one-to-one
      // users/players relationship instead of relying only on users' sequence.
      const nextId = db.prepare(`
        SELECT MAX(id) + 1 AS id
        FROM (
          SELECT id FROM users
          UNION ALL
          SELECT id FROM players
        )
      `).get().id || 1;
      const result = db.prepare(`
        INSERT INTO users (id, username, password_hash, password_salt, display_name)
        VALUES (?, ?, ?, ?, ?)
      `).run(nextId, username, passwordHash, salt, displayName);
      userId = Number(result.lastInsertRowid);
      db.prepare(`
        INSERT INTO players (id, name, coins, diamonds, level, xp, unlocked_rows, is_initialized)
        VALUES (?, ?, 500, 200, 1, 0, 1, 0)
      `).run(userId, displayName);
    });
  } catch (error) {
    if (String(error.message).includes("UNIQUE constraint failed: users.username")) {
      return res.status(409).json({ error: "Tên đăng nhập đã tồn tại." });
    }
    throw error;
  }

  createSession(db, res, userId);
  res.status(201).json({ ok: true, user: { id: userId, username, displayName, initialized: false } });
});

router.post("/login", (req, res) => {
  const username = normalizeUsername(req.body.username);
  const password = String(req.body.password || "");
  const db = req.app.locals.db;
  const user = db.prepare(`
    SELECT u.*, p.is_initialized
    FROM users u JOIN players p ON p.id = u.id
    WHERE u.username = ? COLLATE NOCASE
  `).get(username);
  const valid = user && safeEqual(hashPassword(password, user.password_salt), user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: "Tên đăng nhập hoặc mật khẩu không đúng." });
  }

  createSession(db, res, user.id);
  res.json({ ok: true, user: publicUser(user) });
});

router.post("/logout", (req, res) => {
  const token = readCookie(req, SESSION_COOKIE);
  if (token) req.app.locals.db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token));
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.get("/profile", requireAuth, (req, res) => {
  res.json({
    name: req.user.display_name,
    username: req.user.username,
    initialized: Boolean(req.user.is_initialized)
  });
});

router.post("/new-game", requireAuth, (req, res) => {
  const name = String(req.body.name || req.user.display_name || "").trim().slice(0, 30);
  if (!name) return res.status(400).json({ error: t(req.language, "auth.enterName") });

  const db = req.app.locals.db;
  const playerId = req.user.id;
  runTransaction(db, () => {
    db.prepare("DELETE FROM farm_state WHERE player_id = ?").run(playerId);
    db.prepare("DELETE FROM inventory WHERE player_id = ?").run(playerId);
    db.prepare("DELETE FROM unlocked_plots WHERE player_id = ?").run(playerId);
    db.prepare(`
      UPDATE players
      SET name = ?, coins = 500, diamonds = 200, level = 1, xp = 0,
          unlocked_rows = 1, water_started_at = NULL, is_initialized = 1,
          created_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(name, playerId);
    db.prepare("UPDATE users SET display_name = ? WHERE id = ?").run(name, playerId);
    for (let plotId = 0; plotId < 10; plotId += 1) {
      db.prepare("INSERT INTO unlocked_plots (player_id, plot_id) VALUES (?, ?)")
        .run(playerId, plotId);
    }
    db.prepare("INSERT INTO inventory (player_id, item, quantity) VALUES (?, 'carrot_seed', 5)")
      .run(playerId);
  });
  res.json({ ok: true, name });
});

export function requireAuth(req, res, next) {
  const user = getAuthenticatedUser(req);
  if (!user) {
    clearSessionCookie(res);
    return res.status(401).json({ error: "Bạn cần đăng nhập để tiếp tục." });
  }
  req.user = user;
  requestContext.run({ playerId: user.id }, next);
}

export function getAuthenticatedUser(req) {
  const token = readCookie(req, SESSION_COOKIE);
  if (!token) return null;
  return req.app.locals.db.prepare(`
    SELECT u.id, u.username, u.display_name, p.is_initialized
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    JOIN players p ON p.id = u.id
    WHERE s.token_hash = ? AND s.expires_at > ?
  `).get(hashToken(token), Date.now()) || null;
}

export function getSocketUser(db, cookieHeader = "") {
  const token = readCookieHeader(cookieHeader, SESSION_COOKIE);
  if (!token) return null;
  return db.prepare(`
    SELECT u.id, u.username, u.display_name
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ?
  `).get(hashToken(token), Date.now()) || null;
}

function createSession(db, res, userId) {
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = Date.now() + SESSION_MAX_AGE_MS;
  db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(Date.now());
  db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)")
    .run(hashToken(token), userId, expiresAt);
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_MAX_AGE_MS,
    path: "/"
  });
}

function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/"
  });
}

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString("hex");
}
function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}
function safeEqual(value, expected) {
  const left = Buffer.from(value);
  const right = Buffer.from(expected);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
function normalizeUsername(value) {
  return String(value || "").trim().toLowerCase();
}
function readCookie(req, name) {
  return readCookieHeader(req.headers.cookie || "", name);
}
function readCookieHeader(header, name) {
  for (const part of header.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return "";
}
function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.display_name,
    initialized: Boolean(user.is_initialized)
  };
}

export default router;
