/*
 *this file is partof alexainc/alexa-v3
 * owned by hansaka
 *
 *
 *
 *
 *
 *
 *
 * */

require("./config"); // load .env FIRST (in order) before anything reads process.env
const config = require("./config");
const express = require("express");
const app = express();
const session = require("express-session");
const WebSocket = require("ws");
const PORT = config.PORT;
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const bodyParser = require("body-parser");
const si = require("systeminformation");
require("./state/whatsappState");
//const { botPhoneNumber, connectionStatus } = require('./index');
app.use(express.static(path.join(__dirname, "..", "public")));
// Keep the RAW body around so the GitHub webhook can verify its HMAC signature.
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  }),
);
app.use(express.urlencoded({ extended: true }));
const dataFile = path.join(__dirname, "..", "data", "sharedData.json");

const cors = require("cors");
const allowdorigins = [
  "https://hansaka02.github.io",
  "http://alexainc.github.io",
];
app.use(cors({ origin: "https://alexainc.github.io" }));
// Setup session middleware
app.use(
  session({
    secret: config.SESSION_SECRET || "alexa-change-me-set-SESSION_SECRET",
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false, httpOnly: false, maxAge: 60 * 60 * 1000 },
  }),
);
const compression = require("compression");
app.use(compression());
// Check authentication
function isAuthenticated(req, res, next) {
  if (req.session.isLogged) {
    return next();
  } else if (
    req.headers.accept &&
    req.headers.accept.includes("application/json")
  ) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  } else {
    return res.redirect("/login"); // Redirect non-API users to the login page
  }
}

function readData() {
  try {
    const data = fs.readFileSync(dataFile, "utf8");
    return JSON.parse(data);
  } catch (err) {
    return null; // Return null if no data
  }
}

// Reads data every 5 seconds

// Route to check the WhatsApp connection status
// Route to check the WhatsApp connection status
// Route to get WhatsApp connection status
// Route to check the WhatsApp connection status
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

app.get("/status", (req, res) => {
  res.json({ status: readData().status || "Offline" });
});

app.get("/get-phone-number", (req, res) => {
  res.json({ phoneNumber: readData().number });
});

// Login and logout APIs
app.post("/login", (req, res) => {
  const { username, password } = req.body || {};
  // Reject when admin credentials are not configured — previously
  // `undefined === undefined` let anyone in with an empty payload.
  if (!config.ADMIN_USERNAME || !config.ADMIN_PASSWORD) {
    console.error(
      "❌ /login rejected: ADMIN_USERNAME/ADMIN_PASSWORD are not set",
    );
    return res
      .status(503)
      .json({ success: false, message: "Admin login not configured" });
  }
  if (typeof username !== "string" || typeof password !== "string") {
    return res
      .status(401)
      .json({ success: false, message: "Invalid credentials" });
  }
  // Compare hashed values (constant length, timing-safe comparison).
  const hash = (v) => crypto.createHash("sha256").update(v).digest();
  if (
    hash(username).equals(hash(config.ADMIN_USERNAME)) &&
    hash(password).equals(hash(config.ADMIN_PASSWORD))
  ) {
    req.session.isLogged = true;
    req.session.save();
    console.log(`Admin logged in: ${username}`);
    return res.json({ success: true });
  }
  console.log(`Failed login attempt: ${username}`);
  res.status(401).json({ success: false, message: "Invalid credentials" });
});

app.post("/logout", (req, res) => {
  console.log("Admin logged out");
  req.session.destroy(() => res.json({ success: true }));
});

// Route to check if user is logged in
app.get("/is-logged-in", (req, res) => {
  if (req.session.isLogged) {
    res.json({ isLoggedIn: true });
  } else {
    res.json({ isLoggedIn: false });
  }
});

// Serve control panel
app.get("/control", isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "control.html"));
});

// Route to download users.json file
app.get("/download-users-json", (req, res) => {
  const filePath = path.join(__dirname, "..", "data", "users.json"); // Path to your users.json file
  // Check if the file exists
  if (fs.existsSync(filePath)) {
    res.download(filePath, "users.json", (err) => {
      if (err) {
        res.status(500).json({ error: "Failed to download the file" });
      }
    });
  } else {
    res.status(404).json({ error: "File not found" });
  }
});

app.get("/download-hangman-json", (req, res) => {
  const filePath22 = path.join(__dirname, "..", "data", "hangman.json");

  if (fs.existsSync(filePath22)) {
    res.download(filePath22, "hangman.json", (err) => {
      if (err) {
        res.status(500).json({ error: "Failed to download the file" });
      }
    });
  } else {
    res.status(404).json({ error: "File not found" });
  }
});

// Serve login page
app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "login.html"));
});

app.get("/sysstats", async (req, res) => {
  try {
    const cpuData = await si.currentLoad();
    const memData = await si.mem();
    const netData = await si.networkStats();

    // CPU usage in percentage (0-100)
    const cpuUsage = cpuData.currentLoad;

    // Memory usage in percentage (0-100)
    const memUsage = (memData.used / memData.total) * 100;

    // networkStats() returns an array (one element per network interface).
    // We'll use the first interface (netData[0]) or you can sum them if needed.
    const downloadSpeed = netData[0].rx_sec; // bytes/sec
    const uploadSpeed = netData[0].tx_sec; // bytes/sec

    res.json({
      cpu: cpuUsage,
      memory: memUsage,
      downloadSpeed,
      uploadSpeed,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to retrieve system stats" });
  }
});

const http = require("http");
const server = http.createServer(app); // Create an HTTP server from Express

// --- MODIFICATION START ---
// Log server (for the control panel's live log streaming dashboard).
// This is the only WebSocket server in this file — the old "/data-transfer"
// bridge to index.js has been replaced with Node's built-in IPC (see below).
const logWss = new WebSocket.Server({ noServer: true });

// Handle the main HTTP 'upgrade' request to route clients based on path
server.on("upgrade", (request, socket, head) => {
  const pathname = request.url;

  if (pathname === "/logs") {
    // Route to your existing log server
    logWss.handleUpgrade(request, socket, head, (ws) => {
      logWss.emit("connection", ws, request);
    });
  } else {
    // No WebSocket server on this path
    console.log("Blocking WebSocket connection to unknown path:", pathname);
    socket.destroy();
  }
});

// --- 1. Your Original Log Functionality (now on /logs) ---
// This code is identical to your original, just attached to logWss
// Your dashboard client must now connect to: ws://your-server-address/logs
logWss.on("connection", (ws) => {
  // Function to send latest logs from both index.js and server.js logs
  const sendLogs = () => {
    const indexLogFilePath = path.join(__dirname, "..", "logs", "index.log");
    const serverLogFilePath = path.join(__dirname, "..", "logs", "server.log");

    // Read index.js logs
    fs.readFile(indexLogFilePath, "utf8", (err, indexData) => {
      if (err) {
        console.error("Error reading index.js logs:", err);
      } else {
        ws.send(
          JSON.stringify({
            type: "index",
            logs: indexData.split("\n").slice(-100),
          }),
        );
      }
    });

    // Read server.js logs
    fs.readFile(serverLogFilePath, "utf8", (err, serverData) => {
      if (err) {
        console.error("Error reading server.js logs:", err);
      } else {
        ws.send(
          JSON.stringify({
            type: "server",
            logs: serverData.split("\n").slice(-100),
          }),
        );
      }
    });
  };

  // Send logs every second
  const logInterval = setInterval(sendLogs, 100);

  // Handle WebSocket close
  ws.on("close", () => {
    console.log("Log WebSocket Client Disconnected");
    clearInterval(logInterval);
  });

  // Send logs immediately after connection
  sendLogs();
});

// --- 2. Data Transfer Functionality ---
// This used to be a "/data-transfer" WebSocket bridge between the server.js
// and index.js child processes. Since app.js already spawns both as child
// processes, we now use Node's built-in IPC channel (process.send /
// process.on('message')) instead — see app.js's relayMessage() for the
// parent-side relay logic. No WebSocket server or client registry needed.
// --- MODIFICATION END ---

// WEBHOOK_SECRET is read from config (see /github-webhook handler below).

// Use bodyParser to get the raw body for signature verification
app.use(express.json());

// This is your webhook endpoint
// This is your webhook endpoint
app.post("/github-webhook", async (req, res) => {
  // Made this async

  // Verify GitHub's HMAC signature when WEBHOOK_SECRET is configured.
  // Without it, anyone who can reach this port could forge a "push" event.
  if (config.WEBHOOK_SECRET) {
    const expected =
      "sha256=" +
      crypto
        .createHmac("sha256", config.WEBHOOK_SECRET)
        .update(req.rawBody || Buffer.from(""))
        .digest("hex");
    const given = req.headers["x-hub-signature-256"] || "";
    if (
      !given ||
      given.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected))
    ) {
      console.warn("[GitHub Webhook] Invalid or missing signature — rejected.");
      return res.status(403).send("Invalid signature");
    }
  } else {
    console.warn(
      "[GitHub Webhook] WEBHOOK_SECRET not set — signature NOT verified. Anyone can trigger this endpoint.",
    );
  }
  const event = req.headers["x-github-event"];
  const payload = req.body;

  // Check if it's a 'push' event
  if (event === "push") {
    try {
      const repo = payload.repository.name;
      const pusher = payload.pusher.name;
      const branch = payload.ref.split("/").pop();
      const commits = payload.commits;

      // --- 1. Start building the message string ---
      let message = `*📦 New Update to ${repo}*
*Branch:* \`${branch}\`
*By:* ${pusher}
-----------------------------------`;

      // --- 2. Add each commit to the string ---
      if (commits.length > 0) {
        commits.forEach((commit, index) => {
          const commitId = commit.id.substring(0, 7);
          const commitMessage = commit.message.split("\n")[0]; // First line only
          const author = commit.author.name;

          message += `\n\n*Commit ${index + 1} [ \`${commitId}\` ]*
*Author:* ${author}
*Message:* _${commitMessage}_`;
        });
      } else {
        message += "\n\n_No new commits in this push._";
      }

      // --- 3. Send the message to index.js via the parent (app.js) IPC relay ---
      // server.js -> app.js -> index.js, using Node's built-in fork IPC channel
      // (process.send). See app.js's relayMessage() for the relay logic.
      if (typeof process.send === "function") {
        process.send({
          type: "data",
          from: "github-webhook",
          payload: { message: message, value: 12345, event: "gitpush" },
        });
        console.log(
          '[GitHub Webhook] Sent push data to index.js via IPC.',
        );
      } else {
        console.warn(
          "[GitHub Webhook] process.send unavailable — is server.js running as a forked child with IPC enabled?",
        );
      }

      // --- 4. Log the message to your console ---
      console.log("--- Generated WhatsApp Message ---");
      console.log(message);
      console.log("----------------------------------");

      // --- 5. Send it via WhatsApp ---
      // ... (Your commented-out code for Baileys) ...
    } catch (e) {
      console.error(
        "[GitHub Webhook] Error processing push payload:",
        e.message,
      );
    }
  } else {
    console.log(`[GitHub Webhook] Received unhandled event: ${event}`);
  }

  // Send a 200 OK back to GitHub
  res.status(200).send("Event received");
});

//module.exports = app;
// Start server
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
