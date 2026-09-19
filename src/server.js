"use strict";

/**
 * Alexa web panel API + SPA host.
 *
 * The bot (`index.js`) and this Express process share MySQL, not an in-memory
 * socket. Group membership is synced by the bot after connection/reconnect and
 * on every WhatsApp participant/admin update, so panel authorisation remains
 * correct even when either process restarts.
 */
require("./config");
const config = require("./config");
const express = require("express");
const session = require("express-session");
const compression = require("compression");
const WebSocket = require("ws");
const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const si = require("systeminformation");
const memoryStats = require("./modules/memoryStats");
const database = require("./services/database");
const profiles = require("./services/userProfiles");

const app = express();
app.set("trust proxy", 1);
const PORT = config.PORT;
const publicDir = path.join(__dirname, "..", "public");
const dataFile = path.join(__dirname, "..", "data", "sharedData.json");

// Run the idempotent schema bootstrap on every server start. The bot process
// does the same; CREATE TABLE IF NOT EXISTS makes simultaneous startup safe.
database.initialize().catch((error) => {
  console.error("[server] Database bootstrap failed:", error.message);
});

app.use(compression());
app.use(
  express.json({
    limit: "128kb",
    verify: (req, res, buffer) => {
      req.rawBody = buffer;
    },
  }),
);
app.use(express.urlencoded({ extended: false, limit: "128kb" }));

const SESSION_COOKIE_NAME = "alexa.sid";
// Never sign a session with a public fallback value. A local deployment that
// has not configured SESSION_SECRET receives an unpredictable process-local
// secret (all sessions expire on restart); production should always set it.
const sessionSecret =
  config.SESSION_SECRET || crypto.randomBytes(32).toString("base64url");
if (!config.SESSION_SECRET) {
  console.warn(
    "[server] SESSION_SECRET is not set; using an ephemeral secret and invalidating sessions on restart.",
  );
}
const cookieSecure =
  process.env.COOKIE_SECURE === "true"
    ? true
    : process.env.COOKIE_SECURE === "false"
      ? false
      : "auto";
const sessionMiddleware = session({
  name: SESSION_COOKIE_NAME,
  secret: sessionSecret,
  resave: false,
  rolling: true,
  saveUninitialized: false,
  cookie: {
    secure: cookieSecure,
    httpOnly: true,
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 1000,
  },
});
app.use(sessionMiddleware);
app.use((req, res, next) => {
  if (req.path.startsWith("/api/") || req.path === "/logs") {
    res.set("Cache-Control", "no-store, private");
  }
  next();
});

// No page in the new UI links to an .html URL. Redirect bookmarks made by the
// old multi-page panel back into the SPA rather than exposing those paths.
app.get(
  ["/index.html", "/login.html", "/control.html", "/deploy.html"],
  (req, res) => {
    res.redirect(302, "/");
  },
);
// Legacy links land inside the same SPA rather than a separate login/control
// document. The current navbar never navigates to either route.
app.get("/login", (req, res) => res.redirect(302, "/"));
app.get("/control", (req, res) => res.redirect(302, "/dashboard"));
app.use(express.static(publicDir, { index: false }));

function readRuntimeData() {
  try {
    return JSON.parse(fs.readFileSync(dataFile, "utf8"));
  } catch {
    return { status: "Offline", number: null };
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (req.session?.auth?.role === role) return next();
    return res
      .status(401)
      .json({ success: false, message: "Authentication required" });
  };
}

function requireAnyLogin(req, res, next) {
  if (req.session?.auth?.role) return next();
  return res
    .status(401)
    .json({ success: false, message: "Authentication required" });
}

function createCsrfToken() {
  return crypto.randomBytes(32).toString("base64url");
}

// Session rotation rejects normal replays; this short-lived in-process ledger
// also closes the tiny concurrent-request window before a session-store write
// completes. It stores only random nonce values, never credentials.
const consumedCsrfTokens = new Map();
const CSRF_REPLAY_WINDOW_MS = 60 * 60 * 1000;
function consumeCsrfToken(token) {
  const now = Date.now();
  if (consumedCsrfTokens.size > 2048) {
    for (const [value, expiresAt] of consumedCsrfTokens) {
      if (expiresAt <= now) consumedCsrfTokens.delete(value);
    }
  }
  if (consumedCsrfTokens.has(token)) return false;
  consumedCsrfTokens.set(token, now + CSRF_REPLAY_WINDOW_MS);
  return true;
}

function safeTokenMatch(left, right) {
  if (!left || !right) return false;
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function isSameOriginRequest(req) {
  const origin = req.get("origin");
  // Non-browser clients do not always send Origin; they still need a valid,
  // single-use CSRF token for authenticated mutations below.
  if (!origin) return true;
  try {
    return new URL(origin).host === req.get("host");
  } catch {
    return false;
  }
}

function requireFreshCsrf(req, res, next) {
  const auth = req.session?.auth;
  if (!auth?.csrfToken) {
    return res
      .status(401)
      .json({ success: false, message: "Authentication required" });
  }
  if (!isSameOriginRequest(req)) {
    return res
      .status(403)
      .json({ success: false, message: "Request origin was rejected." });
  }
  const submittedToken = req.get("x-csrf-token");
  if (
    !safeTokenMatch(submittedToken, auth.csrfToken) ||
    !consumeCsrfToken(submittedToken)
  ) {
    return res.status(403).json({
      success: false,
      message: "Security token is missing, expired, or already used.",
    });
  }

  // Rotate before the state change. A captured PATCH (cookie + token + body)
  // can be accepted only once, so it cannot be replayed to alter a group again.
  auth.csrfToken = createCsrfToken();
  return req.session.save((error) => {
    if (error)
      return res
        .status(500)
        .json({ success: false, message: "Could not secure this request." });
    res.set("X-CSRF-Token", auth.csrfToken);
    return next();
  });
}

// Small process-local brute-force guard. It intentionally applies equally to
// owner and user credentials and leaks no information about valid accounts.
const failedLogins = new Map();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 8;
function rateLimitKey(req, type) {
  return `${type}:${req.ip || req.socket.remoteAddress || "unknown"}`;
}
function loginBlocked(req, type) {
  const record = failedLogins.get(rateLimitKey(req, type));
  return (
    record &&
    record.count >= LOGIN_MAX_FAILURES &&
    Date.now() - record.first < LOGIN_WINDOW_MS
  );
}
function recordLoginFailure(req, type) {
  const key = rateLimitKey(req, type);
  const old = failedLogins.get(key);
  if (!old || Date.now() - old.first >= LOGIN_WINDOW_MS) {
    failedLogins.set(key, { count: 1, first: Date.now() });
  } else {
    old.count += 1;
  }
}
function clearLoginFailures(req, type) {
  failedLogins.delete(rateLimitKey(req, type));
}

async function userLogin(req, res) {
  if (!isSameOriginRequest(req)) {
    return res
      .status(403)
      .json({ success: false, message: "Request origin was rejected." });
  }
  if (loginBlocked(req, "user")) {
    return res
      .status(429)
      .json({ success: false, message: "Too many attempts. Try again later." });
  }
  const { username, password } = req.body || {};
  try {
    const user = await profiles.authenticate(username, password);
    if (!user) {
      recordLoginFailure(req, "user");
      return res
        .status(401)
        .json({ success: false, message: "Invalid LID or password." });
    }
    clearLoginFailures(req, "user");
    // Regeneration prevents session fixation: any ID that existed before a
    // successful sign-in cannot become the authenticated session.
    return req.session.regenerate((regenerateError) => {
      if (regenerateError)
        return res
          .status(500)
          .json({ success: false, message: "Could not create session." });
      const role = user.isOwner ? "owner" : "user";
      req.session.auth = {
        role,
        userLid: user.lid,
        displayName: user.displayName || null,
        csrfToken: createCsrfToken(),
      };
      return req.session.save((saveError) => {
        if (saveError)
          return res
            .status(500)
            .json({ success: false, message: "Could not create session." });
        res.set("X-CSRF-Token", req.session.auth.csrfToken);
        return res.json({
          success: true,
          role,
          csrfToken: req.session.auth.csrfToken,
        });
      });
    });
  } catch (error) {
    console.error("[server] User login failed:", error.message);
    return res
      .status(503)
      .json({ success: false, message: "Account service is unavailable." });
  }
}

// ---- Public / authentication API -----------------------------------------
app.get("/status", (req, res) =>
  res.json({ status: readRuntimeData().status || "Offline" }),
);
app.get("/get-phone-number", (req, res) =>
  res.json({ phoneNumber: readRuntimeData().number || null }),
);
app.get("/api/auth/session", (req, res) => {
  const auth = req.session?.auth;
  res.json({
    authenticated: Boolean(auth),
    role: auth?.role || null,
    displayName: auth?.displayName || null,
    csrfToken: auth?.csrfToken || null,
  });
});
// Every account signs in through one LID/password form. userLogin assigns
// the owner role automatically when the authenticated LID/JID matches
// Owner_id/Owner_nb, just like bot.js.
app.post("/api/auth/user-login", userLogin);
app.post("/login", userLogin); // legacy endpoint, same identity-based role assignment
app.post("/api/auth/logout", requireAnyLogin, requireFreshCsrf, (req, res) => {
  req.session.destroy(() => {
    res.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
    res.json({ success: true });
  });
});
app.post("/logout", requireAnyLogin, requireFreshCsrf, (req, res) => {
  req.session.destroy(() => {
    res.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
    res.json({ success: true });
  });
});
app.get("/is-logged-in", (req, res) => {
  res.json({
    isLoggedIn: Boolean(req.session?.auth),
    role: req.session?.auth?.role || null,
  });
});

// Request a new WhatsApp group metadata sync through the bot process. The
// panel itself has no Baileys socket; app.js relays this IPC event to index.js.
app.post(
  "/api/groups/refresh",
  requireAnyLogin,
  requireFreshCsrf,
  (req, res) => {
    if (typeof process.send !== "function") {
      return res.status(503).json({
        success: false,
        message: "The bot sync process is unavailable.",
      });
    }
    process.send({
      type: "data",
      from: "panel",
      payload: { event: "refresh-group-directory" },
    });
    return res.json({ success: true, queued: true });
  },
);

// ---- User dashboard API ---------------------------------------------------
async function getUserGroups(userLid) {
  const [rows] = await database
    .getPool()
    .promise()
    .query(
      `SELECT d.group_id, d.subject, d.member_count, d.bot_is_admin, d.metadata_synced_at,
            COALESCE(g.chatbot, 0) AS chatbot,
            COALESCE(g.antilink, 0) AS antilink,
            COALESCE(g.link_a, 'delete') AS link_a,
            COALESCE(g.antinsfw, 0) AS antinsfw,
            COALESCE(g.nsfw_a, 'delete') AS nsfw_a,
            COALESCE(g.is_allow_bots, 0) AS is_allow_bots,
            COALESCE(g.is_welcome, 0) AS is_welcome,
            COALESCE(g.wc_m, '') AS wc_m,
            COALESCE(g.isleft_w, 0) AS isleft_w,
            COALESCE(g.left_m, '') AS left_m
     FROM group_admin_memberships m
     INNER JOIN group_directory d
       ON d.group_id COLLATE utf8mb4_unicode_ci = m.group_id COLLATE utf8mb4_unicode_ci
     LEFT JOIN \`groups\` g
       ON g.group_id COLLATE utf8mb4_unicode_ci = d.group_id COLLATE utf8mb4_unicode_ci
     WHERE m.user_lid COLLATE utf8mb4_unicode_ci = ?
       AND m.is_admin = 1
       AND d.bot_is_admin = 1
     ORDER BY d.subject ASC`,
      [userLid],
    );
  return rows.map((row) => ({
    ...row,
    bot_is_admin: Boolean(row.bot_is_admin),
    chatbot: Boolean(row.chatbot),
    antilink: Boolean(row.antilink),
    antinsfw: Boolean(row.antinsfw),
    is_allow_bots: Boolean(row.is_allow_bots),
    is_welcome: Boolean(row.is_welcome),
    wc_m: String(row.wc_m || ""),
    isleft_w: Boolean(row.isleft_w),
    left_m: String(row.left_m || ""),
  }));
}

app.get("/api/user/groups/:groupId", requireRole("user"), async (req, res) => {
  const groupId = String(req.params.groupId || "");
  if (!validGroupId(groupId)) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid group identifier." });
  }
  try {
    await database.initialize();
    const group = (await getUserGroups(req.session.auth.userLid)).find(
      (item) => item.group_id === groupId,
    );
    if (!group) {
      return res.status(404).json({
        success: false,
        message: "This group is no longer available to your account.",
      });
    }
    return res.json({ success: true, group });
  } catch (error) {
    console.error("[server] Could not load user group detail:", error.message);
    return res
      .status(503)
      .json({ success: false, message: "Group settings are unavailable." });
  }
});

app.get("/api/user/dashboard", requireRole("user"), async (req, res) => {
  try {
    await database.initialize();
    const profile = await profiles.getProfileSummary(req.session.auth.userLid);
    if (!profile) {
      return res
        .status(404)
        .json({ success: false, message: "Account no longer exists." });
    }
    const groups = await getUserGroups(req.session.auth.userLid);
    return res.json({
      success: true,
      user: {
        username: profile.lid_username,
        displayName: profile.display_name,
        privateChatbot: Boolean(profile.private_chatbot),
        game: {
          class: profile.rpg_class,
          level: profile.rpg_level || 1,
          power: profile.rpg_power || 10,
          balance: Number(profile.balance || 0),
          bank: Number(profile.bank || 0),
          inventoryCount: Number(profile.inventory_count || 0),
          title: profile.shop_title || null,
        },
      },
      groups,
    });
  } catch (error) {
    console.error("[server] Could not load user dashboard:", error.message);
    return res
      .status(503)
      .json({ success: false, message: "Dashboard data is unavailable." });
  }
});

app.patch(
  "/api/user/private-chatbot",
  requireRole("user"),
  requireFreshCsrf,
  async (req, res) => {
    if (typeof req.body?.enabled !== "boolean") {
      return res
        .status(400)
        .json({ success: false, message: "enabled must be true or false." });
    }
    try {
      const enabled = await profiles.setPrivateChatbot(
        req.session.auth.userLid,
        req.body.enabled,
      );
      return res.json({ success: true, enabled });
    } catch (error) {
      console.error(
        "[server] Could not update private chatbot:",
        error.message,
      );
      return res.status(503).json({
        success: false,
        message: "Could not save chatbot preference.",
      });
    }
  },
);

const ALLOWED_GROUP_FIELDS = {
  chatbot: "chatbot",
  antilink: "antilink",
  linkAction: "link_a",
  antinsfw: "antinsfw",
  nsfwAction: "nsfw_a",
  allowBots: "is_allow_bots",
  welcome: "is_welcome",
  welcomeMessage: "wc_m",
  goodbye: "isleft_w",
  goodbyeMessage: "left_m",
};
const ALLOWED_ACTIONS = new Set(["delete", "warn", "remove", "false"]);

function validGroupId(value) {
  return String(value || "").endsWith("@g.us");
}

function groupSettingsUpdate(body) {
  const assignments = [];
  const params = [];
  for (const [inputName, columnName] of Object.entries(ALLOWED_GROUP_FIELDS)) {
    if (!(inputName in body)) continue;
    let value = body[inputName];
    if (["linkAction", "nsfwAction"].includes(inputName)) {
      value = String(value || "").toLowerCase();
      if (!ALLOWED_ACTIONS.has(value)) {
        return { error: `Invalid ${inputName}.` };
      }
    } else if (["welcomeMessage", "goodbyeMessage"].includes(inputName)) {
      value = String(value || "").trim();
      if (value.length > 4000) {
        return { error: `${inputName} cannot exceed 4,000 characters.` };
      }
    } else if (typeof value !== "boolean") {
      return { error: `${inputName} must be true or false.` };
    }
    assignments.push(`\`${columnName}\` = ?`);
    params.push(value);
  }
  if (!assignments.length)
    return { error: "No supported settings were supplied." };
  return { assignments, params };
}

async function saveGroupSettings(groupId, body) {
  const change = groupSettingsUpdate(body || {});
  if (change.error) return change;
  const db = database.getPool().promise();
  await db.query("INSERT IGNORE INTO `groups` (group_id) VALUES (?)", [
    groupId,
  ]);
  await db.query(
    `UPDATE \`groups\` SET ${change.assignments.join(", ")} WHERE group_id = ?`,
    [...change.params, groupId],
  );
  // Clear the bot process's settings cache immediately through app.js IPC.
  if (typeof process.send === "function") {
    process.send({
      type: "data",
      from: "panel",
      payload: { event: "clear-group-settings", groupId },
    });
  }
  return { success: true };
}

app.patch(
  "/api/user/groups/:groupId/settings",
  requireRole("user"),
  requireFreshCsrf,
  async (req, res) => {
    const groupId = String(req.params.groupId || "");
    if (!validGroupId(groupId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid group identifier." });
    }
    try {
      await database.initialize();
      const db = database.getPool().promise();
      const [permissions] = await db.query(
        `SELECT 1
       FROM group_admin_memberships m
       INNER JOIN group_directory d
         ON d.group_id COLLATE utf8mb4_unicode_ci = m.group_id COLLATE utf8mb4_unicode_ci
       WHERE m.group_id COLLATE utf8mb4_unicode_ci = ?
         AND m.user_lid COLLATE utf8mb4_unicode_ci = ?
         AND m.is_admin = 1
         AND d.bot_is_admin = 1`,
        [groupId, req.session.auth.userLid],
      );
      if (!permissions.length) {
        return res.status(403).json({
          success: false,
          message: "You and the bot must both be current group admins.",
        });
      }
      const result = await saveGroupSettings(groupId, req.body);
      if (result.error)
        return res.status(400).json({ success: false, message: result.error });
      return res.json(result);
    } catch (error) {
      console.error(
        "[server] Could not update user group settings:",
        error.message,
      );
      return res
        .status(503)
        .json({ success: false, message: "Could not save group settings." });
    }
  },
);

async function getOwnerGroups() {
  const [rows] = await database
    .getPool()
    .promise()
    .query(
      `SELECT d.group_id, d.subject, d.member_count, d.bot_is_admin, d.metadata_synced_at,
            COALESCE(g.chatbot, 0) AS chatbot,
            COALESCE(g.antilink, 0) AS antilink,
            COALESCE(g.link_a, 'delete') AS link_a,
            COALESCE(g.antinsfw, 0) AS antinsfw,
            COALESCE(g.nsfw_a, 'delete') AS nsfw_a,
            COALESCE(g.is_allow_bots, 0) AS is_allow_bots,
            COALESCE(g.is_welcome, 0) AS is_welcome,
            COALESCE(g.wc_m, '') AS wc_m,
            COALESCE(g.isleft_w, 0) AS isleft_w,
            COALESCE(g.left_m, '') AS left_m
     FROM group_directory d
     LEFT JOIN \`groups\` g
       ON g.group_id COLLATE utf8mb4_unicode_ci = d.group_id COLLATE utf8mb4_unicode_ci
     UNION ALL
     SELECT g.group_id, CONCAT('Saved group ', g.group_id) AS subject,
            0 AS member_count, 0 AS bot_is_admin, NULL AS metadata_synced_at,
            g.chatbot, g.antilink, g.link_a, g.antinsfw, g.nsfw_a,
            g.is_allow_bots, g.is_welcome, COALESCE(g.wc_m, ''),
            g.isleft_w, COALESCE(g.left_m, '')
     FROM \`groups\` g
     LEFT JOIN group_directory d
       ON d.group_id COLLATE utf8mb4_unicode_ci = g.group_id COLLATE utf8mb4_unicode_ci
     WHERE d.group_id IS NULL
     ORDER BY subject ASC`,
    );
  return rows.map((row) => ({
    ...row,
    bot_is_admin: Boolean(row.bot_is_admin),
    chatbot: Boolean(row.chatbot),
    antilink: Boolean(row.antilink),
    antinsfw: Boolean(row.antinsfw),
    is_allow_bots: Boolean(row.is_allow_bots),
    is_welcome: Boolean(row.is_welcome),
    wc_m: String(row.wc_m || ""),
    isleft_w: Boolean(row.isleft_w),
    left_m: String(row.left_m || ""),
  }));
}

app.get("/api/owner/groups", requireRole("owner"), async (req, res) => {
  try {
    await database.initialize();
    return res.json({ success: true, groups: await getOwnerGroups() });
  } catch (error) {
    console.error("[server] Could not load owner groups:", error.message);
    return res
      .status(503)
      .json({ success: false, message: "Owner group data is unavailable." });
  }
});

app.get(
  "/api/owner/groups/:groupId",
  requireRole("owner"),
  async (req, res) => {
    const groupId = String(req.params.groupId || "");
    if (!validGroupId(groupId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid group identifier." });
    }
    try {
      await database.initialize();
      const group = (await getOwnerGroups()).find(
        (item) => item.group_id === groupId,
      );
      if (!group) {
        return res.status(404).json({
          success: false,
          message: "This saved group does not exist.",
        });
      }
      return res.json({ success: true, group });
    } catch (error) {
      console.error(
        "[server] Could not load owner group detail:",
        error.message,
      );
      return res
        .status(503)
        .json({ success: false, message: "Group settings are unavailable." });
    }
  },
);

app.patch(
  "/api/owner/groups/:groupId/settings",
  requireRole("owner"),
  requireFreshCsrf,
  async (req, res) => {
    const groupId = String(req.params.groupId || "");
    if (!validGroupId(groupId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid group identifier." });
    }
    try {
      await database.initialize();
      const knownGroup = (await getOwnerGroups()).some(
        (item) => item.group_id === groupId,
      );
      if (!knownGroup) {
        return res.status(404).json({
          success: false,
          message: "This saved group does not exist.",
        });
      }
      const result = await saveGroupSettings(groupId, req.body);
      if (result.error)
        return res.status(400).json({ success: false, message: result.error });
      return res.json(result);
    } catch (error) {
      console.error(
        "[server] Could not update owner group settings:",
        error.message,
      );
      return res
        .status(503)
        .json({ success: false, message: "Could not save group settings." });
    }
  },
);

// ---- Owner diagnostics API ------------------------------------------------
app.get("/api/owner/sysstats", requireRole("owner"), async (req, res) => {
  try {
    const [cpuData, netData] = await Promise.all([
      si.currentLoad(),
      si.networkStats(),
    ]);
    const mem = memoryStats.snapshot();
    return res.json({
      cpu: cpuData.currentLoad,
      memory: mem.usedPercent,
      mem,
      downloadSpeed: netData[0]?.rx_sec ?? 0,
      uploadSpeed: netData[0]?.tx_sec ?? 0,
    });
  } catch (error) {
    return res
      .status(500)
      .json({ success: false, message: "Failed to retrieve system stats." });
  }
});
app.get("/sysstats", requireRole("owner"), (req, res) =>
  res.redirect(307, "/api/owner/sysstats"),
);

app.get("/download-users-json", requireRole("owner"), (req, res) => {
  const file = path.join(__dirname, "..", "data", "users.json");
  if (!fs.existsSync(file))
    return res.status(404).json({ error: "File not found" });
  return res.download(file, "users.json");
});
app.get("/download-hangman-json", requireRole("owner"), (req, res) => {
  const file = path.join(__dirname, "..", "data", "hangman.json");
  if (!fs.existsSync(file))
    return res.status(404).json({ error: "File not found" });
  return res.download(file, "hangman.json");
});

// ---- GitHub webhook --------------------------------------------------------
app.post("/github-webhook", (req, res) => {
  if (config.WEBHOOK_SECRET) {
    const expected =
      "sha256=" +
      crypto
        .createHmac("sha256", config.WEBHOOK_SECRET)
        .update(req.rawBody || Buffer.alloc(0))
        .digest("hex");
    const given = String(req.headers["x-hub-signature-256"] || "");
    if (
      given.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected))
    ) {
      return res.status(403).send("Invalid signature");
    }
  } else {
    console.warn(
      "[GitHub Webhook] WEBHOOK_SECRET is not set; request is not verified.",
    );
  }

  if (req.headers["x-github-event"] === "push") {
    const payload = req.body || {};
    const commits = Array.isArray(payload.commits) ? payload.commits : [];
    const lines = commits
      .slice(0, 10)
      .map(
        (commit, index) =>
          `\n\n*Commit ${index + 1} [ \`${String(commit.id || "").slice(0, 7)}\` ]*\n*Author:* ${commit.author?.name || "Unknown"}\n*Message:* _${String(commit.message || "").split("\n")[0]}_`,
      );
    const message = `*📦 New Update to ${payload.repository?.name || "repository"}*\n*Branch:* \`${String(
      payload.ref || "",
    )
      .split("/")
      .pop()}\`\n*By:* ${payload.pusher?.name || "Unknown"}\n-----------------------------------${lines.join("")}`;
    if (typeof process.send === "function") {
      process.send({
        type: "data",
        from: "github-webhook",
        payload: { event: "gitpush", message },
      });
    }
  }
  return res.status(200).send("Event received");
});

function serveSpa(req, res) {
  res.sendFile(path.join(publicDir, "index.html"));
}
app.get(["/", "/dashboard", "/dashboard/group/:groupId"], serveSpa);

const server = http.createServer(app);

// Owner-only WebSocket log stream. The SPA exposes it only in the owner
// dashboard, while this session check keeps the old log endpoint private.
const logWss = new WebSocket.Server({ noServer: true });
server.on("upgrade", (request, socket, head) => {
  if (new URL(request.url, "http://localhost").pathname !== "/logs") {
    socket.destroy();
    return;
  }
  const responseShim = {
    getHeader: () => undefined,
    setHeader: () => {},
    end: () => {},
  };
  sessionMiddleware(request, responseShim, () => {
    if (request.session?.auth?.role !== "owner") {
      socket.destroy();
      return;
    }
    logWss.handleUpgrade(request, socket, head, (ws) =>
      logWss.emit("connection", ws),
    );
  });
});
logWss.on("connection", (ws) => {
  const sendLogs = () => {
    for (const [type, file] of [
      ["index", path.join(__dirname, "..", "logs", "index.log")],
      ["server", path.join(__dirname, "..", "logs", "server.log")],
    ]) {
      fs.readFile(file, "utf8", (error, content) => {
        if (!error && ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({ type, logs: content.split("\n").slice(-100) }),
          );
        }
      });
    }
  };
  const interval = setInterval(sendLogs, 1000);
  ws.on("close", () => clearInterval(interval));
  sendLogs();
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});

module.exports = { app, server };
