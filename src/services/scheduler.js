"use strict";

const { randomUUID } = require("crypto");
const moment = require("moment-timezone");
const database = require("./database");

async function requireDatabase() {
  const ready = await database.initialize();
  if (!ready) throw new Error("Scheduler database is not configured.");
  return database.getPool().promise();
}

function validate(input) {
  const type = String(input.type || "once");
  if (!["once", "daily", "weekly"].includes(type)) {
    throw new Error("Invalid repeat type.");
  }

  const timezone = String(input.timezone || "Asia/Colombo");
  if (!moment.tz.zone(timezone)) throw new Error("Invalid timezone.");

  const runAt = moment.tz(input.runAt, timezone);
  if (!runAt.isValid()) throw new Error("Invalid run date.");

  const message = String(input.message || "").trim();
  if (!message || message.length > 4000) {
    throw new Error("Message must be 1–4,000 characters.");
  }
  return { type, timezone, runAt, message };
}

function nextRun(job, after = moment.utc()) {
  if (job.schedule_type === "once") return null;

  const original = moment.utc(job.run_at).tz(job.timezone);
  const localAfter = moment(after).tz(job.timezone);
  const next = localAfter.clone();

  if (job.schedule_type === "daily") {
    next.hour(original.hour()).minute(original.minute()).second(0).millisecond(0);
  } else {
    next
      .day(original.day())
      .hour(original.hour())
      .minute(original.minute())
      .second(0)
      .millisecond(0);
  }

  if (!next.isAfter(localAfter)) {
    next.add(1, job.schedule_type === "daily" ? "day" : "week");
  }
  return next.utc().toDate();
}

async function list(groupIds) {
  if (!groupIds.length) return [];
  const db = await requireDatabase();
  const placeholders = groupIds.map(() => "?").join(",");
  const [rows] = await db.query(
    `SELECT * FROM scheduled_jobs
     WHERE group_id IN (${placeholders})
     ORDER BY next_run_at`,
    groupIds,
  );
  return rows;
}

async function create(input) {
  const value = validate(input);
  const id = randomUUID();
  const db = await requireDatabase();
  await db.query(
    `INSERT INTO scheduled_jobs
       (id, group_id, created_by, name, schedule_type, timezone,
        message, run_at, next_run_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.groupId,
      input.createdBy,
      String(input.name || "Scheduled message").slice(0, 120),
      value.type,
      value.timezone,
      value.message,
      value.runAt.utc().toDate(),
      value.runAt.utc().toDate(),
    ],
  );
  return id;
}

async function remove(id, groupIds) {
  if (!groupIds.length) return false;
  const db = await requireDatabase();
  const placeholders = groupIds.map(() => "?").join(",");
  const [result] = await db.query(
    `DELETE FROM scheduled_jobs
     WHERE id = ? AND group_id IN (${placeholders})`,
    [id, ...groupIds],
  );
  return result.affectedRows > 0;
}

async function runDue(send) {
  // This await is intentional even though server.js also waits before starting
  // the worker. It protects direct/test calls and future entry points too.
  const db = await requireDatabase();
  const [jobs] = await db.query(
    `SELECT * FROM scheduled_jobs
     WHERE enabled = 1 AND next_run_at <= UTC_TIMESTAMP()
     ORDER BY next_run_at
     LIMIT 20`,
  );

  for (const job of jobs) {
    try {
      await send(job);
      const next = nextRun(job);
      await db.query(
        `UPDATE scheduled_jobs
         SET enabled = ?, next_run_at = ?, last_run_at = UTC_TIMESTAMP()
         WHERE id = ? AND next_run_at = ?`,
        [Boolean(next), next, job.id, job.next_run_at],
      );
    } catch (error) {
      console.error(`[scheduler] Job ${job.id} failed:`, error.message);
    }
  }
}

let timer;
function start(send) {
  if (timer) return;
  const tick = () => {
    void runDue(send).catch((error) => {
      console.error("[scheduler] Tick failed:", error.message);
    });
  };
  timer = setInterval(tick, 30_000);
  timer.unref?.();
  tick();
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = {
  create,
  list,
  nextRun,
  remove,
  runDue,
  start,
  stop,
  validate,
};
