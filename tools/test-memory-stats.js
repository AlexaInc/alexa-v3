#!/usr/bin/env node
/*
 * tools/test-memory-stats.js
 *
 * Verifies src/modules/memoryStats.js against the system's own `free`.
 *
 *   node tools/test-memory-stats.js
 *
 * It prints the module's snapshot next to `free -h`, checks the invariant
 * used + buff/cache + free === total, and replays the exact numbers from the
 * bug report (952Mi box reported as 93%) through the same arithmetic.
 */

"use strict";

const { execSync } = require("child_process");
const memoryStats = require("../src/modules/memoryStats");
const { formatBytes } = memoryStats;

let failures = 0;

function check(label, condition, detail = "") {
  const mark = condition ? "✅" : "❌";
  if (!condition) failures += 1;
  console.log(`${mark} ${label}${detail ? `  ${detail}` : ""}`);
}

function pad(s, n) {
  return String(s).padStart(n);
}

// ---------------------------------------------------------------------------
console.log("\n── snapshot ────────────────────────────────────────────────\n");

const snap = memoryStats.snapshot();

console.log(
  `scope:   ${snap.scope} (${snap.source})${snap.limited ? "  [cgroup limited]" : ""}`,
);
console.log(
  [
    "",
    pad("total", 10),
    pad("used", 10),
    pad("free", 10),
    pad("shared", 10),
    pad("buff/cache", 12),
    pad("available", 11),
  ].join(""),
);
console.log(
  [
    "Mem:",
    pad(formatBytes(snap.total), 10),
    pad(formatBytes(snap.used), 10),
    pad(formatBytes(snap.free), 10),
    pad(formatBytes(snap.shared), 10),
    pad(formatBytes(snap.buffcache.total), 12),
    pad(formatBytes(snap.available), 11),
  ].join(""),
);
console.log(
  [
    "Swap:",
    pad(formatBytes(snap.swap.total), 9),
    pad(formatBytes(snap.swap.used), 10),
    pad(formatBytes(snap.swap.free), 10),
  ].join(""),
);

console.log(
  `\npercentages: used ${snap.usedPercent.toFixed(1)}%  ` +
    `cache ${snap.cachePercent.toFixed(1)}%  ` +
    `free ${snap.freePercent.toFixed(1)}%  ` +
    `pressure ${snap.pressurePercent.toFixed(1)}%`,
);

// ---------------------------------------------------------------------------
console.log("\n── invariants ──────────────────────────────────────────────\n");

check(
  "used + buff/cache + free === total",
  snap.used + snap.buffcache.total + snap.free === snap.total,
  `(${formatBytes(snap.used + snap.buffcache.total + snap.free)} vs ${formatBytes(snap.total)})`,
);
check(
  "usedPercent within 0-100",
  snap.usedPercent >= 0 && snap.usedPercent <= 100,
);
check("available <= total", snap.available <= snap.total);
check(
  "used <= total - buff/cache",
  snap.used <= snap.total - snap.buffcache.total,
);
check(
  "buff/cache === buffers + cached + reclaimable",
  snap.buffcache.total ===
    snap.buffcache.buffers + snap.buffcache.cached + snap.buffcache.reclaimable,
);
check(
  "pressurePercent >= usedPercent",
  snap.pressurePercent + 0.001 >= snap.usedPercent,
);

// ---------------------------------------------------------------------------
console.log("\n── vs. `free -k` ───────────────────────────────────────────\n");

let freeRow = null;
try {
  const out = execSync("free -k", { encoding: "utf8" });
  console.log(execSync("free -h", { encoding: "utf8" }).trimEnd());
  const line = out.split("\n").find((l) => /^Mem:/.test(l));
  if (line) {
    const [, total, used, free, shared, buffcache, available] = line
      .trim()
      .split(/\s+/);
    freeRow = {
      total: Number(total) * 1024,
      used: Number(used) * 1024,
      free: Number(free) * 1024,
      shared: Number(shared) * 1024,
      buffcache: Number(buffcache) * 1024,
      available: Number(available) * 1024,
    };
  }
} catch {
  console.log("(`free` not available on this host — skipping comparison)");
}

if (freeRow && !snap.limited) {
  // `free` is sampled a moment after us, so allow a small drift.
  const tolerance = Math.max(8 * 1024 * 1024, snap.total * 0.01);
  const near = (a, b) => Math.abs(a - b) <= tolerance;

  check(
    "total matches free",
    near(snap.total, freeRow.total),
    `${formatBytes(snap.total)} vs ${formatBytes(freeRow.total)}`,
  );
  check(
    "buff/cache matches free",
    near(snap.buffcache.total, freeRow.buffcache),
    `${formatBytes(snap.buffcache.total)} vs ${formatBytes(freeRow.buffcache)}`,
  );
  check(
    "available matches free",
    near(snap.available, freeRow.available),
    `${formatBytes(snap.available)} vs ${formatBytes(freeRow.available)}`,
  );

  // procps 4.x computes used as (total - available), older releases as
  // (total - free - buff/cache). Accept either — both are far from the
  // (total - free) figure the old dashboard used.
  const classic = freeRow.total - freeRow.free - freeRow.buffcache;
  const modern = freeRow.total - freeRow.available;
  check(
    "used matches one of free's two formulas",
    near(snap.used, classic) || near(snap.used, modern),
    `ours ${formatBytes(snap.used)} | classic ${formatBytes(classic)} | procps4 ${formatBytes(modern)}`,
  );

  const oldBuggy = ((freeRow.total - freeRow.free) / freeRow.total) * 100;
  console.log(
    `\n   old gauge would have shown: ${oldBuggy.toFixed(0)}%   ` +
      `→ now shows: ${snap.usedPercent.toFixed(0)}%`,
  );
}

// ---------------------------------------------------------------------------
console.log("\n── regression: the reported 952Mi server ───────────────────\n");

// ubuntu@instance-20260902-1759:~$ free -h
//               total  used  free  shared  buff/cache  available
// Mem:          952Mi  355Mi  65Mi   0.0Ki      531Mi      457Mi
// Swap:         2.2Gi   44Mi  2.2Gi
const Mi = 1024 * 1024;
const report = {
  total: 952 * Mi,
  used: 355 * Mi,
  free: 65 * Mi,
  buffcache: 531 * Mi,
  available: 457 * Mi,
};

const computedUsed = report.total - report.free - report.buffcache;
const oldPct = ((report.total - report.free) / report.total) * 100;
const newPct = (computedUsed / report.total) * 100;

console.log(
  `   reported by free:   ${formatBytes(report.used)} used of ${formatBytes(report.total)}`,
);
console.log(`   our formula:        ${formatBytes(computedUsed)}`);
console.log(`   old dashboard:      ${oldPct.toFixed(0)}%   ← the bug`);
console.log(`   fixed dashboard:    ${newPct.toFixed(0)}%`);

check(
  "reproduces free's 355Mi used",
  Math.abs(computedUsed - report.used) < 2 * Mi,
  `(${formatBytes(computedUsed)})`,
);
check("old formula really did produce ~93%", Math.round(oldPct) === 93);
check("new formula produces ~37%", Math.round(newPct) === 37);

// ---------------------------------------------------------------------------
console.log("\n── formatBytes ─────────────────────────────────────────────\n");

const cases = [
  [0, "0B"],
  [1023, "1023B"],
  [1024, "1.0Ki"],
  [355 * Mi, "355Mi"],
  [952 * Mi, "952Mi"],
  [Math.round(2.2 * 1024 * Mi), "2.2Gi"],
];
for (const [input, expected] of cases) {
  const got = formatBytes(input);
  check(
    `formatBytes(${input}) === "${expected}"`,
    got === expected,
    `got "${got}"`,
  );
}

// ---------------------------------------------------------------------------
if (snap.processes.length) {
  console.log(
    "\n── alexa processes ─────────────────────────────────────────\n",
  );
  for (const p of snap.processes) {
    const cap = p.heapCap ? ` (heap cap ${formatBytes(p.heapCap)})` : "";
    console.log(
      `   ${p.label.padEnd(10)} pid ${String(p.pid).padEnd(7)} rss ${formatBytes(p.rss)}${cap}`,
    );
  }
}

console.log(
  `\n${failures === 0 ? "✅ all checks passed" : `❌ ${failures} check(s) failed`}\n`,
);
process.exit(failures === 0 ? 0 : 1);
