"use strict";

const fs = require("fs");
const os = require("os");

const PROC_MEMINFO = "/proc/meminfo";
const PROC_DIR = "/proc";

// cgroup v2 (modern Docker, systemd, HF Spaces)
const CG2_MAX = "/sys/fs/cgroup/memory.max";
const CG2_CURRENT = "/sys/fs/cgroup/memory.current";
const CG2_STAT = "/sys/fs/cgroup/memory.stat";
const CG2_SWAP_MAX = "/sys/fs/cgroup/memory.swap.max";
const CG2_SWAP_CURRENT = "/sys/fs/cgroup/memory.swap.current";

// cgroup v1 (older Docker hosts)
const CG1_LIMIT = "/sys/fs/cgroup/memory/memory.limit_in_bytes";
const CG1_USAGE = "/sys/fs/cgroup/memory/memory.usage_in_bytes";
const CG1_STAT = "/sys/fs/cgroup/memory/memory.stat";

const IS_LINUX = process.platform === "linux";

/** cgroup v1 writes this when "no limit" is set. */
const NO_LIMIT_SENTINEL = 0x7ffffffffffff000;

// ---------------------------------------------------------------------------
// small helpers
// ---------------------------------------------------------------------------

function readFileSafe(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

function readNumberSafe(file) {
  const raw = readFileSafe(file);
  if (raw === null) return null;
  const trimmed = raw.trim();
  if (trimmed === "max" || trimmed === "") return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

const clampPositive = (n) => (Number.isFinite(n) && n > 0 ? n : 0);
const percent = (part, whole) =>
  whole > 0 ? Math.min(100, Math.max(0, (part / whole) * 100)) : 0;

/**
 * Human readable size in the same units `free -h` uses (binary, 1024 based).
 *   formatBytes(372244480) -> "355Mi"
 *   formatBytes(2362232012) -> "2.2Gi"
 */
function formatBytes(bytes, { space = false } = {}) {
  if (!Number.isFinite(bytes)) return "n/a";
  const units = ["B", "Ki", "Mi", "Gi", "Ti", "Pi"];
  let value = Math.abs(bytes);
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  // free -h prints one decimal below 10 and drops it above, e.g. 2.2Gi / 355Mi
  const rendered =
    value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1);
  return `${bytes < 0 ? "-" : ""}${rendered}${space ? " " : ""}${units[unit]}`;
}

// ---------------------------------------------------------------------------
// /proc/meminfo
// ---------------------------------------------------------------------------

/**
 * Parse /proc/meminfo into { Key: bytes }. Every value in that file is in kB
 * (really KiB), so multiply by 1024.
 */
function readMeminfo() {
  const raw = readFileSafe(PROC_MEMINFO);
  if (!raw) return null;

  const out = {};
  for (const line of raw.split("\n")) {
    const match = /^(\w+(?:\(\w+\))?):\s+(\d+)(?:\s+(\w+))?/.exec(line);
    if (!match) continue;
    const value = Number(match[2]);
    out[match[1]] = match[3] === "kB" ? value * 1024 : value;
  }
  return Object.keys(out).length ? out : null;
}

/**
 * Host (or VM) wide memory, byte for byte identical to `free`.
 */
function hostMemory() {
  const info = IS_LINUX ? readMeminfo() : null;

  if (!info) {
    // macOS / Windows / unreadable procfs: os is all we have. No cache split
    // is available there, so buff/cache stays 0 and used === total - free.
    const total = os.totalmem();
    const free = os.freemem();
    return buildView({
      scope: "host",
      source: "os",
      total,
      free,
      buffers: 0,
      cached: 0,
      reclaimable: 0,
      shared: 0,
      available: free,
      swapTotal: 0,
      swapFree: 0,
      swapCached: 0,
    });
  }

  const total = info.MemTotal || os.totalmem();
  const free = info.MemFree || 0;
  const buffers = info.Buffers || 0;
  const cached = info.Cached || 0;
  const reclaimable = info.SReclaimable || 0;
  const shared = info.Shmem || 0;
  // MemAvailable exists on every kernel >= 3.14; fall back the way procps does.
  const available = info.MemAvailable ?? free + buffers + cached + reclaimable;

  return buildView({
    scope: "host",
    source: "procfs",
    total,
    free,
    buffers,
    cached,
    reclaimable,
    shared,
    available,
    swapTotal: info.SwapTotal || 0,
    swapFree: info.SwapFree || 0,
    swapCached: info.SwapCached || 0,
  });
}

// ---------------------------------------------------------------------------
// cgroup (Docker / Hugging Face Space / systemd slice)
// ---------------------------------------------------------------------------

function parseCgroupStat(file) {
  const raw = readFileSafe(file);
  if (!raw) return null;
  const out = {};
  for (const line of raw.split("\n")) {
    const [key, value] = line.split(/\s+/);
    if (key && value !== undefined) out[key] = Number(value);
  }
  return out;
}

/**
 * Container memory, or null when the process is not memory limited.
 *
 * The split mirrors the host view so the UI can render one single model:
 *   used       = everything that is NOT reclaimable page cache (anon + kernel)
 *   buff/cache = page cache + reclaimable slab
 *   free       = limit - current
 */
function containerMemory(hostTotal) {
  // ---- cgroup v2 ----
  const v2Limit = readNumberSafe(CG2_MAX);
  if (v2Limit && v2Limit > 0 && v2Limit < hostTotal) {
    const current = readNumberSafe(CG2_CURRENT) || 0;
    const stat = parseCgroupStat(CG2_STAT) || {};
    const cached = clampPositive(stat.file);
    const reclaimable = clampPositive(stat.slab_reclaimable);
    const shared = clampPositive(stat.shmem);
    const buffcache = cached + reclaimable;
    const used = Math.max(0, current - buffcache);
    const free = Math.max(0, v2Limit - current);
    const swapTotal = readNumberSafe(CG2_SWAP_MAX) || 0;
    const swapUsed = readNumberSafe(CG2_SWAP_CURRENT) || 0;

    return buildView({
      scope: "container",
      source: "cgroup-v2",
      total: v2Limit,
      free,
      buffers: 0,
      cached,
      reclaimable,
      shared,
      // page cache is reclaimable under pressure, so it counts as available
      available: Math.max(0, v2Limit - used),
      swapTotal,
      swapFree: Math.max(0, swapTotal - swapUsed),
      swapCached: 0,
    });
  }

  // ---- cgroup v1 ----
  const v1Limit = readNumberSafe(CG1_LIMIT);
  if (
    v1Limit &&
    v1Limit > 0 &&
    v1Limit < NO_LIMIT_SENTINEL &&
    v1Limit < hostTotal
  ) {
    const current = readNumberSafe(CG1_USAGE) || 0;
    const stat = parseCgroupStat(CG1_STAT) || {};
    const cached = clampPositive(stat.total_cache ?? stat.cache);
    const shared = clampPositive(stat.total_shmem ?? stat.shmem);
    const used = Math.max(0, current - cached);
    const free = Math.max(0, v1Limit - current);

    return buildView({
      scope: "container",
      source: "cgroup-v1",
      total: v1Limit,
      free,
      buffers: 0,
      cached,
      reclaimable: 0,
      shared,
      available: Math.max(0, v1Limit - used),
      swapTotal: 0,
      swapFree: 0,
      swapCached: 0,
    });
  }

  return null;
}

// ---------------------------------------------------------------------------
// normalised view
// ---------------------------------------------------------------------------

/**
 * Turn raw counters into the shape the API and the dashboard consume.
 * Invariant kept on purpose:  used + buffcache + free === total
 */
function buildView(raw) {
  const total = clampPositive(raw.total);
  const free = clampPositive(raw.free);
  const buffers = clampPositive(raw.buffers);
  const cached = clampPositive(raw.cached);
  const reclaimable = clampPositive(raw.reclaimable);
  const buffcache = buffers + cached + reclaimable;
  const used = Math.max(0, total - free - buffcache);
  const available = Math.min(total, clampPositive(raw.available));
  const swapTotal = clampPositive(raw.swapTotal);
  const swapFree = clampPositive(raw.swapFree);
  const swapUsed = Math.max(0, swapTotal - swapFree);

  return {
    scope: raw.scope,
    source: raw.source,

    total,
    used, // <- the honest number, matches `free`
    free,
    shared: clampPositive(raw.shared),
    available,

    buffcache: {
      total: buffcache,
      buffers,
      cached,
      reclaimable,
    },

    usedPercent: percent(used, total),
    cachePercent: percent(buffcache, total),
    freePercent: percent(free, total),
    availablePercent: percent(available, total),
    // How much of the box is genuinely spoken for (unreclaimable). Always >=
    // usedPercent; useful as a "real pressure" marker on the gauge.
    pressurePercent: percent(total - available, total),

    swap: {
      total: swapTotal,
      used: swapUsed,
      free: swapFree,
      cached: clampPositive(raw.swapCached),
      percent: percent(swapUsed, swapTotal),
    },
  };
}

// ---------------------------------------------------------------------------
// per process RSS (the bot + the panel themselves)
// ---------------------------------------------------------------------------

const PROCESS_CACHE_TTL_MS = 5000;
let processCache = { at: 0, value: [] };

/** Which of our own scripts we care about, in display order. */
const TRACKED = [
  { id: "index", label: "index.js", needle: "src/index.js" },
  { id: "server", label: "server.js", needle: "src/server.js" },
  { id: "app", label: "app.js", needle: "app.js" },
];

/**
 * Walk /proc and collect RSS for the alexa node processes. Cached for a few
 * seconds because the dashboard polls once per second.
 *
 * Also picks --max-old-space-size out of the command line, so the panel can
 * show "182Mi / 256Mi heap cap" for index.js (see the "ram limit" commit).
 */
function processMemory() {
  if (!IS_LINUX) return [];

  const now = Date.now();
  if (now - processCache.at < PROCESS_CACHE_TTL_MS) return processCache.value;

  const found = [];
  let pids;
  try {
    pids = fs.readdirSync(PROC_DIR);
  } catch {
    return [];
  }

  for (const pid of pids) {
    if (!/^\d+$/.test(pid)) continue;

    const cmdlineRaw = readFileSafe(`${PROC_DIR}/${pid}/cmdline`);
    if (!cmdlineRaw) continue;
    const args = cmdlineRaw.split("\0").filter(Boolean);
    if (!args.length || !/node|bun/.test(args[0])) continue;

    const cmdline = args.join(" ");
    const match = TRACKED.find(
      (t) => cmdline.includes(t.needle) && !cmdline.includes("--inspect-brk"),
    );
    if (!match) continue;
    // app.js also appears in the children's argv on some launchers; only accept
    // it when neither of the two workers matched first.
    if (match.id === "app" && /src\/(index|server)\.js/.test(cmdline)) continue;

    const status = readFileSafe(`${PROC_DIR}/${pid}/status`);
    const rssMatch = status && /VmRSS:\s+(\d+)\s+kB/.exec(status);
    const heapCap = /--max-old-space-size[= ](\d+)/.exec(cmdline);

    found.push({
      id: match.id,
      label: match.label,
      pid: Number(pid),
      rss: rssMatch ? Number(rssMatch[1]) * 1024 : null,
      heapCap: heapCap ? Number(heapCap[1]) * 1024 * 1024 : null,
      self: Number(pid) === process.pid,
    });
  }

  // stable order: index.js, server.js, app.js
  found.sort(
    (a, b) =>
      TRACKED.findIndex((t) => t.id === a.id) -
      TRACKED.findIndex((t) => t.id === b.id),
  );

  processCache = { at: now, value: found };
  return found;
}

// ---------------------------------------------------------------------------
// public API
// ---------------------------------------------------------------------------

/**
 * Full memory snapshot (synchronous — reading procfs is a few microseconds).
 *
 * @param {object}  [options]
 * @param {boolean} [options.processes=true] include per process RSS
 * @returns {object} see buildView() + { host, processes, node }
 */
function snapshot({ processes = true } = {}) {
  const host = hostMemory();
  const container = containerMemory(host.total);
  const view = container || host;

  return {
    ...view,
    // When limited, keep the host numbers around so the UI can show both.
    host: container ? host : null,
    limited: Boolean(container),
    processes: processes ? processMemory() : [],
    node: process.memoryUsage(),
    timestamp: Date.now(),
  };
}

/** Async flavour, for call sites that already `await`. */
async function snapshotAsync(options) {
  return snapshot(options);
}

/**
 * One line summary for chat output, e.g.
 *   "355Mi / 952Mi (37%)"
 */
function summary(snap = snapshot({ processes: false })) {
  return `${formatBytes(snap.used)} / ${formatBytes(snap.total)} (${Math.round(
    snap.usedPercent,
  )}%)`;
}

module.exports = {
  snapshot,
  snapshotAsync,
  summary,
  formatBytes,
  // exported for tests / advanced call sites
  hostMemory,
  containerMemory,
  processMemory,
  readMeminfo,
};
