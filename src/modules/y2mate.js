/**
 * ytdlp.js — YouTube downloader for the bot.  Same exports as before:
 *
 *   getInfo(url)              -> { status, title, thumbnail, video_id, duration, channel }
 *   yta(url)                  -> audio Buffer   (m4a by default, mp3 if YTDL_AUDIO_FORMAT=mp3)
 *   ytv(url)                  -> mp4 Buffer
 *   ytWithMeta(url, type)     -> { buffer, filename, videoId, ext, mime, source, bucketUrl? }
 *
 * Order of attempts:
 *   1. local `ytdl` CLI binary  (yt-dlp + cookies + ffmpeg + HF-bucket cache/upload)
 *      -> result is fetched from the bucket (or read from the local temp file)
 *   2. hosted ytdl-go relays (Koyeb etc.)  POST /convert with 202 polling -> GET url
 *   3. legacy relays (cnv.cx based)         POST /convert -> POST /download
 *
 * Install on the VPS:  sudo bash install.sh   (puts ytdl, xet-upload, yt-dlp, deno, ffmpeg in /opt/ytdl/bin)
 *
 * Env:
 *   YTDL_BIN=/path/to/ytdl           path to the CLI binary   (default: ./bin/ytdl next to this file, else "ytdl")
 *   YTDL_BIN_DIR=/path/to/bin        prepended to PATH (default: folder of YTDL_BIN) for the child (yt-dlp, deno, ffmpeg, xet-upload)
 *   HF_TOKEN, HF_BUCKET             bucket (passed through to the CLI + used to fetch private files)
 *   COOKIES_URLS                    cookie file URL(s)        (passed through)
 *   YTDL_AUDIO_FORMAT=native        native|mp3|opus           (passed through as AUDIO_FORMAT)
 *   YTDL_MAX_HEIGHT=720             video cap
 *   YTDL_CONCURRENCY=1              max simultaneous local downloads
 *   YTDL_DISABLE=1                  skip local, relays only
 *   YTDL_RELAYS="https://xxx.koyeb.app,https://hansaka1-ytdl.hf.space"   tried in order
 *   YTDL_RELAY_KEY=<secret>         sent as x-relay-key
 */
const fetch = require("node-fetch");
const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");

// ---------------------------------------------------------------- config
// Default layout: ./bin/ytdl next to this file (plus xet-upload, yt-dlp_linux, deno, ffmpeg in the same folder)
const HERE_BIN = path.join(__dirname, "bin", "ytdl");
const YTDL_BIN =
  process.env.YTDL_BIN || (fs.existsSync(HERE_BIN) ? HERE_BIN : "ytdl");
const BIN_DIR = process.env.YTDL_BIN_DIR || path.dirname(YTDL_BIN);
const HF_TOKEN = process.env.HF_TOKEN || "";
const AUDIO_FORMAT =
  process.env.YTDL_AUDIO_FORMAT || process.env.AUDIO_FORMAT || "native";
const MAX_HEIGHT = parseInt(
  process.env.YTDL_MAX_HEIGHT || process.env.YTDLP_MAX_HEIGHT || "720",
  10,
);
const CONCURRENCY = Math.max(
  1,
  parseInt(
    process.env.YTDL_CONCURRENCY || process.env.YTDLP_CONCURRENCY || "1",
    10,
  ),
);
const LOCAL_DISABLED =
  process.env.YTDL_DISABLE === "1" || process.env.YTDLP_DISABLE === "1";

const RELAYS = (
  process.env.YTDL_RELAYS ||
  "https://absolute-vonnie-alexainc-ec756816.koyeb.app,https://hansaka1-ytdl.hf.space,https://cold-lemming-3841.alexainc.deno.net"
)
  .split(",")
  .map((s) => s.trim().replace(/\/$/, ""))
  .filter(Boolean);
const RELAY_KEY = process.env.YTDL_RELAY_KEY || "";

const UA =
  "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
const MIME = {
  m4a: "audio/mp4",
  mp3: "audio/mpeg",
  opus: "audio/ogg",
  mp4: "video/mp4",
};

const ytIdRegex =
  /(?:http(?:s|):\/\/|)(?:(?:www\.|m\.|music\.|)youtube(?:\-nocookie|)\.com\/(?:shorts\/|live\/)?(?:watch\?.*(?:|\&)v=|embed\/|v\/)?|youtu\.be\/)([-_0-9A-Za-z]{11})/;

function getVideoId(url) {
  const s = String(url || "").trim();
  if (/^[-_0-9A-Za-z]{11}$/.test(s)) return s;
  const m = s.match(ytIdRegex);
  if (!m) throw new Error("Invalid YouTube URL");
  return m[1];
}
function fmtSeconds(sec) {
  sec = Math.max(0, parseInt(sec || 0, 10));
  const h = Math.floor(sec / 3600),
    mi = Math.floor((sec % 3600) / 60),
    s = sec % 60;
  return (
    (h ? h + ":" : "") +
    (h ? String(mi).padStart(2, "0") : mi) +
    ":" +
    String(s).padStart(2, "0")
  );
}
function parseDuration(iso) {
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso || "");
  return m
    ? fmtSeconds((+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0))
    : "0:00";
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- semaphore + in-flight dedupe
let running = 0;
const waiters = [];
const acquire = () =>
  new Promise((res) =>
    running < CONCURRENCY ? (running++, res()) : waiters.push(res),
  );
const release = () => {
  const n = waiters.shift();
  n ? n() : running--;
};
const inflight = new Map();

// ---------------------------------------------------------------- local CLI
let localAvailable = null;
let localDisabledUntil = 0;
const LOCAL_BACKOFF = 15 * 60 * 1000;

function childEnv() {
  const env = { ...process.env };
  if (BIN_DIR && BIN_DIR !== ".") env.PATH = `${BIN_DIR}:${env.PATH || ""}`;
  env.AUDIO_FORMAT = AUDIO_FORMAT;
  env.MAX_HEIGHT = String(MAX_HEIGHT);
  return env;
}

function cli(args, timeoutMs) {
  return new Promise((resolve, reject) => {
    execFile(
      YTDL_BIN,
      args,
      { env: childEnv(), timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 },
      (err, stdout, stderr) => {
        let json = null;
        try {
          json = JSON.parse(String(stdout).trim().split("\n").pop());
        } catch (_) {}
        if (json && json.ok) return resolve(json);
        const e = new Error(
          (json && json.error) ||
            (err &&
              (err.code === "ENOENT"
                ? "ytdl binary not found"
                : err.message)) ||
            "ytdl failed",
        );
        e.stderr = String(stderr || "");
        e.code = err && err.code;
        reject(e);
      },
    );
  });
}

async function checkLocal() {
  if (LOCAL_DISABLED) return (localAvailable = false);
  if (localAvailable !== null) return localAvailable;
  try {
    const d = await cli(["doctor"], 30000);
    localAvailable = !!(d.ytdlp && d.ffmpeg && d.deno);
    if (!localAvailable) console.warn("[ytdl] doctor:", JSON.stringify(d));
    else
      console.log(
        `[ytdl] local ok: yt-dlp ${d.ytdlp}, bucket=${d.bucket || "none"}, cookies=${(d.cookies || []).length}`,
      );
  } catch (e) {
    console.warn("[ytdl] local CLI not usable, relay only:", e.message);
    localAvailable = false;
  }
  return localAvailable;
}

const isBotCheck = (s) =>
  /sign in to confirm|not a bot|HTTP Error 429|login_required|no longer valid/i.test(
    String(s),
  );

/** fetch a (possibly private) bucket URL -> Buffer.  Token only sent to huggingface.co, not to the CDN. */
async function fetchBucket(url) {
  const headers = { "User-Agent": UA };
  if (HF_TOKEN && /^https:\/\/huggingface\.co\//.test(url))
    headers.Authorization = `Bearer ${HF_TOKEN}`;
  const r = await fetch(url, { headers, redirect: "follow", timeout: 0 });
  if (!r.ok) throw new Error(`bucket HTTP ${r.status}`);
  return r.buffer();
}

async function localDownload(url, type) {
  const videoId = getVideoId(url);
  const isVideo = type === "video";
  await acquire();
  try {
    const r = await cli(
      ["get", videoId, "--type", isVideo ? "video" : "audio"],
      isVideo ? 15 * 60 * 1000 : 8 * 60 * 1000,
    );
    let buffer;
    if (r.local && fs.existsSync(r.local)) {
      buffer = fs.readFileSync(r.local);
      fs.rm(path.dirname(r.local), { recursive: true, force: true }, () => {});
    } else if (r.bucket_url) {
      buffer = await fetchBucket(r.bucket_url);
    } else throw new Error("ytdl returned neither local file nor bucket url");
    return {
      buffer,
      filename: r.filename || `${videoId}.${r.ext}`,
      videoId,
      ext: r.ext,
      mime: MIME[r.ext] || "application/octet-stream",
      source: r.cached ? "bucket" : "ytdl",
      bucketUrl: r.bucket_url,
      title: r.title,
    };
  } catch (e) {
    if (isBotCheck(e.message + e.stderr)) {
      console.warn(
        "[ytdl] bot-check / cookies rejected on this IP, using relays for 15 min",
      );
      localDisabledUntil = Date.now() + LOCAL_BACKOFF;
    }
    throw new Error("ytdl failed: " + e.message);
  } finally {
    release();
  }
}

async function localInfo(url) {
  const j = await cli(["info", getVideoId(url)], 60000);
  return {
    status: "success",
    title: j.title,
    thumbnail: j.thumbnail,
    video_id: j.video_id,
    duration: j.duration_str || fmtSeconds(j.duration),
    channel: j.channel || "YouTube",
  };
}

// ---------------------------------------------------------------- relays
function relayHeaders(json = true) {
  const h = { accept: "*/*", "User-Agent": UA };
  if (json) h["content-type"] = "application/json";
  if (RELAY_KEY) h["x-relay-key"] = RELAY_KEY;
  return h;
}
const blockedUntil = new Map();
const BLOCK_TTL = 30 * 60 * 1000;
const post = (base, p, body, timeout) =>
  fetch(`${base}${p}`, {
    method: "POST",
    headers: relayHeaders(),
    body: JSON.stringify(body),
    timeout,
  });

async function relayDownload(url, type) {
  const videoId = getVideoId(url);
  const errors = [];
  for (const base of RELAYS) {
    if ((blockedUntil.get(base) || 0) > Date.now()) continue;
    try {
      // POST /convert — ytdl-go relays answer 202 while working; poll up to ~4 min
      let cj = null;
      const deadline = Date.now() + 4 * 60 * 1000;
      for (;;) {
        const c = await post(base, "/convert", { url: videoId, type }, 60000);
        cj = await c.json().catch(() => ({}));
        if (
          c.status === 202 &&
          cj.status === "processing" &&
          Date.now() < deadline
        ) {
          await sleep((cj.retry_after || 5) * 1000);
          continue;
        }
        if (!c.ok || !cj.url) throw new Error(cj.error || `HTTP ${c.status}`);
        break;
      }
      // fetch the file: prefer the link the relay gave (bucket stream), else /download
      let buffer;
      const r = await fetch(cj.url, {
        headers: relayHeaders(false),
        redirect: "follow",
        timeout: 0,
      });
      if (r.ok) buffer = await r.buffer();
      else {
        const d = await post(base, "/download", { url: videoId, type }, 0);
        if (!d.ok) throw new Error(`download HTTP ${d.status}`);
        buffer = await d.buffer();
      }
      const ext =
        (cj.filename && cj.filename.split(".").pop().toLowerCase()) ||
        (type === "video" ? "mp4" : "mp3");
      return {
        buffer,
        filename: cj.filename || `${videoId}.${ext}`,
        videoId,
        ext,
        mime: MIME[ext] || "application/octet-stream",
        source: base,
        bucketUrl: cj.bucket_url,
      };
    } catch (e) {
      errors.push(`${base}: ${e.message}`);
      if (/cloudflare|blocked|Attention Required/i.test(e.message))
        blockedUntil.set(base, Date.now() + BLOCK_TTL);
    }
  }
  throw new Error("All relays failed:\n  " + errors.join("\n  "));
}

// ---------------------------------------------------------------- public API
async function getInfo(url) {
  const videoId = getVideoId(url);
  if ((await checkLocal()) && Date.now() > localDisabledUntil) {
    try {
      return await localInfo(url);
    } catch (_) {}
  }
  try {
    const r = await fetch(
      `https://ytapi.apps.mattw.io/v3/videos?key=foo1&part=snippet%2CcontentDetails&id=${videoId}`,
      {
        headers: { Referer: "https://mattw.io/", "User-Agent": UA },
        timeout: 8000,
      },
    );
    const j = await r.json();
    if (j.items && j.items.length) {
      const it = j.items[0],
        t = it.snippet.thumbnails;
      return {
        status: "success",
        title: it.snippet.title,
        thumbnail: (t.maxres || t.high || t.medium).url,
        video_id: videoId,
        duration: parseDuration(it.contentDetails.duration),
        channel: it.snippet.channelTitle,
      };
    }
  } catch (_) {}
  try {
    const r = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
      { headers: { "User-Agent": UA }, timeout: 8000 },
    );
    if (r.ok) {
      const j = await r.json();
      return {
        status: "success",
        title: j.title,
        thumbnail: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
        video_id: videoId,
        duration: "0:00",
        channel: j.author_name,
      };
    }
  } catch (_) {}
  for (const base of RELAYS) {
    try {
      const r = await post(base, "/get-info", { url }, 15000);
      if (r.ok) return await r.json();
    } catch (_) {}
  }
  return {
    status: "success",
    title: `YouTube Video (${videoId})`,
    thumbnail: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
    video_id: videoId,
    duration: "0:00",
    channel: "YouTube",
  };
}

/** Download. Returns { buffer, filename, videoId, ext, mime, source, bucketUrl? } */
async function ytWithMeta(url, type = "audio") {
  const key = `${getVideoId(url)}:${type}`;
  if (inflight.has(key)) return inflight.get(key);
  const p = (async () => {
    let localErr;
    if ((await checkLocal()) && Date.now() > localDisabledUntil) {
      try {
        return await localDownload(url, type);
      } catch (e) {
        localErr = e;
        console.warn(
          "[ytdl] local failed, falling back to relay:",
          e.message.slice(0, 200),
        );
      }
    }
    try {
      return await relayDownload(url, type);
    } catch (e) {
      throw new Error((localErr ? localErr.message + "\n" : "") + e.message);
    }
  })();
  inflight.set(key, p);
  try {
    return await p;
  } finally {
    inflight.delete(key);
  }
}

module.exports = {
  getInfo,
  getVideoId,
  ytWithMeta,
  /** audio Buffer (m4a unless YTDL_AUDIO_FORMAT=mp3) — check .ext/.mime from ytWithMeta if you need to know */
  async yta(url) {
    return (await ytWithMeta(url, "audio")).buffer;
  },
  /** mp4 Buffer */
  async ytv(url) {
    return (await ytWithMeta(url, "video")).buffer;
  },
};
