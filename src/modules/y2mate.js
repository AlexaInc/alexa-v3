/**
 * ytdlp.js — YouTube downloader: local yt-dlp first, relay fallback.
 *
 *   1. yt-dlp on this machine (no cookies; tv_embedded -> android_vr -> android
 *      player clients) + ffmpeg for mp3 / mp4 merge.
 *   2. If yt-dlp fails (bot check, missing binary, etc.) -> hosted relays
 *      (Hugging Face / Deno) using the y2mate/cnv.cx backend.
 *
 * Exports (same API as y2mate-hf.js):
 *   getInfo(url)              -> { status, title, thumbnail, video_id, duration, channel }
 *   yta(url)                  -> mp3 Buffer
 *   ytv(url)                  -> mp4 Buffer
 *   ytWithMeta(url, type)     -> { buffer, filename, videoId, source }
 *
 * Requirements for the local path:  pip install -U yt-dlp   &&  apt install ffmpeg
 *
 * Env (optional):
 *   YTDLP_BIN=yt-dlp            path to yt-dlp
 *   FFMPEG_BIN=ffmpeg           path to ffmpeg
 *   YTDLP_CONCURRENCY=1         max simultaneous local downloads (RAM: ~80 MB each)
 *   YTDLP_TMP=/tmp/ytdlp        temp dir
 *   YTDLP_MAX_HEIGHT=720        video resolution cap
 *   YTDLP_PROXY=socks5://...    proxy for yt-dlp only
 *   YTDLP_DISABLE=1             skip local yt-dlp, relay only
 *   YTDL_RELAYS="https://a/api/ytdl,https://b"   relays, tried in order
 *   YTDL_RELAY_KEY=<secret>     sent as x-relay-key
 */
const fetch = require("node-fetch");
const { execFile } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

// ---------------------------------------------------------------- config
const YTDLP = process.env.YTDLP_BIN || "yt-dlp";
const FFMPEG = process.env.FFMPEG_BIN || "ffmpeg";
const CONCURRENCY = Math.max(
  1,
  parseInt(process.env.YTDLP_CONCURRENCY || "1", 10),
);
const TMP = process.env.YTDLP_TMP || path.join(os.tmpdir(), "ytdlp");
const MAX_HEIGHT = parseInt(process.env.YTDLP_MAX_HEIGHT || "720", 10);
const YTDLP_PROXY = process.env.YTDLP_PROXY || "";
const LOCAL_DISABLED = process.env.YTDLP_DISABLE === "1";
const CLIENTS = ["tv_embedded", "android_vr", "android"];

const RELAYS = (
  process.env.YTDL_RELAYS ||
  "https://hansaka1-ytdl.hf.space,https://cold-lemming-3841.alexainc.deno.net,https://stopcasl-stopca.hf.space/api/ytdl"
)
  .split(",")
  .map((s) => s.trim().replace(/\/$/, ""))
  .filter(Boolean);
const RELAY_KEY = process.env.YTDL_RELAY_KEY || "";

const UA =
  "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";

const ytIdRegex =
  /(?:http(?:s|):\/\/|)(?:(?:www\.|m\.|)youtube(?:\-nocookie|)\.com\/(?:shorts\/|live\/)?(?:watch\?.*(?:|\&)v=|embed\/|v\/)?|youtu\.be\/)([-_0-9A-Za-z]{11})/;

function getVideoId(url) {
  const m = String(url || "").match(ytIdRegex);
  if (!m) throw new Error("Invalid YouTube URL");
  return m[1];
}

function fmtSeconds(sec) {
  sec = Math.max(0, parseInt(sec || 0, 10));
  const h = Math.floor(sec / 3600),
    mi = Math.floor((sec % 3600) / 60),
    s = sec % 60;
  const mm = h ? String(mi).padStart(2, "0") : String(mi);
  return (h ? h + ":" : "") + mm + ":" + String(s).padStart(2, "0");
}

function parseDuration(iso) {
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso || "");
  if (!m) return "0:00";
  return fmtSeconds((+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0));
}

const safeName = (s) =>
  String(s || "")
    .replace(/[\\/:*?"<>|\r\n]+/g, "_")
    .trim()
    .slice(0, 150);

// ---------------------------------------------------------------- tiny semaphore
let running = 0;
const waiters = [];
function acquire() {
  return new Promise((resolve) => {
    if (running < CONCURRENCY) {
      running++;
      resolve();
    } else waiters.push(resolve);
  });
}
function release() {
  const next = waiters.shift();
  if (next) next();
  else running--;
}

// ---------------------------------------------------------------- yt-dlp runner
let localAvailable = null; // null = unknown, true/false after first check
let localDisabledUntil = 0; // back off local after repeated bot-check failures
const LOCAL_BACKOFF = 15 * 60 * 1000;

function run(cmd, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    execFile(
      cmd,
      args,
      { timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          err.stdout = stdout;
          err.stderr = stderr;
          return reject(err);
        }
        resolve({ stdout, stderr });
      },
    );
  });
}

async function checkLocal() {
  if (LOCAL_DISABLED) return (localAvailable = false);
  if (localAvailable !== null) return localAvailable;
  try {
    await run(YTDLP, ["--version"], 15000);
    await run(FFMPEG, ["-version"], 15000);
    localAvailable = true;
  } catch (e) {
    console.warn(
      "[ytdlp] local yt-dlp/ffmpeg not usable, relay only:",
      e.code || e.message,
    );
    localAvailable = false;
  }
  return localAvailable;
}

function baseArgs(client) {
  const a = [
    "--no-warnings",
    "--no-playlist",
    "--no-progress",
    "--quiet",
    "--no-cache-dir",
    "--retries",
    "3",
    "--fragment-retries",
    "3",
    "--socket-timeout",
    "20",
    "--ffmpeg-location",
    FFMPEG,
    "--extractor-args",
    `youtube:player_client=${client}`,
  ];
  if (YTDLP_PROXY) a.push("--proxy", YTDLP_PROXY);
  return a;
}

const isBotCheck = (s) =>
  /sign in to confirm|not a bot|HTTP Error 429|HTTP Error 403|Requested format is not available|page needs to be reloaded/i.test(
    String(s),
  );

/** Download with yt-dlp. Returns { buffer, filename, videoId, source:"yt-dlp" } */
async function localDownload(url, type) {
  const videoId = getVideoId(url);
  const isVideo = type === "video";
  fs.mkdirSync(TMP, { recursive: true });
  const stem = path.join(
    TMP,
    `${videoId}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
  );
  const outTpl = `${stem}.%(ext)s`;

  await acquire();
  let lastErr;
  try {
    for (const client of CLIENTS) {
      const args = baseArgs(client).concat(
        [
          "--print",
          "after_move:filepath",
          "--print",
          "after_move:title",
          "-o",
          outTpl,
        ],
        isVideo
          ? [
              "-f",
              `bv[height<=${MAX_HEIGHT}][ext=mp4]+ba[ext=m4a]/b[height<=${MAX_HEIGHT}][ext=mp4]/bv[height<=${MAX_HEIGHT}]+ba/b`,
              "--merge-output-format",
              "mp4",
            ]
          : [
              "-f",
              "ba[ext=m4a]/ba/b",
              "-x",
              "--audio-format",
              "mp3",
              "--audio-quality",
              "128K",
            ],
        [url],
      );
      try {
        const { stdout } = await run(
          YTDLP,
          args,
          isVideo ? 10 * 60 * 1000 : 5 * 60 * 1000,
        );
        const lines = stdout
          .trim()
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean);
        let filePath =
          lines.find((l) => l.startsWith(stem)) ||
          `${stem}.${isVideo ? "mp4" : "mp3"}`;
        const title = lines.find((l) => !l.startsWith(stem)) || videoId;
        if (!fs.existsSync(filePath)) {
          const found = fs
            .readdirSync(TMP)
            .find(
              (f) =>
                f.startsWith(path.basename(stem)) && /\.(mp3|mp4)$/.test(f),
            );
          if (!found) throw new Error("yt-dlp finished but no output file");
          filePath = path.join(TMP, found);
        }
        const buffer = fs.readFileSync(filePath);
        fs.unlink(filePath, () => {});
        return {
          buffer,
          filename: `${safeName(title)}.${isVideo ? "mp4" : "mp3"}`,
          videoId,
          source: "yt-dlp",
        };
      } catch (e) {
        lastErr = e;
        const msg =
          (e.stderr || e.message || "")
            .toString()
            .split("\n")
            .filter(Boolean)
            .pop() || e.message;
        console.warn(`[ytdlp] client=${client} failed: ${msg.slice(0, 160)}`);
        // cleanup partials
        try {
          fs.readdirSync(TMP)
            .filter((f) => f.startsWith(path.basename(stem)))
            .forEach((f) => fs.unlinkSync(path.join(TMP, f)));
        } catch (_) {}
        if (!isBotCheck(msg) && !/format is not available/i.test(msg)) break; // hard error, don't try other clients
      }
    }
  } finally {
    release();
  }
  const msg = (lastErr && (lastErr.stderr || lastErr.message)) || "unknown";
  if (isBotCheck(msg)) {
    console.warn(
      "[ytdlp] YouTube bot-check on this IP, using relay for 15 min",
    );
    localDisabledUntil = Date.now() + LOCAL_BACKOFF;
  }
  throw new Error(
    "yt-dlp failed: " + String(msg).split("\n").filter(Boolean).pop(),
  );
}

/** Metadata via yt-dlp (no download). */
async function localInfo(url) {
  const videoId = getVideoId(url);
  const { stdout } = await run(
    YTDLP,
    baseArgs("tv_embedded").concat([
      "--skip-download",
      "--print",
      "%(title)s\t%(duration)s\t%(channel,uploader)s",
      url,
    ]),
    30000,
  );
  const [title, duration, channel] = stdout.trim().split("\t");
  if (!title) throw new Error("no title");
  return {
    status: "success",
    title,
    thumbnail: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
    video_id: videoId,
    duration: fmtSeconds(duration),
    channel: channel || "YouTube",
  };
}

// ---------------------------------------------------------------- relays
function relayHeaders() {
  const h = {
    "content-type": "application/json",
    accept: "*/*",
    "User-Agent": UA,
  };
  if (RELAY_KEY) h["x-relay-key"] = RELAY_KEY;
  return h;
}
const blockedUntil = new Map();
const BLOCK_TTL = 30 * 60 * 1000;
const isBlockedMsg = (s) =>
  /cloudflare|blocked|Attention Required/i.test(String(s));

function post(base, p, body, timeout) {
  return fetch(`${base}${p}`, {
    method: "POST",
    headers: relayHeaders(),
    body: JSON.stringify(body),
    timeout,
  });
}

async function relayDownload(url, type) {
  const videoId = getVideoId(url);
  const ext = type === "video" ? "mp4" : "mp3";
  const errors = [];
  for (const base of RELAYS) {
    if ((blockedUntil.get(base) || 0) > Date.now()) continue;
    try {
      // /convert first: cheap, tells us quickly if this relay is CF-blocked
      const c = await post(base, "/convert", { url, type }, 120000);
      const cj = await c.json().catch(() => ({}));
      if (!c.ok || !cj.url) {
        const msg = cj.error || `HTTP ${c.status}`;
        errors.push(`${base}: ${msg}`);
        if (isBlockedMsg(msg)) {
          console.warn(
            `[ytdlp] relay ${base} is Cloudflare-blocked, skipping for 30 min`,
          );
          blockedUntil.set(base, Date.now() + BLOCK_TTL);
        }
        continue;
      }
      const r = await post(base, "/download", { url, type }, 0);
      if (!r.ok) {
        let msg = `download HTTP ${r.status}`;
        try {
          msg += " " + (await r.json()).error;
        } catch (_) {}
        errors.push(`${base}: ${msg}`);
        continue;
      }
      return {
        buffer: await r.buffer(),
        filename: cj.filename || `${videoId}.${ext}`,
        videoId,
        source: base,
      };
    } catch (e) {
      errors.push(`${base}: ${e.message}`);
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
      const r = await post(base, "/get-info", { url }, 10000);
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

/**
 * Download. Returns { buffer, filename, videoId, source }
 * source = "yt-dlp" or the relay base URL that served it.
 */
async function ytWithMeta(url, type = "audio") {
  getVideoId(url); // validate early
  let localErr;
  if ((await checkLocal()) && Date.now() > localDisabledUntil) {
    try {
      return await localDownload(url, type);
    } catch (e) {
      localErr = e;
      console.warn(
        "[ytdlp] local failed, falling back to relay:",
        e.message.slice(0, 200),
      );
    }
  }
  try {
    return await relayDownload(url, type);
  } catch (e) {
    throw new Error((localErr ? localErr.message + "\n" : "") + e.message);
  }
}

module.exports = {
  getInfo,
  getVideoId,
  ytWithMeta,
  /** Returns raw MP3 Buffer */
  async yta(url) {
    return (await ytWithMeta(url, "audio")).buffer;
  },
  /** Returns raw MP4 Buffer */
  async ytv(url) {
    return (await ytWithMeta(url, "video")).buffer;
  },
};
