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

const sessionMiddleware = session({
  // Keep existing deployments working, but log a visible warning in config when
  // a real secret is not provided. Cookies remain unreadable by JavaScript.
  secret: config.SESSION_SECRET || "alexa-change-me-set-SESSION_SECRET",
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.COOKIE_SECURE === "true",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 1000,
  },
});
app.use(sessionMiddleware);

// No page in the new UI links to an .html URL. Redirect bookmarks made by the
// old multi-page panel back into the SPA rather than exposing those paths.
app.get(["/index.html", "/login.html", "/control.html"], (req, res) => {
  res.redirect(302, "/");
});
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

function safeOwnerMatch(value) {
  const input = Buffer.from(String(value || ""));
  const expected = Buffer.from(String(config.ADMIN_PASSWORD || ""));
  return input.length === expected.length && crypto.timingSafeEqual(input, expected);
}

function requireRole(role) {
  return (req, res, next) => {
    if (req.session?.auth?.role === role) return next();
    return res.status(401).json({ success: false, message: "Authentication required" });
  };
}

function requireAnyLogin(req, res, next) {
  if (req.session?.auth?.role) return next();
  return res.status(401).json({ success: false, message: "Authentication required" });
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
  return record && record.count >= LOGIN_MAX_FAILURES && Date.now() - record.first < LOGIN_WINDOW_MS;
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

async function ownerLogin(req, res) {
  if (loginBlocked(req, "owner")) {
    return res.status(429).json({ success: false, message: "Too many attempts. Try again later." });
  }
  const { username, password } = req.body || {};
  if (!config.ADMIN_USERNAME || !config.ADMIN_PASSWORD) {
    return res.status(503).json({ success: false, message: "Owner login is not configured." });
  }
  const usernameOK = safeOwnerMatch(String(username || ""), config.ADMIN_USERNAME);
  const passwordOK = safeOwnerMatch(String(password || ""), config.ADMIN_PASSWORD);
  if (!usernameOK || !passwordOK) {
    recordLoginFailure(req, "owner");
    return res.status(401).json({ success: false, message: "Invalid credentials." });
  }
  clearLoginFailures(req, "owner");
  req.session.auth = { role: "owner", username: config.ADMIN_USERNAME };
  return req.session.save((error) => {
    if (error) return res.status(500).json({ success: false, message: "Could not create session." });
    return res.json({ success: true, role: "owner" });
  });
}

async function userLogin(req, res) {
  if (loginBlocked(req, "user")) {
    return res.status(429).json({ success: false, message: "Too many attempts. Try again later." });
  }
  const { username, password } = req.body || {};
  try {
    const user = await profiles.authenticate(username, password);
    if (!user) {
      recordLoginFailure(req, "user");
      return res.status(401).json({ success: false, message: "Invalid LID or password." });
    }
    clearLoginFailures(req, "user");
    req.session.auth = {
      role: "user",
      userLid: user.lid,
      displayName: user.displayName || null,
    };
    return req.session.save((error) => {
      if (error) return res.status(500).json({ success: false, message: "Could not create session." });
      return res.json({ success: true, role: "user" });
    });
  } catch (error) {
    console.error("[server] User login failed:", error.message);
    return res.status(503).json({ success: false, message: "Account service is unavailable." });
  }
}

// ---- Public / authentication API -----------------------------------------
app.get("/status", (req, res) => res.json({ status: readRuntimeData().status || "Offline" }));
app.get("/get-phone-number", (req, res) => res.json({ phoneNumber: readRuntimeData().number || null }));
app.get("/api/auth/session", (req, res) => {
  const auth = req.session?.auth;
  res.json({
    authenticated: Boolean(auth),
    role: auth?.role || null,
    displayName: auth?.displayName || null,
  });
});
app.post("/api/auth/owner-login", ownerLogin);
app.post("/api/auth/user-login", userLogin);
// Backward-compatible endpoint for older clients; the new SPA calls the API
// path above and never navigates to login.html.
app.post("/login", ownerLogin);
app.post("/api/auth/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.json({ success: true });
  });
});
app.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.json({ success: true });
  });
});
app.get("/is-logged-in", (req, res) => {
  res.json({
    isLoggedIn: Boolean(req.session?.auth),
    role: req.session?.auth?.role || null,
  });
});

// ---- User dashboard API ---------------------------------------------------
async function getUserGroups(userLid) {
  const [rows] = await database.getPool().promise().query(
    `SELECT d.group_id, d.subject, d.member_count, d.bot_is_admin, d.metadata_synced_at,
            COALESCE(g.chatbot, 0) AS chatbot,
            COALESCE(g.antilink, 0) AS antilink,
            COALESCE(g.link_a, 'delete') AS link_a,
            COALESCE(g.antinsfw, 0) AS antinsfw,
            COALESCE(g.nsfw_a, 'delete') AS nsfw_a,
            COALESCE(g.is_welcome, 0) AS is_welcome,
            COALESCE(g.isleft_w, 0) AS isleft_w
     FROM group_admin_memberships m
     INNER JOIN group_directory d ON d.group_id = m.group_id
     LEFT JOIN \`groups\` g ON g.group_id = d.group_id
     WHERE m.user_lid = ? AND m.is_admin = 1
     ORDER BY d.subject ASC`,
    [userLid],
  );
  return rows.map((row) => ({
    ...row,
    bot_is_admin: Boolean(row.bot_is_admin),
    chatbot: Boolean(row.chatbot),
    antilink: Boolean(row.antilink),
    antinsfw: Boolean(row.antinsfw),
    is_welcome: Boolean(row.is_welcome),
    isleft_w: Boolean(row.isleft_w),
  }));
}

app.get("/api/user/dashboard", requireRole("user"), async (req, res) => {
  try {
    await database.initialize();
    const profile = await profiles.getProfileSummary(req.session.auth.userLid);
    if (!profile) {
      return res.status(404).json({ success: false, message: "Account no longer exists." });
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
    return res.status(503).json({ success: false, message: "Dashboard data is unavailable." });
  }
});

app.patch("/api/user/private-chatbot", requireRole("user"), async (req, res) => {
  if (typeof req.body?.enabled !== "boolean") {
    return res.status(400).json({ success: false, message: "enabled must be true or false." });
  }
  try {
    const enabled = await profiles.setPrivateChatbot(req.session.auth.userLid, req.body.enabled);
    return res.json({ success: true, enabled });
  } catch (error) {
    console.error("[server] Could not update private chatbot:", error.message);
    return res.status(503).json({ success: false, message: "Could not save chatbot preference." });
  }
});

const ALLOWED_GROUP_FIELDS = {
  chatbot: "chatbot",
  antilink: "antilink",
  linkAction: "link_a",
  antinsfw: "antinsfw",
  nsfwAction: "nsfw_a",
  welcome: "is_welcome",
  goodbye: "isleft_w",
};
const ALLOWED_ACTIONS = new Set(["delete", "warn", "remove", "false"]);

app.patch("/api/user/groups/:groupId/settings", requireRole("user"), async (req, res) => {
  const groupId = String(req.params.groupId || "");
  if (!groupId.endsWith("@g.us")) {
    return res.status(400).json({ success: false, message: "Invalid group identifier." });
  }
  try {
    const db = database.getPool().promise();
    const [permissions] = await db.query(
      `SELECT 1 FROM group_admin_memberships
       WHERE group_id = ? AND user_lid = ? AND is_admin = 1`,
      [groupId, req.session.auth.userLid],
    );
    if (!permissions.length) {
      return res.status(403).json({ success: false, message: "You are not a current admin of this group." });
    }

    const body = req.body || {};
    const assignments = [];
    const params = [];
    for (const [inputName, columnName] of Object.entries(ALLOWED_GROUP_FIELDS)) {
      if (!(inputName in body)) continue;
      let value = body[inputName];
      if (["linkAction", "nsfwAction"].includes(inputName)) {
        value = String(value || "").toLowerCase();
        if (!ALLOWED_ACTIONS.has(value)) {
          return res.status(400).json({ success: false, message: `Invalid ${inputName}.` });
        }
      } else if (typeof value !== "boolean") {
        return res.status(400).json({ success: false, message: `${inputName} must be true or false.` });
      }
      assignments.push(`\`${columnName}\` = ?`);
      params.push(value);
    }
    if (!assignments.length) {
      return res.status(400).json({ success: false, message: "No supported settings were supplied." });
    }

    await db.query("INSERT IGNORE INTO `groups` (group_id) VALUES (?)", [groupId]);
    await db.query(
      `UPDATE \`groups\` SET ${assignments.join(", ")} WHERE group_id = ?`,
      [...params, groupId],
    );

    // Clear the bot process's five-minute settings cache immediately. app.js
    // relays server -> index.js messages through its built-in IPC channel.
    if (typeof process.send === "function") {
      process.send({
        type: "data",
        from: "panel",
        payload: { event: "clear-group-settings", groupId },
      });
    }
    return res.json({ success: true });
  } catch (error) {
    console.error("[server] Could not update group settings:", error.message);
    return res.status(503).json({ success: false, message: "Could not save group settings." });
  }
});

// ---- Owner diagnostics API ------------------------------------------------
app.get("/api/owner/sysstats", requireRole("owner"), async (req, res) => {
  try {
    const [cpuData, netData] = await Promise.all([si.currentLoad(), si.networkStats()]);
    const mem = memoryStats.snapshot();
    return res.json({
      cpu: cpuData.currentLoad,
      memory: mem.usedPercent,
      mem,
      downloadSpeed: netData[0]?.rx_sec ?? 0,
      uploadSpeed: netData[0]?.tx_sec ?? 0,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Failed to retrieve system stats." });
  }
});
app.get("/sysstats", requireRole("owner"), (req, res) => res.redirect(307, "/api/owner/sysstats"));

app.get("/download-users-json", requireRole("owner"), (req, res) => {
  const file = path.join(__dirname, "..", "data", "users.json");
  if (!fs.existsSync(file)) return res.status(404).json({ error: "File not found" });
  return res.download(file, "users.json");
});
app.get("/download-hangman-json", requireRole("owner"), (req, res) => {
  const file = path.join(__dirname, "..", "data", "hangman.json");
  if (!fs.existsSync(file)) return res.status(404).json({ error: "File not found" });
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
    console.warn("[GitHub Webhook] WEBHOOK_SECRET is not set; request is not verified.");
  }

  if (req.headers["x-github-event"] === "push") {
    const payload = req.body || {};
    const commits = Array.isArray(payload.commits) ? payload.commits : [];
    const lines = commits.slice(0, 10).map((commit, index) =>
      `\n\n*Commit ${index + 1} [ \`${String(commit.id || "").slice(0, 7)}\` ]*\n*Author:* ${commit.author?.name || "Unknown"}\n*Message:* _${String(commit.message || "").split("\n")[0]}_`,
    );
    const message = `*📦 New Update to ${payload.repository?.name || "repository"}*\n*Branch:* \`${String(payload.ref || "").split("/").pop()}\`\n*By:* ${payload.pusher?.name || "Unknown"}\n-----------------------------------${lines.join("")}`;
    if (typeof process.send === "function") {
      process.send({ type: "data", from: "github-webhook", payload: { event: "gitpush", message } });
    }
  }
  return res.status(200).send("Event received");
});

function serveSpa(req, res) {
  res.sendFile(path.join(publicDir, "index.html"));
}
app.get(["/", "/dashboard"], serveSpa);

const server = http.createServer(app);

// Owner-only WebSocket log stream retained from the old panel. The SPA does
// not require it, but protecting it closes the old unauthenticated log leak.
const logWss = new WebSocket.Server({ noServer: true });
server.on("upgrade", (request, socket, head) => {
  if (new URL(request.url, "http://localhost").pathname !== "/logs") {
    socket.destroy();
    return;
  }
  const responseShim = { getHeader: () => undefined, setHeader: () => {}, end: () => {} };
  sessionMiddleware(request, responseShim, () => {
    if (request.session?.auth?.role !== "owner") {
      socket.destroy();
      return;
    }
    logWss.handleUpgrade(request, socket, head, (ws) => logWss.emit("connection", ws));
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
          ws.send(JSON.stringify({ type, logs: content.split("\n").slice(-100) }));
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
