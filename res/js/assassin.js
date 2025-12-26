const fs = require('fs');
const games = {}; // key = sessionCode
const POINTS_DB_PATH = './assassin_points.json';

// ⚙️ CONFIGURATION
const REGISTRATION_TIME = 120000; // 2 minutes
const VOTE_TIME = 60000; // 60 seconds
const KILL_POINTS = 10; // Points for surviving a round
const WIN_POINTS = 50; // Points for winning

// 📂 LOAD POINTS
let userPoints = {};
try {
    if (fs.existsSync(POINTS_DB_PATH)) userPoints = JSON.parse(fs.readFileSync(POINTS_DB_PATH));
} catch (err) {
    console.error("Error loading points:", err);
}

function savePoints() {
    try {
        fs.writeFileSync(POINTS_DB_PATH, JSON.stringify(userPoints, null, 2));
    } catch (err) {}
}

function randomCode(len = 6) {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    return Array.from({
        length: len
    }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function getAlivePlayers(game) {
    return Object.values(game.players).filter(p => p.alive);
}

async function safeSend(AlexaInc, jid, content) {
    try {
        await AlexaInc.sendMessage(jid, content);
    } catch (e) {
        console.log(`Msg fail: ${jid}`);
    }
}

const Assassin = {

    /* ===================== LEADERBOARD ===================== */
    async showLeaderboard(AlexaInc, msg) {
        const sorted = Object.entries(userPoints).sort((a, b) => b[1] - a[1]).slice(0, 10);
        let text = "🥷 *ASSASSIN LEADERBOARD* 🥷\n\n";
        if (!sorted.length) text += "No points recorded.";
        sorted.forEach((e, i) => {
            text += `${i + 1}. @${e[0].split('@')[0]} : ${e[1]} pts\n`;
        });
        await AlexaInc.sendMessage(msg.key.remoteJid, {
            text,
            mentions: sorted.map(s => s[0])
        });
    },


    /* ===================== CREATE GAME ===================== */
    async createGame(AlexaInc, msg, botNumber) {
        if (msg.key.remoteJid.endsWith("@s.whatsapp.net")) return;

        // Check if game exists
        if (Object.values(games).find(g => g.groupId === msg.key.remoteJid)) {
            return AlexaInc.sendMessage(msg.key.remoteJid, {
                text: "⚠️ A game is already running here!"
            });
        }

        // 1. Fetch Group Metadata (Name + Participants for Tagging)
        let groupMetadata = null;
        try {
            groupMetadata = await AlexaInc.groupMetadata(msg.key.remoteJid);
        } catch (e) {
            console.log("Error fetching metadata:", e);
        }

        const groupName = groupMetadata?.subject || "this Group";
        // Get all member IDs to tag them
        const allMembers = groupMetadata?.participants ? groupMetadata.participants.map(p => p.id) : [];

        const sessionCode = randomCode();

        games[sessionCode] = {
            sessionCode,
            groupId: msg.key.remoteJid,
            groupName: groupName,
            phase: "register",
            players: {},
            votes: {},
            timers: {
                register: null,
                vote: null
            }
        };

        // ⏱️ AUTO START / CANCEL TIMER
        games[sessionCode].timers.register = setTimeout(async () => {
            const game = games[sessionCode];
            if (!game) return;
            if (Object.keys(game.players).length < 3) {
                await AlexaInc.sendMessage(game.groupId, {
                    text: "🚫 Registration closed. Need 3+ players."
                });
                delete games[sessionCode];
            } else {
                await AlexaInc.sendMessage(game.groupId, {
                    text: "⏰ Auto-starting Assassin..."
                });
                await Assassin.startGame(AlexaInc, {
                    key: {
                        remoteJid: game.groupId
                    }
                });
            }
        }, REGISTRATION_TIME);

        const joinUrl = `https://wa.me/${botNumber}?text=_joinass_${sessionCode}`;

        // 2. Send Message with Mentions
        await AlexaInc.sendMessage(msg.key.remoteJid, {
            title: "🔪 Assassin Game",
            text: `Session: ${sessionCode}\nTarget your victim. Don't get caught.\n\nMin Players: 3`,
            footer: "Registration Open",
            mentions: allMembers, // <--- TAG EVERYONE
            interactiveButtons: [{
                name: "cta_url",
                buttonParamsJson: JSON.stringify({
                    display_text: "Join Assassin",
                    url: joinUrl
                })
            }]
        });
    },

    /* ===================== JOIN GAME ===================== */
    async joinGame(AlexaInc, msg, lid) {
        const text = msg.message?.conversation || "";
        if (!text.startsWith("_joinass_")) return;

        const code = text.replace("_joinass_", "").trim();
        const game = games[code];

        if (!game) return AlexaInc.sendMessage(lid, {
            text: "❌ Invalid code."
        });
        if (game.phase !== "register") return AlexaInc.sendMessage(lid, {
            text: "⚠️ Game already started."
        });
        if (game.players[lid]) return AlexaInc.sendMessage(lid, {
            text: "✅ Already joined."
        });

        game.players[lid] = {
            jid: lid,
            name: msg.pushName || "Player",
            alive: true,
            target: null
        };

        await safeSend(AlexaInc, lid, {
            text: `✅ You joined Assassin in *${game.groupName}*`
        });
        await safeSend(AlexaInc, game.groupId, {
            text: `👤 ${msg.pushName} picked up a contract! (${Object.keys(game.players).length})`
        });
    },

    /* ===================== START GAME ===================== */
    async startGame(AlexaInc, msg) {
        const game = Object.values(games).find(g => g.groupId === msg.key.remoteJid);
        if (!game || game.phase !== "register") return;
        if (game.timers.register) clearTimeout(game.timers.register);

        const players = Object.values(game.players);
        if (players.length < 3) return AlexaInc.sendMessage(game.groupId, {
            text: "⚠️ Need 3+ players!"
        });

        game.phase = "play";
        shuffle(players);

        // 🔗 CIRCULAR TARGET ASSIGNMENT
        // P1 -> P2 -> P3 -> P1
        for (let i = 0; i < players.length; i++) {
            const current = players[i];
            const target = players[(i + 1) % players.length];
            current.target = target.jid;
        }

        // Send Secret Targets
        for (const p of players) {
            await safeSend(AlexaInc, p.jid, {
                text: `🎯 *YOUR CONTRACT*\n\nTarget: *${game.players[p.target].name}*\n\nYour mission: Vote them out before they get you.`
            });
        }

        await AlexaInc.sendMessage(game.groupId, {
            text: "🔪 The contracts have been assigned. Check your DMs.\nVoting begins now!"
        });
        await this.startVoting(AlexaInc, game);
    },

    /* ===================== VOTING PHASE ===================== */
    async startVoting(AlexaInc, game) {
        game.votes = {};

        // Auto-resolve if timeout
        game.timers.vote = setTimeout(async () => {
            if (game.phase === "play") await this.resolveVote(AlexaInc, game);
        }, VOTE_TIME);

        const alive = getAlivePlayers(game);

        for (const p of alive) {
            const buttons = alive
                .filter(x => x.jid !== p.jid)
                .map(x => ({
                    name: "quick_reply",
                    buttonParamsJson: JSON.stringify({
                        display_text: x.name,
                        id: `_assassin_vote_${x.jid}`
                    })
                }));

            await safeSend(AlexaInc, p.jid, {
                text: "🗳 *Elimination Vote*\nWho do you think is hunting you? Or eliminate your target.",
                footer: "Time: 60s",
                interactiveButtons: buttons
            });
        }

        await AlexaInc.sendMessage(game.groupId, {
            text: "🗳 Voting is open! Check DMs."
        });
    },

    /* ===================== HANDLE VOTE ===================== */
    async handleVote(AlexaInc, msg, id, lid) {
        const game = Object.values(games).find(g => g.phase === "play" && g.players[lid]);
        if (!game) return;

        const voter = game.players[lid];
        if (!voter || !voter.alive) return;

        if (id.startsWith("_assassin_vote_")) {
            const targetId = id.replace("_assassin_vote_", "");
            game.votes[lid] = targetId;

            await safeSend(AlexaInc, lid, {
                text: `You voted for ${game.players[targetId].name}`
            });
            await AlexaInc.sendMessage(game.groupId, {
                text: `🗳 *${voter.name}* cast a vote.`
            });

            // Fast Forward
            if (Object.keys(game.votes).length === getAlivePlayers(game).length) {
                await this.resolveVote(AlexaInc, game);
            }
        }
    },

    /* ===================== RESOLVE VOTE ===================== */
    async resolveVote(AlexaInc, game) {
        if (game.timers.vote) clearTimeout(game.timers.vote);

        // Count Votes
        const map = {};
        for (const v of Object.values(game.votes)) map[v] = (map[v] || 0) + 1;
        const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]);

        let eliminatedId = null;
        if (sorted.length > 0) {
            if (sorted.length > 1 && sorted[0][1] === sorted[1][1]) eliminatedId = null; // Tie
            else eliminatedId = sorted[0][0];
        }

        if (eliminatedId) {
            const victim = game.players[eliminatedId];
            victim.alive = false;

            await AlexaInc.sendMessage(game.groupId, {
                text: `💀 *${victim.name}* was eliminated!\nThey were hunting: ${game.players[victim.target].name}`
            });

            // 🔄 REASSIGN TARGET
            // Find who was hunting the victim
            const killer = Object.values(game.players).find(p => p.target === eliminatedId && p.alive);

            if (killer) {
                // Killer now hunts the victim's target
                killer.target = victim.target;

                // Award partial points
                userPoints[killer.jid] = (userPoints[killer.jid] || 0) + KILL_POINTS;
                savePoints();

                await safeSend(AlexaInc, killer.jid, {
                    text: `✅ Target eliminated!\n\n🎯 *NEW CONTRACT*\nTarget: *${game.players[killer.target].name}*`
                });
            }

            await this.checkWin(AlexaInc, game);
        } else {
            await AlexaInc.sendMessage(game.groupId, {
                text: "⚖️ Tie vote. No one was eliminated. Round restarts."
            });
            await this.startVoting(AlexaInc, game);
        }
    },

    /* ===================== WIN CHECK ===================== */
    async checkWin(AlexaInc, game) {
        const alive = getAlivePlayers(game);

        if (alive.length === 1) {
            const winner = alive[0];
            userPoints[winner.jid] = (userPoints[winner.jid] || 0) + WIN_POINTS;
            savePoints();

            await AlexaInc.sendMessage(game.groupId, {
                text: `🏆 *GAME OVER*\n\n🥇 The Master Assassin is: *${winner.name}*\n\n(+${WIN_POINTS} Points)`
            });

            delete games[game.sessionCode];
        } else {
            // Continue Game
            await AlexaInc.sendMessage(game.groupId, {
                text: `⏳ ${alive.length} Assassins remaining... Next round starting.`
            });
            await this.startVoting(AlexaInc, game);
        }
    }
};

module.exports = Assassin;