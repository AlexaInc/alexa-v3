"use strict";
const { randomUUID } = require("crypto");
const moment = require("moment-timezone");
const database = require("./database");

function validate(input) {
  const type = String(input.type || "once");
  if (!["once", "daily", "weekly"].includes(type)) throw new Error("Invalid repeat type.");
  const timezone = String(input.timezone || "Asia/Colombo");
  if (!moment.tz.zone(timezone)) throw new Error("Invalid timezone.");
  const runAt = moment.tz(input.runAt, timezone);
  if (!runAt.isValid()) throw new Error("Invalid run date.");
  const message = String(input.message || "").trim();
  if (!message || message.length > 4000) throw new Error("Message must be 1–4,000 characters.");
  return { type, timezone, runAt, message };
}
function nextRun(job, after = moment.utc()) {
  if (job.schedule_type === "once") return null;
  const original = moment.utc(job.run_at).tz(job.timezone);
  const next = moment(after).tz(job.timezone);
  if (job.schedule_type === "daily") next.hour(original.hour()).minute(original.minute()).second(0);
  else next.day(original.day()).hour(original.hour()).minute(original.minute()).second(0);
  if (!next.isAfter(moment(after).tz(job.timezone))) next.add(1, job.schedule_type === "daily" ? "day" : "week");
  return next.utc().toDate();
}
async function list(groupIds) {
  await database.initialize();
  if (!groupIds.length) return [];
  const [rows] = await database.getPool().promise().query(`SELECT * FROM scheduled_jobs WHERE group_id IN (${groupIds.map(()=>"?").join(",")}) ORDER BY next_run_at`, groupIds);
  return rows;
}
async function create(input) {
  const value = validate(input); const id = randomUUID();
  await database.getPool().promise().query("INSERT INTO scheduled_jobs (id,group_id,created_by,name,schedule_type,timezone,message,run_at,next_run_at) VALUES (?,?,?,?,?,?,?,?,?)", [id,input.groupId,input.createdBy,String(input.name||"Scheduled message").slice(0,120),value.type,value.timezone,value.message,value.runAt.utc().toDate(),value.runAt.utc().toDate()]);
  return id;
}
async function remove(id, groupIds) { const [result] = await database.getPool().promise().query(`DELETE FROM scheduled_jobs WHERE id=? AND group_id IN (${groupIds.map(()=>"?").join(",")})`,[id,...groupIds]); return result.affectedRows>0; }
async function runDue(send) {
  const db=database.getPool().promise(); const [jobs]=await db.query("SELECT * FROM scheduled_jobs WHERE enabled=1 AND next_run_at<=UTC_TIMESTAMP() LIMIT 20");
  for(const job of jobs){ try{ await send(job); const next=nextRun(job); await db.query("UPDATE scheduled_jobs SET enabled=?,next_run_at=?,last_run_at=UTC_TIMESTAMP() WHERE id=? AND next_run_at=?",[Boolean(next),next,job.id,job.next_run_at]); }catch(error){ console.error("[scheduler]",error.message); } }
}
let timer; function start(send){ if(timer)return; const tick=()=>runDue(send).catch(console.error); timer=setInterval(tick,30000); timer.unref?.(); tick(); }
module.exports={create,list,nextRun,remove,start,validate};
