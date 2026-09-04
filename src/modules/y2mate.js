/**
 * y2mate.js — talks directly to the backend that y2mate's frame uses (cnv.cx),
 * no Hugging Face proxy in between.
 *
 * Flow (same as https://frame.y2meta-uk.com/wwwindex.php):
 *   1. GET  https://cnv.cx/v2/sanity/key?id=<videoId>      -> { key }
 *   2. POST https://cnv.cx/v2/converter  (form-urlencoded, header "key") -> { url, filename }
 *   3. GET  <url>  (tunnel) with the same Origin/Referer     -> binary
 *
 * Exports: getInfo(url), yta(url) -> mp3 Buffer, ytv(url) -> mp4 Buffer
 */
const fetch = require("node-fetch");

const FRAME_ORIGIN = "https://frame.y2meta-uk.com";
const CNV = "https://cnv.cx/v2";

const commonHeaders = {
  accept: "*/*",
  "accept-language": "en-GB,en-US;q=0.9,en;q=0.8",
  Origin: FRAME_ORIGIN,
  Referer: FRAME_ORIGIN + "/",
  "User-Agent":
    "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
};

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

/**
 * Get Video Metadata (JSON)
 * { status, title, thumbnail, video_id, duration, channel }
 */
async function getInfo(url) {
  const videoId = getVideoId(url);

  // Primary: mattw proxy of the YouTube Data API (gives duration)
  try {
    const r = await fetch(
      `https://ytapi.apps.mattw.io/v3/videos?key=foo1&part=snippet%2CcontentDetails&id=${videoId}`,
      {
        headers: {
          Referer: "https://mattw.io/",
          "User-Agent": commonHeaders["User-Agent"],
        },
        timeout: 8000,
      },
    );
    const j = await r.json();
    if (j.items && j.items.length) {
      const it = j.items[0];
      const t = it.snippet.thumbnails;
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

  // Fallback: YouTube oEmbed (what y2mate's frame itself uses; no duration)
  try {
    const r = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
      { headers: { "User-Agent": commonHeaders["User-Agent"] }, timeout: 8000 },
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

async function getKey(videoId) {
  const r = await fetch(`${CNV}/sanity/key?id=${videoId}`, {
    headers: { ...commonHeaders, "content-type": "application/json" },
    timeout: 10000,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.key)
    throw new Error(`Key API error ${r.status}: ${JSON.stringify(j)}`);
  return j.key;
}

/**
 * Ask cnv.cx to convert; returns { url, filename }
 */
async function convert(
  videoId,
  format,
  { videoQuality = "720", audioBitrate = "128" } = {},
) {
  const key = await getKey(videoId);
  const body = new URLSearchParams({
    link: `https://youtu.be/${videoId}`,
    format,
    audioBitrate,
    videoQuality,
    filenameStyle: "pretty",
    vCodec: "h264",
  });
  const r = await fetch(`${CNV}/converter`, {
    method: "POST",
    headers: {
      ...commonHeaders,
      key,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
    timeout: 120000,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.url)
    throw new Error(`Converter error ${r.status}: ${JSON.stringify(j)}`);
  return { url: j.url, filename: j.filename || `${videoId}.${format}` };
}

/**
 * Direct Buffer Downloader
 * @param {string} url YouTube URL
 * @param {"audio"|"video"} type
 * @param {object} [opts] { videoQuality: "1080"|"720"|"360"|..., audioBitrate: "128"|"320" }
 */
async function yt(url, type = "audio", opts = {}) {
  const videoId = getVideoId(url);
  const format = type === "video" ? "mp4" : "mp3";
  const { url: dl } = await convert(videoId, format, opts);

  // Tunnel returns 403 without the frame Origin/Referer
  const r = await fetch(dl, { headers: commonHeaders, timeout: 0 });
  if (!r.ok) throw new Error(`Download failed with status: ${r.status}`);
  return await r.buffer();
}

/**
 * Like yt() but also returns the filename: { buffer, filename, videoId }
 */
async function ytWithMeta(url, type = "audio", opts = {}) {
  const videoId = getVideoId(url);
  const format = type === "video" ? "mp4" : "mp3";
  const { url: dl, filename } = await convert(videoId, format, opts);
  const r = await fetch(dl, { headers: commonHeaders, timeout: 0 });
  if (!r.ok) throw new Error(`Download failed with status: ${r.status}`);
  return { buffer: await r.buffer(), filename, videoId };
}

module.exports = {
  getInfo,
  getVideoId,
  convert,
  ytWithMeta,
  /** Returns raw MP3 Buffer */
  async yta(url, opts) {
    return await yt(url, "audio", opts);
  },
  /** Returns raw MP4 Buffer */
  async ytv(url, opts) {
    return await yt(url, "video", opts);
  },
};
