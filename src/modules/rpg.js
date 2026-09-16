/**
 * src/modules/rpg.js
 * ---------------------------------------------------------------------------
 * Anime-style RPG Power/Leveling System for Alexa V3.
 *
 * Theme: users start as a "Nobody" and grind their Power Level by training
 * and fighting AI bosses, unlocking anime-flavoured ranks as they level up
 * (Rookie -> Awakened -> Rank S Hunter -> Demon Slayer -> God of Destruction).
 *
 * This is INDEPENDENT of the bot's existing `getLevel/addXP` (used for the
 * general chat-activity level in `.menu`, stored in data/users.json). This
 * module tracks its own "Power Level" progression specifically for the RPG
 * game loop, stored in MySQL in a dedicated `rpg_users` table — auto-created
 * on boot, never overwriting existing tables/data.
 *
 * Depends on: ./modules/economy.js (dungeon rewards AlexaCash)
 *
 * HOW TO WIRE INTO src/bot.js
 * ---------------------------------------------------------------------------
 * 1. Require it:
 *      const rpg = require('./modules/rpg.js');
 *
 * 2. Right after `economy.initTables(db)`, also call:
 *      rpg.initTables(db).catch(err => console.error('[rpg] init failed:', err));
 *
 * 3. Add the `case` blocks in EXAMPLE BOT.JS WIRING (bottom of file) into
 *    your `switch (command) { ... }`.
 * ---------------------------------------------------------------------------
 */

const economy = require('./economy.js');

const TRAIN_COOLDOWN_MS = 30 * 60 * 1000; // 30 min
const DUNGEON_COOLDOWN_MS = 60 * 60 * 1000; // 1h

// Anime-style rank titles unlocked by level threshold
const RANKS = [
    { min: 1, title: 'Nobody 🫥' },
    { min: 5, title: 'Awakened Rookie ⚡' },
    { min: 10, title: 'Rank C Hunter 🗡️' },
    { min: 20, title: 'Rank B Hunter ⚔️' },
    { min: 35, title: 'Rank A Hunter 🔥' },
    { min: 50, title: 'Rank S Hunter 🌪️' },
    { min: 70, title: 'Demon Slayer 🩸' },
    { min: 90, title: 'Sage Mode Master 🍃' },
    { min: 120, title: 'Ascended Saiyan 💫' },
    { min: 150, title: 'God of Destruction 🌌' },
];

const CLASSES = ['Warrior 🗡️', 'Mage 🔮', 'Assassin 🥷', 'Monk 🥋', 'Beast Tamer 🐺'];

const BOSSES = [
    { name: 'Shadow Wraith 👻', power: 30 },
    { name: 'Iron Golem 🗿', power: 60 },
    { name: 'Crimson Oni 👹', power: 100 },
    { name: 'Frost Dragon 🐉', power: 150 },
    { name: 'Void Reaper 💀', power: 220 },
    { name: 'Celestial Titan 🌠', power: 320 },
];

let _db = null;

function getDb() {
    if (!_db) {
        throw new Error(
            '[rpg.js] initTables(db) must be called once at bot startup ' +
            'before using rpg functions.'
        );
    }
    return _db;
}

/** Creates the `rpg_users` table if missing. Safe to call on every boot. */
async function initTables(pool) {
    _db = pool;
    await pool.promise().query(`
        CREATE TABLE IF NOT EXISTS rpg_users (
            user_id       VARCHAR(255) PRIMARY KEY,
            class         VARCHAR(50) DEFAULT NULL,
            level         INT NOT NULL DEFAULT 1,
            xp            INT NOT NULL DEFAULT 0,
            power         INT NOT NULL DEFAULT 10,
            wins          INT NOT NULL DEFAULT 0,
            losses        INT NOT NULL DEFAULT 0,
            last_train    BIGINT NOT NULL DEFAULT 0,
            last_dungeon  BIGINT NOT NULL DEFAULT 0
        )
    `);
    console.log('[rpg.js] rpg_users table ready (created if it was missing).');
}

function xpNeeded(level) {
    return Math.floor(100 * Math.pow(1.18, level - 1));
}

async function ensureUser(userId) {
    const db = getDb();
    const [rows] = await db.promise().query('SELECT * FROM rpg_users WHERE user_id = ?', [userId]);
    if (rows.length === 0) {
        await db.promise().query('INSERT IGNORE INTO rpg_users (user_id) VALUES (?)', [userId]);
        return { user_id: userId, class: null, level: 1, xp: 0, power: 10, wins: 0, losses: 0, last_train: 0, last_dungeon: 0 };
    }
    return rows[0];
}

function getRankTitle(level) {
    let title = RANKS[0].title;
    for (const r of RANKS) {
        if (level >= r.min) title = r.title;
    }
    return title;
}

/** Applies XP gain in JS, returns { level, xp, power, leveledUp } to persist. */
function computeXPGain(u, amount) {
    let level = u.level;
    let xp = u.xp + amount;
    let power = u.power;
    let leveledUp = false;

    while (xp >= xpNeeded(level)) {
        xp -= xpNeeded(level);
        level += 1;
        power += Math.floor(Math.random() * 5) + 3; // +3-7 power per level
        leveledUp = true;
    }

    return { level, xp, power, leveledUp };
}

/** .class <name> — choose a class once */
async function chooseClass(userId, className) {
    const db = getDb();
    const u = await ensureUser(userId);
    if (u.class) {
        return { ok: false, message: `❌ You're already a *${u.class}*. Classes can't be changed (for now).` };
    }
    const match = CLASSES.find(c => c.toLowerCase().startsWith((className || '').toLowerCase()));
    if (!match) {
        return { ok: false, message: `❌ Invalid class. Choose one:\n${CLASSES.map(c => `• ${c}`).join('\n')}\n\nUsage: .class <name>` };
    }

    await db.promise().query('UPDATE rpg_users SET class = ? WHERE user_id = ?', [match, userId]);
    return { ok: true, message: `🎉 You awakened as a *${match}*! Use *.train* to grow your power.` };
}

/** .profile / .rpgprofile — show a user's RPG stats */
async function profile(userId, pushName) {
    const u = await ensureUser(userId);
    const rank = getRankTitle(u.level);
    const need = xpNeeded(u.level);
    const bar = progressBar(u.xp, need);

    return `🎴 *${pushName || 'Adventurer'}'s Profile*\n\n` +
        `🏷 Class: *${u.class || 'Unassigned (use .class)'}*\n` +
        `🎖 Rank: *${rank}*\n` +
        `📈 Level: *${u.level}*\n` +
        `✨ XP: ${u.xp}/${need}\n${bar}\n` +
        `💪 Power: *${u.power}*\n` +
        `⚔️ W/L: ${u.wins}/${u.losses}`;
}

function progressBar(current, total, size = 10) {
    const filled = Math.min(size, Math.round((current / total) * size));
    return '▰'.repeat(filled) + '▱'.repeat(size - filled);
}

/** .train — grind XP + power, cooldown based */
async function train(userId) {
    const db = getDb();
    const u = await ensureUser(userId);

    const wait = Number(u.last_train) + TRAIN_COOLDOWN_MS - Date.now();
    if (wait > 0) {
        return { ok: false, message: `⏳ You're exhausted from training. Rest for ${Math.ceil(wait / 60000)} more minute(s).` };
    }

    const xpGain = Math.floor(Math.random() * 20) + 15;
    const { level, xp, power, leveledUp } = computeXPGain(u, xpGain);

    await db.promise().query(
        'UPDATE rpg_users SET level = ?, xp = ?, power = ?, last_train = ? WHERE user_id = ?',
        [level, xp, power, Date.now(), userId]
    );

    const flavor = [
        'meditated under a waterfall 🌊',
        'sparred with a wandering monk 🥋',
        'unlocked a hidden technique scroll 📜',
        'ran 100 laps around the mountain ⛰️',
        'trained under gravity 10x normal 🪐',
    ];
    const line = flavor[Math.floor(Math.random() * flavor.length)];

    let msg = `🏋️ You ${line} and gained *${xpGain} XP*!`;
    if (leveledUp) msg += `\n\n🎉 *LEVEL UP!* You are now Level ${level} — ${getRankTitle(level)}!`;
    return { ok: true, message: msg };
}

/** .dungeon — fight a random boss; win = big XP + AlexaCash, lose = small XP */
async function dungeon(userId) {
    const db = getDb();
    const u = await ensureUser(userId);

    const wait = Number(u.last_dungeon) + DUNGEON_COOLDOWN_MS - Date.now();
    if (wait > 0) {
        return { ok: false, message: `⏳ The dungeon gate is sealed. Try again in ${Math.ceil(wait / 60000)} minute(s).` };
    }

    const boss = BOSSES[Math.min(BOSSES.length - 1, Math.floor(u.level / 15))];
    const playerRoll = u.power + Math.floor(Math.random() * 40);
    const bossRoll = boss.power + Math.floor(Math.random() * 40);

    let msg = `🚪 You entered the dungeon and encountered *${boss.name}* (Power ${boss.power})!\n\n`;
    msg += `⚔️ Your roll: ${playerRoll} vs 👹 Boss roll: ${bossRoll}\n\n`;

    const won = playerRoll >= bossRoll;
    let level = u.level, xp = u.xp, power = u.power, leveledUp = false;
    let wins = u.wins, losses = u.losses;
    let coins = 0;

    if (won) {
        wins += 1;
        const xpGain = Math.floor(Math.random() * 40) + 40;
        ({ level, xp, power, leveledUp } = computeXPGain(u, xpGain));
        coins = Math.floor(Math.random() * 200) + 100;
        await economy.addBalance(userId, coins);

        msg += `🏆 *VICTORY!* You defeated ${boss.name}!\n✨ +${xpGain} XP | 💰 +${economy.fmt(coins)}`;
        if (leveledUp) msg += `\n\n🎉 *LEVEL UP!* Now Level ${level} — ${getRankTitle(level)}!`;
    } else {
        losses += 1;
        const xpGain = Math.floor(Math.random() * 10) + 5;
        ({ level, xp, power, leveledUp } = computeXPGain(u, xpGain));
        msg += `💀 *DEFEAT!* ${boss.name} was too strong.\n✨ +${xpGain} XP (consolation)`;
    }

    await db.promise().query(
        'UPDATE rpg_users SET level = ?, xp = ?, power = ?, wins = ?, losses = ?, last_dungeon = ? WHERE user_id = ?',
        [level, xp, power, wins, losses, Date.now(), userId]
    );

    return { ok: true, message: msg };
}

/** .rpgtop — leaderboard by level/power */
async function leaderboard(limit = 10) {
    const db = getDb();
    const [rows] = await db.promise().query(
        'SELECT user_id, level, power FROM rpg_users ORDER BY level DESC, power DESC LIMIT ?',
        [limit]
    );

    if (rows.length === 0) return { message: '📊 No RPG data yet. Use .class then .train to start!', mentions: [] };

    let msg = `⚔️ *RPG Power Leaderboard*\n\n`;
    rows.forEach((e, i) => {
        const medal = ['🥇', '🥈', '🥉'][i] || `${i + 1}.`;
        msg += `${medal} @${e.user_id.split('@')[0]} — Lv.${e.level} (${getRankTitle(e.level)}, PWR ${e.power})\n`;
    });

    return { message: msg, mentions: rows.map(e => e.user_id) };
}

module.exports = {
    CLASSES,
    initTables,
    chooseClass,
    profile,
    train,
    dungeon,
    leaderboard,
    getRankTitle,
};

/**
 * EXAMPLE BOT.JS WIRING (paste inside `switch (command) { ... }` in bot.js)
 * ---------------------------------------------------------------------------

case 'class': {
    const res = await rpg.chooseClass(finalLid, text);
    AlexaInc.sendMessage(msg.key.remoteJid, { text: res.message }, { quoted: msg });
    break;
}

case 'rpgprofile':
case 'profile': {
    let target = finalLid;
    let name = msg.pushName;
    if (p.mentionedJids?.length) { target = p.mentionedJids[0]; name = null; }
    AlexaInc.sendMessage(msg.key.remoteJid, {
        text: await rpg.profile(target, name),
        mentions: [target]
    }, { quoted: msg });
    break;
}

case 'train': {
    const res = await rpg.train(finalLid);
    AlexaInc.sendMessage(msg.key.remoteJid, { text: res.message }, { quoted: msg });
    break;
}

case 'dungeon': {
    const res = await rpg.dungeon(finalLid);
    AlexaInc.sendMessage(msg.key.remoteJid, { text: res.message }, { quoted: msg });
    break;
}

case 'rpgtop': {
    const res = await rpg.leaderboard();
    AlexaInc.sendMessage(msg.key.remoteJid, { text: res.message, mentions: res.mentions }, { quoted: msg });
    break;
}

 * ---------------------------------------------------------------------------
 */
