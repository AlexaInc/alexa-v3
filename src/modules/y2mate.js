/**
 * y2mate-hf.js — YouTube downloader via your hosted relays (Project Shield on
 * Hugging Face, with Deno Deploy as automatic fallback).
 *
 * Relay endpoints (same on both):
 *   POST <base>/get-info  { url }          -> metadata JSON   (HF only)
 *   POST <base>/convert   { url, type }    -> { url, filename, video_id }
 *   POST <base>/download  { url, type }    -> streams mp3/mp4
 *
 * Exports: getInfo(url), yta(url) -> mp3 Buffer, ytv(url) -> mp4 Buffer,
 *          ytWithMeta(url, type) -> { buffer, filename, videoId }
 *
 * Env (optional):
 *   YTDL_RELAYS="https://a/api/ytdl,https://b"   comma-separated, tried in order
 *   YTDL_RELAY_KEY=<secret>                      sent as x-relay-key
 */
const fetch = require("node-fetch");

const RELAYS = (
  process.env.YTDL_RELAYS ||
  "https://stopcasl-stopca.hf.space/api/ytdl,https://cold-lemming-3841.alexainc.deno.net"
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

function parseDuration(iso) {
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso || "");
  if (!m) return "0:00";
  const h = +m[1] || 0,
    mi = +m[2] || 0,
    s = +m[3] || 0;
  const mm = h ? String(mi).padStart(2, "0") : String(mi);
  return (h ? h + ":" : "") + mm + ":" + String(s).padStart(2, "0");
}

function headers() {
  const h = {
    "content-type": "application/json",
    accept: "*/*",
    "User-Agent": UA,
  };
  if (RELAY_KEY) h["x-relay-key"] = RELAY_KEY;
  return h;
}

// Remember relays that reported a Cloudflare block so we skip them for a while.
const blockedUntil = new Map();
const BLOCK_TTL = 30 * 60 * 1000;
const isBlockedMsg = (s) =>
  /cloudflare|blocked|Attention Required/i.test(String(s));

async function post(base, path, body, timeout) {
  return fetch(`${base}${path}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
    timeout,
  });
}

/**
 * Get Video Metadata (JSON)
 * { status, title, thumbnail, video_id, duration, channel }
 */
async function getInfo(url) {
  const videoId = getVideoId(url);

  // 1) relay /get-info (Project Shield route)
  for (const base of RELAYS) {
    try {
      const r = await post(base, "/get-info", { url }, 10000);
      if (r.ok) return await r.json();
    } catch (_) {}
  }

  // 2) direct: mattw proxy of the YouTube Data API
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

  // 3) direct: YouTube oEmbed
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
 * Ask a relay to convert; returns { url, filename, videoId, base }
 * Tries relays in order, skipping ones recently seen as Cloudflare-blocked.
 */
async function convert(url, type = "audio") {
  const videoId = getVideoId(url);
  const errors = [];
  for (const base of RELAYS) {
    if ((blockedUntil.get(base) || 0) > Date.now()) continue;
    try {
      const r = await post(base, "/convert", { url, type }, 120000);
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.url)
        return {
          url: j.url,
          filename:
            j.filename || `${videoId}.${type === "video" ? "mp4" : "mp3"}`,
          videoId,
          base,
        };
      const msg = j.error || `HTTP ${r.status}`;
      errors.push(`${base}: ${msg}`);
      if (isBlockedMsg(msg)) {
        console.warn(
          `[y2mate] ${base} is Cloudflare-blocked, skipping for 30 min`,
        );
        blockedUntil.set(base, Date.now() + BLOCK_TTL);
      }
    } catch (e) {
      errors.push(`${base}: ${e.message}`);
    }
  }
  throw new Error("All relays failed:\n  " + errors.join("\n  "));
}

/**
 * Download via relay. Returns { buffer, filename, videoId }
 */
async function ytWithMeta(url, type = "audio") {
  const conv = await convert(url, type);

  // Prefer streaming through the relay that just did the conversion
  // (tunnel host is also Cloudflare-gated, so direct fetch from a blocked IP fails).
  const r = await post(conv.base, "/download", { url, type }, 0);
  if (r.ok)
    return {
      buffer: await r.buffer(),
      filename: conv.filename,
      videoId: conv.videoId,
    };

  let msg = `Relay download failed: ${r.status}`;
  try {
    msg += " " + (await r.json()).error;
  } catch (_) {}
  throw new Error(msg);
}

async function yt(url, type) {
  return (await ytWithMeta(url, type)).buffer;
}

module.exports = {
  getInfo,
  getVideoId,
  convert,
  ytWithMeta,
  /** Returns raw MP3 Buffer */
  async yta(url) {
    return await yt(url, "audio");
  },
  /** Returns raw MP4 Buffer */
  async ytv(url) {
    return await yt(url, "video");
  },
};
