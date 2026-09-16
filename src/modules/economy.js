const CURRENCY_NAME = "AlexaCash";
const CURRENCY_SYMBOL = "AC";

const DAILY_AMOUNT = 500;
const DAILY_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24h

const WORK_MIN = 50;
const WORK_MAX = 250;
const WORK_COOLDOWN_MS = 60 * 60 * 1000; // 1h

const ROB_COOLDOWN_MS = 3 * 60 * 60 * 1000; // 3h
const ROB_SUCCESS_RATE = 0.45; // 45% chance to succeed
const ROB_MAX_STEAL_PCT = 0.3; // steal up to 30% of victim's balance

const WORK_JOBS = [
  "delivered parotta 🫓 for a wedding",
  "fixed a WiFi router 📡",
  "washed three tuk-tuks 🛺",
  "sold king coconuts by the road 🥥",
  "did overtime at the office 💻",
  "helped harvest tea leaves 🍃",
  "fixed someone's phone screen 📱",
  "walked a very angry dog 🐕",
  "painted a fence 🎨",
  "played cricket for tips 🏏",
];

// -----------------------------------------------------------------------
// DB HANDLE — set once via initTables(pool) at bot startup. Every function
// below reuses this same pool (the SAME connection pool bot.js already
// created for `groups` / `tasks` / etc — no second database, no new env
// vars needed).
// -----------------------------------------------------------------------
let _db = null;

function getDb() {
  if (!_db) {
    throw new Error(
      "[economy.js] initTables(db) must be called once at bot startup " +
        "before using economy functions. See wiring instructions at the " +
        "bottom of this file.",
    );
  }
  return _db;
}

/**
 * Creates the `economy_users` table if it does not already exist.
 * Safe to call on every boot — CREATE TABLE IF NOT EXISTS never touches
 * existing rows/tables.
 */
async function initTables(pool) {
  _db = pool;
  await pool.promise().query(`
        CREATE TABLE IF NOT EXISTS economy_users (
            user_id     VARCHAR(255) PRIMARY KEY,
            balance     BIGINT NOT NULL DEFAULT 0,
            bank        BIGINT NOT NULL DEFAULT 0,
            last_daily  BIGINT NOT NULL DEFAULT 0,
            last_work   BIGINT NOT NULL DEFAULT 0,
            last_rob    BIGINT NOT NULL DEFAULT 0
        )
    `);
  console.log(
    "[economy.js] economy_users table ready (created if it was missing).",
  );
}

async function ensureUser(userId) {
  const db = getDb();
  const [rows] = await db
    .promise()
    .query("SELECT * FROM economy_users WHERE user_id = ?", [userId]);
  if (rows.length === 0) {
    await db
      .promise()
      .query("INSERT IGNORE INTO economy_users (user_id) VALUES (?)", [userId]);
    return {
      user_id: userId,
      balance: 0,
      bank: 0,
      last_daily: 0,
      last_work: 0,
      last_rob: 0,
    };
  }
  return rows[0];
}

function fmt(n) {
  return `${Number(n).toLocaleString()} ${CURRENCY_SYMBOL}`;
}

function msLeft(target) {
  const diff = target - Date.now();
  if (diff <= 0) return null;
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return `${h}h ${m}m ${s}s`;
}

async function getBalance(userId) {
  const u = await ensureUser(userId);
  return u.balance;
}

async function addBalance(userId, amount) {
  const db = getDb();
  await ensureUser(userId);
  // Clamp at 0 using GREATEST so balance never goes negative from a bulk add
  await db
    .promise()
    .query(
      "UPDATE economy_users SET balance = GREATEST(0, balance + ?) WHERE user_id = ?",
      [amount, userId],
    );
  const [rows] = await db
    .promise()
    .query("SELECT balance FROM economy_users WHERE user_id = ?", [userId]);
  return rows[0]?.balance ?? 0;
}

/** .balance / .bal — show wallet + bank */
async function balance(userId) {
  const u = await ensureUser(userId);
  return `💰 *${CURRENCY_NAME} Wallet*\n\n👛 Cash: ${fmt(u.balance)}\n🏦 Bank: ${fmt(u.bank)}\n📊 Net Worth: ${fmt(Number(u.balance) + Number(u.bank))}`;
}

/** .claim — daily reward, once every 24h */
async function claimDaily(userId) {
  const db = getDb();
  const u = await ensureUser(userId);
  const wait = msLeft(Number(u.last_daily) + DAILY_COOLDOWN_MS);
  if (wait) {
    return {
      ok: false,
      message: `⏳ You already claimed your daily reward. Come back in ${wait}.`,
    };
  }
  const now = Date.now();
  await db
    .promise()
    .query(
      "UPDATE economy_users SET balance = balance + ?, last_daily = ? WHERE user_id = ?",
      [DAILY_AMOUNT, now, userId],
    );
  const newBalance = Number(u.balance) + DAILY_AMOUNT;
  return {
    ok: true,
    message: `✅ You claimed your daily reward of ${fmt(DAILY_AMOUNT)}!\n👛 New balance: ${fmt(newBalance)}`,
  };
}

/** .work — earn a random small amount every hour */
async function doWork(userId) {
  const db = getDb();
  const u = await ensureUser(userId);
  const wait = msLeft(Number(u.last_work) + WORK_COOLDOWN_MS);
  if (wait) {
    return {
      ok: false,
      message: `⏳ You're tired. Rest before working again. Try again in ${wait}.`,
    };
  }
  const earned =
    Math.floor(Math.random() * (WORK_MAX - WORK_MIN + 1)) + WORK_MIN;
  const job = WORK_JOBS[Math.floor(Math.random() * WORK_JOBS.length)];
  const now = Date.now();
  await db
    .promise()
    .query(
      "UPDATE economy_users SET balance = balance + ?, last_work = ? WHERE user_id = ?",
      [earned, now, userId],
    );
  const newBalance = Number(u.balance) + earned;
  return {
    ok: true,
    message: `💼 You ${job} and earned ${fmt(earned)}!\n👛 New balance: ${fmt(newBalance)}`,
  };
}

/** .rob <@user> — try to steal cash from another user's wallet (not bank) */
async function robUser(robberId, victimId) {
  if (robberId === victimId) {
    return { ok: false, message: `🙄 You can't rob yourself.` };
  }
  const db = getDb();
  const robber = await ensureUser(robberId);
  await ensureUser(victimId);

  const wait = msLeft(Number(robber.last_rob) + ROB_COOLDOWN_MS);
  if (wait) {
    return {
      ok: false,
      message: `⏳ Lay low for a while. You can rob again in ${wait}.`,
    };
  }

  const now = Date.now();
  await db
    .promise()
    .query("UPDATE economy_users SET last_rob = ? WHERE user_id = ?", [
      now,
      robberId,
    ]);

  const [victimRows] = await db
    .promise()
    .query("SELECT balance FROM economy_users WHERE user_id = ?", [victimId]);
  const victimBalance = Number(victimRows[0]?.balance || 0);

  if (victimBalance < 50) {
    return {
      ok: false,
      message: `😅 That person is too broke to rob (min ${fmt(50)} needed).`,
    };
  }

  const success = Math.random() < ROB_SUCCESS_RATE;

  // Use a transaction so both balances update atomically.
  const conn = await db.promise().getConnection();
  try {
    await conn.beginTransaction();
    if (success) {
      const steal = Math.floor(
        victimBalance * (Math.random() * ROB_MAX_STEAL_PCT),
      );
      await conn.query(
        "UPDATE economy_users SET balance = GREATEST(0, balance - ?) WHERE user_id = ?",
        [steal, victimId],
      );
      await conn.query(
        "UPDATE economy_users SET balance = balance + ? WHERE user_id = ?",
        [steal, robberId],
      );
      await conn.commit();
      return {
        ok: true,
        success: true,
        message: `🦹 Robbery successful! You stole ${fmt(steal)}.`,
      };
    } else {
      const fine = Math.floor(Math.random() * 100) + 50;
      await conn.query(
        "UPDATE economy_users SET balance = GREATEST(0, balance - ?) WHERE user_id = ?",
        [fine, robberId],
      );
      await conn.commit();
      return {
        ok: true,
        success: false,
        message: `🚨 You got caught! You paid a fine of ${fmt(fine)}.`,
      };
    }
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/** .pay <@user> <amount> — transfer cash to another user */
async function pay(senderId, receiverId, amount) {
  amount = Math.floor(Number(amount));
  if (!amount || amount <= 0) {
    return { ok: false, message: `❌ Enter a valid amount to pay.` };
  }
  if (senderId === receiverId) {
    return { ok: false, message: `🙄 You can't pay yourself.` };
  }

  const db = getDb();
  const sender = await ensureUser(senderId);
  await ensureUser(receiverId);

  if (Number(sender.balance) < amount) {
    return {
      ok: false,
      message: `❌ Insufficient balance. You have ${fmt(sender.balance)}.`,
    };
  }

  const conn = await db.promise().getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      "UPDATE economy_users SET balance = balance - ? WHERE user_id = ?",
      [amount, senderId],
    );
    await conn.query(
      "UPDATE economy_users SET balance = balance + ? WHERE user_id = ?",
      [amount, receiverId],
    );
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  const newBalance = Number(sender.balance) - amount;
  return {
    ok: true,
    message: `✅ Sent ${fmt(amount)} successfully!\n👛 Your new balance: ${fmt(newBalance)}`,
  };
}

/** .deposit <amount|all> — move cash into bank (safe from .rob) */
async function deposit(userId, amountArg) {
  const db = getDb();
  const u = await ensureUser(userId);
  const balanceNum = Number(u.balance);
  const amount =
    amountArg === "all" ? balanceNum : Math.floor(Number(amountArg));

  if (!amount || amount <= 0 || amount > balanceNum) {
    return {
      ok: false,
      message: `❌ Invalid amount. You have ${fmt(balanceNum)} in cash.`,
    };
  }

  await db
    .promise()
    .query(
      "UPDATE economy_users SET balance = balance - ?, bank = bank + ? WHERE user_id = ?",
      [amount, amount, userId],
    );

  return {
    ok: true,
    message: `🏦 Deposited ${fmt(amount)}.\n👛 Cash: ${fmt(balanceNum - amount)} | 🏦 Bank: ${fmt(Number(u.bank) + amount)}`,
  };
}

/** .withdraw <amount|all> — move cash out of bank */
async function withdraw(userId, amountArg) {
  const db = getDb();
  const u = await ensureUser(userId);
  const bankNum = Number(u.bank);
  const amount = amountArg === "all" ? bankNum : Math.floor(Number(amountArg));

  if (!amount || amount <= 0 || amount > bankNum) {
    return {
      ok: false,
      message: `❌ Invalid amount. You have ${fmt(bankNum)} in the bank.`,
    };
  }

  await db
    .promise()
    .query(
      "UPDATE economy_users SET balance = balance + ?, bank = bank - ? WHERE user_id = ?",
      [amount, amount, userId],
    );

  return {
    ok: true,
    message: `👛 Withdrew ${fmt(amount)}.\n👛 Cash: ${fmt(Number(u.balance) + amount)} | 🏦 Bank: ${fmt(bankNum - amount)}`,
  };
}

/** .baltop / .richest — top 10 richest users (global, across all groups) */
async function leaderboard(limit = 10) {
  const db = getDb();
  const [rows] = await db
    .promise()
    .query(
      "SELECT user_id, (balance + bank) AS total FROM economy_users ORDER BY total DESC LIMIT ?",
      [limit],
    );

  if (rows.length === 0)
    return { message: "📊 No economy data yet.", mentions: [] };

  let msg = `💰 *${CURRENCY_NAME} Leaderboard*\n\n`;
  rows.forEach((entry, i) => {
    const medal = ["🥇", "🥈", "🥉"][i] || `${i + 1}.`;
    msg += `${medal} @${entry.user_id.split("@")[0]} — ${fmt(entry.total)}\n`;
  });

  return { message: msg, mentions: rows.map((e) => e.user_id) };
}

module.exports = {
  CURRENCY_NAME,
  CURRENCY_SYMBOL,
  initTables,
  getBalance,
  addBalance,
  balance,
  claimDaily,
  doWork,
  robUser,
  pay,
  deposit,
  withdraw,
  leaderboard,
  fmt,
};

/**
 * EXAMPLE BOT.JS WIRING (paste inside `switch (command) { ... }` in bot.js)
 * ---------------------------------------------------------------------------
 * NOTE: This file is already wired into your copy of bot.js by the patch —
 * this comment is kept only as a reference / for re-applying manually.

case 'balance':
case 'bal':
case 'wallet': {
    let target = finalLid;
    if (p.mentionedJids?.length) target = p.mentionedJids[0];
    AlexaInc.sendMessage(msg.key.remoteJid, {
        text: await economy.balance(target),
        mentions: [target]
    }, { quoted: msg });
    break;
}

case 'claim': {
    const res = await economy.claimDaily(finalLid);
    AlexaInc.sendMessage(msg.key.remoteJid, { text: res.message }, { quoted: msg });
    break;
}

case 'work': {
    const res = await economy.doWork(finalLid);
    AlexaInc.sendMessage(msg.key.remoteJid, { text: res.message }, { quoted: msg });
    break;
}

case 'rob': {
    if (!p.mentionedJids?.length) {
        return AlexaInc.sendMessage(msg.key.remoteJid, { text: 'Mention who you want to rob! e.g. .rob @user' }, { quoted: msg });
    }
    const res = await economy.robUser(finalLid, p.mentionedJids[0]);
    AlexaInc.sendMessage(msg.key.remoteJid, {
        text: res.message,
        mentions: [finalLid, p.mentionedJids[0]]
    }, { quoted: msg });
    break;
}

case 'pay': {
    if (!p.mentionedJids?.length || !args[1]) {
        return AlexaInc.sendMessage(msg.key.remoteJid, { text: 'Usage: .pay @user <amount>' }, { quoted: msg });
    }
    const res = await economy.pay(finalLid, p.mentionedJids[0], args[1]);
    AlexaInc.sendMessage(msg.key.remoteJid, {
        text: res.message,
        mentions: [finalLid, p.mentionedJids[0]]
    }, { quoted: msg });
    break;
}

case 'deposit':
case 'dep': {
    const res = await economy.deposit(finalLid, args[0]);
    AlexaInc.sendMessage(msg.key.remoteJid, { text: res.message }, { quoted: msg });
    break;
}

case 'withdraw':
case 'wd': {
    const res = await economy.withdraw(finalLid, args[0]);
    AlexaInc.sendMessage(msg.key.remoteJid, { text: res.message }, { quoted: msg });
    break;
}

case 'baltop':
case 'richest': {
    const res = await economy.leaderboard();
    AlexaInc.sendMessage(msg.key.remoteJid, { text: res.message, mentions: res.mentions }, { quoted: msg });
    break;
}

 * ---------------------------------------------------------------------------
 */
