// battleGame.js
const fs = require('fs');
const path = './data/battleData.json';

// ---------------- INIT DATABASE ---------------- //
function initDB() {
    if (!fs.existsSync(path)) {
        fs.writeFileSync(path, JSON.stringify({
            battles: {},
            leaderboard: {}
        }, null, 2));
    }
}
initDB();

function load() {
    return JSON.parse(fs.readFileSync(path));
}

function save(data) {
    fs.writeFileSync(path, JSON.stringify(data, null, 2));
}

function random(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ----------- START BATTLE SESSION ----------- //
function startBattle(chatId, p1, p2) {
    const db = load();

    if (db.battles[chatId]) {
        return {
            error: true,
            message: "⚠️ A battle is already active in this chat!"
        };
    }

    db.battles[chatId] = {
        p1,
        p2,
        turn: p1,
        hp: { [p1]: 100, [p2]: 100 },
        defend: { [p1]: false, [p2]: false },
        cooldown: { [p1]: 0, [p2]: 0 }
    };

    save(db);

    return {
        error: false,
        message:
`⚔️ *Battle Started!*
${formatUser(p1)} vs ${formatUser(p2)}

🎮 ${formatUser(p1)} goes first!
Moves: attack / defend / heal / special`
    };
}

// ---------------- MOVE HANDLING ---------------- //
function playerMove(chatId, user, move) {
    const db = load();
    const game = db.battles[chatId];

    if (!game) {
        return { error: true, message: "❌ No active battle here." };
    }

    if (game.turn !== user) {
        return { error: true, message: "⏳ Not your turn!" };
    }

    let opponent = (game.p1 === user) ? game.p2 : game.p1;
    let log = "";

    // ---------------- GAME LOGIC ---------------- //
    if (move === "attack") {
        let dmg = random(10, 20);

        if (game.defend[opponent]) {
            dmg = Math.floor(dmg / 2);
            game.defend[opponent] = false;
            log += `🛡 ${formatUser(opponent)} reduced damage!\n`;
        }

        game.hp[opponent] -= dmg;
        log += `⚔️ ${formatUser(user)} attacked!\nDamage: *${dmg}*\n`;

    } else if (move === "defend") {
        game.defend[user] = true;
        log += `🛡 ${formatUser(user)} is defending next attack!\n`;

    } else if (move === "heal") {
        let heal = random(8, 18);
        game.hp[user] = Math.min(100, game.hp[user] + heal);
        log += `❤️ ${formatUser(user)} healed +${heal} HP\n`;

    } else if (move === "special") {
        if (game.cooldown[user] > 0) {
            return { error: true, message: `⏳ Special on cooldown (${game.cooldown[user]} turns left)` };
        }

        let dmg = random(25, 35);

        if (game.defend[opponent]) {
            dmg = Math.floor(dmg / 2);
            game.defend[opponent] = false;
            log += `🛡 ${formatUser(opponent)} reduced SPECIAL damage!\n`;
        }

        game.hp[opponent] -= dmg;
        game.cooldown[user] = 3;

        log += `💥 ${formatUser(user)} used *SPECIAL ATTACK!* Damage: *${dmg}*\n`;

    } else {
        return { error: true, message: "❌ Invalid move." };
    }

    // Decrease cooldown
    if (game.cooldown[user] > 0) game.cooldown[user]--;

    // ----------- CHECK WINNER ----------- //
    if (game.hp[opponent] <= 0) {
        // Save leaderboard
        if (!db.leaderboard[user]) db.leaderboard[user] = 0;
        db.leaderboard[user]++;

        delete db.battles[chatId];
        save(db);

        return {
            error: false,
            finished: true,
            message:
`🏆 *BATTLE FINISHED!*

Winner: ${formatUser(user)}
Remaining HP: *${game.hp[user]}*

🎖 +1 win added to leaderboard`,
players:[game.p1.replace(/^@?(\d+)$/, '$1@lid'),game.p2.replace(/^@?(\d+)$/, '$1@lid')]
        };
    }

    // Switch turn
    game.turn = opponent;
    save(db);

    return {
        error: false,
        finished: false,
        message:
`${log}

❤️ HP:
${formatUser(game.p1)}: *${game.hp[game.p1]}*
${formatUser(game.p2)}: *${game.hp[game.p2]}*

👉 ${formatUser(opponent)}'s turn
Moves: attack / defend / heal / special`,
players:[game.p1.replace(/^@?(\d+)$/, '$1@lid'),game.p2.replace(/^@?(\d+)$/, '$1@lid')]
    };
}

// ---------------- LEADERBOARD SYSTEM ---------------- //
function getLeaderboard() {
    const db = load();
    const lb = db.leaderboard;

    let sorted = Object.entries(lb)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20);

    if (sorted.length === 0) return {msg:"📛 No battles played yet."};

    let msg = "🏆 *BATTLE ARENA LEADERBOARD*\n\n";
    let rank = 1;
    let ids = []

    sorted.forEach(([user, wins]) => {
        msg += `${rank}. ${formatUser(user)} — *${wins} wins*\n`;
        ids.push(user.replace(/^@?(\d+)$/, '$1@lid'))
        rank++;
    });

    return {msg:msg,uids:ids};
}

// ---------------- FORMAT USER ---------------- //
function formatUser(id) {
    // if (id.includes("@s.whatsapp.net"))
    //     return `@${id.split("@")[0]}`;

    return id; // Telegram username or ID
}

// ---------------- EXPORT ---------------- //
module.exports = {
    startBattle,
    playerMove,
    getLeaderboard
};
