const fs = require('fs');
const games = {}; // key = sessionCode
const POINTS_DB_PATH = './mafia_points.json';

// ⚙️ CONFIGURATION
const REGISTRATION_TIME = 120000; // Initial time: 2 minutes
const NIGHT_TIME = 90000;         // 90 seconds for complex roles
const VOTE_TIME  = 60000;         // 60 seconds
const WIN_POINTS = 10;

// 📂 LOAD POINTS
let userPoints = {};
try {
    if (fs.existsSync(POINTS_DB_PATH)) userPoints = JSON.parse(fs.readFileSync(POINTS_DB_PATH));
} catch (err) { console.error("Error loading points:", err); }

function savePoints() {
    try { fs.writeFileSync(POINTS_DB_PATH, JSON.stringify(userPoints, null, 2)); } catch (err) {}
}

function randomCode(len = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function getAlivePlayers(game) { return Object.values(game.players).filter(p => p.alive); }

async function safeSend(AlexaInc, jid, content) {
    try { await AlexaInc.sendMessage(jid, content); } catch (e) { console.log(`Msg fail: ${jid}`); }
}

// 🎭 ROLE DEFINITIONS
const ROLE_DESC = {
    townie: "Citizen. Find the mafia during the day.",
    don: "Mafia Boss. Choose who to kill.",
    mafia: "Mafia member. Help the Don.",
    detective: "Choose to Check (reveal role) or Kill a suspect.",
    sergeant: "Detective's assistant. You become Detective if they die.",
    doctor: "Save a player at night. Self-heal allowed once.",
    maniac: "Kill everyone. You win if you are the last one alive.",
    hooker: "Roleblock a player (they cannot act or vote next day).",
    lawyer: "Choose a client. They will appear 'Innocent' to Detective.",
    suicide: "You win if you get voted out during the day.",
    vagabond: "Witness one random visit at night.",
    lucky: "You have a 50% chance to survive an attack.",
    kamikaze: "If voted out, you take a random voter with you."
};

const Mafia = {

  /* ===================== LEADERBOARD ===================== */
  async showLeaderboard(AlexaInc, msg) {
      const sorted = Object.entries(userPoints).sort((a, b) => b[1] - a[1]).slice(0, 10);
      let text = "🏆 *MAFIA LEADERBOARD* 🏆\n\n";
      if (!sorted.length) text += "No points recorded.";
      sorted.forEach((e, i) => { text += `${i+1}. @${e[0].split('@')[0]} : ${e[1]} pts\n`; });
      await AlexaInc.sendMessage(msg.key.remoteJid, { text, mentions: sorted.map(s => s[0]) });
  },

  /* ===================== CREATE GAME ===================== */
  async createGame(AlexaInc, msg, botNumber) {
    if (msg.key.remoteJid.endsWith("@s.whatsapp.net")) return;
    if (Object.values(games).find(g => g.groupId === msg.key.remoteJid)) {
        return AlexaInc.sendMessage(msg.key.remoteJid, { text: "⚠️ Game already running!" });
    }

    let groupName = "this Group";
    try { const m = await AlexaInc.groupMetadata(msg.key.remoteJid); groupName = m.subject; } catch(e){}

    const sessionCode = randomCode();
    // Save expiration time to allow extensions
    const expiresAt = Date.now() + REGISTRATION_TIME;

    games[sessionCode] = {
      sessionCode, groupId: msg.key.remoteJid, groupName, phase: "register",
      players: {}, votes: {}, nightActions: {},
      registrationExpires: expiresAt,
      timers: { register: null, night: null, vote: null }
    };

    this.scheduleRegistrationEnd(AlexaInc, sessionCode, REGISTRATION_TIME);

    const joinUrl = `https://wa.me/${botNumber}?text=_join_${sessionCode}`;
    await AlexaInc.sendMessage(msg.key.remoteJid, {
      title: "🕵️ Mafia Game",
      text: `Session: ${sessionCode}\nMin 4 Players.\n\nRoles: Don, Detective, Doctor, Maniac, Hooker, etc.`,
      footer: "Registration Open",
      interactiveButtons: [{ name: "cta_url", buttonParamsJson: JSON.stringify({ display_text: "Join Game", url: joinUrl }) }]
    });
  },

  // Helper to handle registration timeout
  scheduleRegistrationEnd(AlexaInc, code, duration) {
      const game = games[code];
      if (!game) return;
      
      if (game.timers.register) clearTimeout(game.timers.register);

      game.timers.register = setTimeout(async () => {
          if (!games[code]) return;
          if (Object.keys(game.players).length < 4) {
              await AlexaInc.sendMessage(game.groupId, { text: "🚫 Registration closed. Not enough players (Min 4)." });
              delete games[code];
          } else {
              await AlexaInc.sendMessage(game.groupId, { text: "⏰ Auto-starting game..." });
              await Mafia.startGame(AlexaInc, { key: { remoteJid: game.groupId } });
          }
      }, duration);
  },

  /* ===================== EXTEND TIME ===================== */
  async extendRegistration(AlexaInc, msg) {
      const game = Object.values(games).find(g => g.groupId === msg.key.remoteJid);
      if (!game) return AlexaInc.sendMessage(msg.key.remoteJid, { text: "⚠️ No active game here." });
      if (game.phase !== "register") return AlexaInc.sendMessage(msg.key.remoteJid, { text: "⚠️ Game already started." });

      // Add 30 seconds
      const ADD_TIME = 30000;
      game.registrationExpires += ADD_TIME;
      const remaining = game.registrationExpires - Date.now();

      // Reschedule timer
      this.scheduleRegistrationEnd(AlexaInc, game.sessionCode, remaining);

      await AlexaInc.sendMessage(game.groupId, { 
          text: `⏳ Registration extended by 30s!\nTime remaining: ${Math.ceil(remaining / 1000)}s` 
      });
  },

  /* ===================== JOIN GAME ===================== */
  async joinGame(AlexaInc, msg, lid) {
    const text = msg.message?.conversation || "";
    if (!text.startsWith("_join_")) return;
    const code = text.replace("_join_", "").trim();
    const game = games[code];

    if (!game) return AlexaInc.sendMessage(lid, { text: "❌ Invalid code." });
    if (game.phase !== "register") return AlexaInc.sendMessage(lid, { text: "⚠️ Game already started." });
    if (game.players[lid]) return AlexaInc.sendMessage(lid, { text: "✅ Already joined." });
    
    game.players[lid] = { 
        jid: lid, name: msg.pushName || "Player", role: null, alive: true, 
        selfHealUsed: false, isHooked: false, detectiveMode: 'check' 
    };

    await safeSend(AlexaInc, lid, { text: `✅ You joined game in *${game.groupName}*` });
    await safeSend(AlexaInc, game.groupId, { text: `👤 ${msg.pushName} joined! (${Object.keys(game.players).length})` });
  },

  /* ===================== START GAME ===================== */
  async startGame(AlexaInc, msg) {
    const game = Object.values(games).find(g => g.groupId === msg.key.remoteJid);
    if (!game || game.phase !== "register") return;
    if (game.timers.register) clearTimeout(game.timers.register);

    const players = Object.values(game.players);
    if (players.length < 4) return AlexaInc.sendMessage(game.groupId, { text: "⚠️ Min 4 players required!" });

    game.phase = "night";

    const roles = [];
    const count = players.length;
    
    roles.push("don", "doctor", "detective");
    if (count === 4) roles.push("maniac");
    else {
        roles.push("mafia");
        if (count >= 5) roles.push("townie");
        if (count >= 6) roles.push("hooker");
        if (count >= 7) roles.push("sergeant");
        if (count >= 8) roles.push("maniac");
        if (count >= 9) roles.push("lawyer");
        if (count >= 10) roles.push("suicide");
        if (count >= 11) roles.push("vagabond");
        if (count >= 12) roles.push("lucky");
        if (count >= 13) roles.push("kamikaze");
    }
    while (roles.length < count) roles.push(Math.random() > 0.7 ? "mafia" : "townie");

    shuffle(roles);
    shuffle(players);
    players.forEach((p, i) => p.role = roles[i]);

    for (const p of players) {
      await safeSend(AlexaInc, p.jid, {
        text: `🎭 *GAME STARTED*\n\nRole: *${p.role.toUpperCase()}*\n${ROLE_DESC[p.role]}`
      });
    }

    await AlexaInc.sendMessage(game.groupId, { text: "Night has fallen... 🌙 Check your DMs!" });
    await this.startNight(AlexaInc, game);
  },

  /* ===================== NIGHT PHASE ===================== */
  async startNight(AlexaInc, game) {
    game.phase = "night";
    game.nightActions = {};
    Object.values(game.players).forEach(p => p.isHooked = false);
    
    if (game.timers.night) clearTimeout(game.timers.night);
    if (game.timers.vote) clearTimeout(game.timers.vote);

    game.timers.night = setTimeout(async () => {
        if (game.phase === "night") await this.resolveNight(AlexaInc, game);
    }, NIGHT_TIME);

    const alive = getAlivePlayers(game);

    for (const p of alive) {
        if (p.role === 'detective') {
            const buttons = [
                { name: "quick_reply", buttonParamsJson: JSON.stringify({ display_text: "🔍 Check Role", id: `_set_det_check` }) },
                { name: "quick_reply", buttonParamsJson: JSON.stringify({ display_text: "🔫 Kill", id: `_set_det_kill` }) }
            ];
            await safeSend(AlexaInc, p.jid, { text: "🌙 Detective: Choose your mode first.", interactiveButtons: buttons });
            continue;
        }
        await this.sendTargetList(AlexaInc, p, alive);
    }
  },

  async sendTargetList(AlexaInc, p, alivePlayers) {
      let text = null;
      let prefix = null;

      if (["don", "mafia"].includes(p.role)) { text = "🌙 Choose victim:"; prefix = "_n_kill_"; }
      if (p.role === "maniac") { text = "🌙 KILL EVERYONE:"; prefix = "_n_maniac_"; }
      if (p.role === "doctor") { text = "🌙 Choose save:"; prefix = "_n_heal_"; }
      if (p.role === "hooker") { text = "🌙 Choose distraction:"; prefix = "_n_hook_"; }
      if (p.role === "lawyer") { text = "🌙 Choose client:"; prefix = "_n_lawyer_"; }
      if (p.role === "detective") { 
          text = p.detectiveMode === 'kill' ? "🌙 Choose suspect to KILL:" : "🌙 Choose suspect to CHECK:";
          prefix = "_n_det_"; 
      }

      if (!text) return;

      const targets = alivePlayers.filter(x => {
          if (p.role === "doctor" && x.jid === p.jid && p.selfHealUsed) return false;
          return true;
      });

      const buttons = targets.filter(x => x.jid !== p.jid || p.role === 'doctor').map(x => ({
          name: "quick_reply",
          buttonParamsJson: JSON.stringify({ display_text: x.name, id: `${prefix}${x.jid}` })
      }));

      await safeSend(AlexaInc, p.jid, { text, footer: "Night Action", interactiveButtons: buttons });
  },

  /* ===================== HANDLE NIGHT ACTION ===================== */
  async handleNightAction(AlexaInc, msg, id, lid) {
    const game = Object.values(games).find(g => g.phase === "night" && g.players[lid]);
    if (!game) return;

    const p = game.players[lid];
    if (!p || !p.alive) return;

    if (id === "_set_det_check") {
        p.detectiveMode = 'check';
        await safeSend(AlexaInc, lid, { text: "Mode set to CHECK." });
        return this.sendTargetList(AlexaInc, p, getAlivePlayers(game));
    }
    if (id === "_set_det_kill") {
        p.detectiveMode = 'kill';
        await safeSend(AlexaInc, lid, { text: "Mode set to KILL." });
        return this.sendTargetList(AlexaInc, p, getAlivePlayers(game));
    }

    if (id.startsWith("_n_")) {
        const targetId = id.split("_").pop();
        if (p.role === "don" || p.role === "mafia") game.nightActions['mafia'] = targetId;
        else if (p.role === "detective") game.nightActions['detective'] = { type: p.detectiveMode, target: targetId };
        else game.nightActions[p.role] = targetId;
        await safeSend(AlexaInc, lid, { text: "✅ Action accepted." });
    }
  },

  /* ===================== RESOLVE NIGHT ===================== */
  async resolveNight(AlexaInc, game) {
    if (game.timers.night) clearTimeout(game.timers.night);
    
    const actions = game.nightActions;
    const players = game.players;
    const dead = new Set();

    if (actions['hooker']) {
        const hookedId = actions['hooker'];
        if (players[hookedId]) {
            players[hookedId].isHooked = true;
            const role = players[hookedId].role;
            if (['detective','doctor','maniac','lawyer'].includes(role)) delete actions[role];
        }
    }

    if (players[Object.keys(players).find(k => players[k].role === 'vagabond')]?.alive) {
        const actionKeys = Object.keys(actions).filter(k => k !== 'vagabond');
        if (actionKeys.length > 0) {
            const randomRole = actionKeys[Math.floor(Math.random() * actionKeys.length)];
            const vagabond = Object.values(players).find(p => p.role === 'vagabond');
            await safeSend(AlexaInc, vagabond.jid, { text: `👀 You saw ${randomRole.toUpperCase()} visit someone...` });
        }
    }

    const healedId = actions['doctor'];
    if (healedId && players[healedId].jid === healedId) players[healedId].selfHealUsed = true;
    const lawyerClientId = actions['lawyer'];

    const potentialDeaths = [];
    if (actions['mafia']) potentialDeaths.push({ killer: 'Mafia', target: actions['mafia'] });
    if (actions['maniac']) potentialDeaths.push({ killer: 'Maniac', target: actions['maniac'] });
    if (actions['detective'] && actions['detective'].type === 'kill') potentialDeaths.push({ killer: 'Detective', target: actions['detective'].target });

    for (const d of potentialDeaths) {
        const victim = players[d.target];
        if (!victim) continue;
        if (d.target === healedId) {} 
        else if (victim.role === 'lucky' && Math.random() > 0.5) {
            await safeSend(AlexaInc, victim.jid, { text: "🍀 You were attacked but survived!" });
        } else {
            dead.add(d.target);
        }
    }

    if (actions['detective'] && actions['detective'].type === 'check') {
        const targetId = actions['detective'].target;
        const detId = Object.keys(players).find(k => players[k].role === 'detective');
        let result = "Civilian";
        if (["mafia", "don"].includes(players[targetId].role)) result = "Mafia";
        if (players[targetId].role === "maniac") result = "Maniac";
        if (targetId === lawyerClientId) result = "Civilian";

        if (detId) await safeSend(AlexaInc, detId, { text: `🔍 Result: ${players[targetId].name} is **${result}**` });
        
        const sarge = Object.values(players).find(p => p.role === 'sergeant' && p.alive);
        if (sarge) await safeSend(AlexaInc, sarge.jid, { text: `🕵️ Detective checked ${players[targetId].name}: Result ${result}` });
    }

    const deadNames = [];
    dead.forEach(id => {
        players[id].alive = false;
        deadNames.push(`${players[id].name} (${players[id].role})`);
    });

    const don = Object.values(players).find(p => p.role === 'don');
    if (don && !don.alive) {
        const newDon = Object.values(players).find(p => p.role === 'mafia' && p.alive);
        if (newDon) {
            newDon.role = 'don';
            await safeSend(AlexaInc, newDon.jid, { text: "🎩 Promoted to DON." });
        }
    }
    
    const detective = Object.values(players).find(p => p.role === 'detective');
    if (detective && !detective.alive) {
        const newDet = Object.values(players).find(p => p.role === 'sergeant' && p.alive);
        if (newDet) {
            newDet.role = 'detective';
            await safeSend(AlexaInc, newDet.jid, { text: "🕵️ Promoted to DETECTIVE." });
        }
    }

    await AlexaInc.sendMessage(game.groupId, {
        text: deadNames.length > 0 ? `☀️ Morning Report:\n\n💀 DEAD:\n${deadNames.join("\n")}` : "☀️ Morning Report:\n\n😌 No one died."
    });

    const win = await this.checkWin(AlexaInc, game, true); 
    if (!win) await this.startVoting(AlexaInc, game);
  },

  /* ===================== DAY VOTING ===================== */
  async startVoting(AlexaInc, game) {
    game.phase = "vote";
    game.votes = {};
    
    game.timers.vote = setTimeout(async () => {
      if (game.phase === "vote") await this.resolveVote(AlexaInc, game);
    }, VOTE_TIME);

    const alive = getAlivePlayers(game);

    for (const p of alive) {
      if (p.isHooked) {
          await safeSend(AlexaInc, p.jid, { text: "💋 You were Hooked. No vote today." });
          continue;
      }
      const buttons = alive.filter(x => x.jid !== p.jid).map(x => ({
          name: "quick_reply",
          buttonParamsJson: JSON.stringify({ display_text: x.name, id: `_day_vote_${x.jid}` })
      }));
      await safeSend(AlexaInc, p.jid, { text: "🗳 Vote to hang:", footer: "Time: 60s", interactiveButtons: buttons });
    }
    await AlexaInc.sendMessage(game.groupId, { text: "🗳 Voting started!" });
  },

  /* ===================== HANDLE VOTE ===================== */
  async handleVote(AlexaInc, msg, id, lid) {
    const game = Object.values(games).find(g => g.phase === "vote" && g.players[lid]);
    if (!game) return;

    const voter = game.players[lid];
    if (!voter || !voter.alive || voter.isHooked) return;

    if (id.startsWith("_day_vote_")) {
      const targetId = id.replace("_day_vote_", "");
      game.votes[lid] = targetId;

      await safeSend(AlexaInc, lid, { text: `Voted for ${game.players[targetId].name}` });
      await AlexaInc.sendMessage(game.groupId, { text: `🗳 *${voter.name}* voted for *${game.players[targetId].name}*` });

      const capableVoters = getAlivePlayers(game).filter(p => !p.isHooked).length;
      if (Object.keys(game.votes).length >= capableVoters) await this.resolveVote(AlexaInc, game);
    }
  },

  /* ===================== RESOLVE VOTE ===================== */
  async resolveVote(AlexaInc, game) {
    if (game.timers.vote) clearTimeout(game.timers.vote);

    const map = {};
    for (const v of Object.values(game.votes)) map[v] = (map[v] || 0) + 1;
    const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]);
    
    let eliminatedId = null;
    if (sorted.length > 0) {
        if (sorted.length > 1 && sorted[0][1] === sorted[1][1]) eliminatedId = null;
        else eliminatedId = sorted[0][0];
    }

    if (eliminatedId) {
        const victim = game.players[eliminatedId];
        victim.alive = false;
        await AlexaInc.sendMessage(game.groupId, { text: `🗳 Hanged: **${victim.name}**\nRole: ${victim.role.toUpperCase()}` });

        if (victim.role === 'kamikaze') {
            const votersForKami = Object.keys(game.votes).filter(vid => game.votes[vid] === eliminatedId);
            if (votersForKami.length > 0) {
                const unlucky = votersForKami[Math.floor(Math.random() * votersForKami.length)];
                game.players[unlucky].alive = false;
                await AlexaInc.sendMessage(game.groupId, { text: `💣 **KAMIKAZE!** ${victim.name} took **${game.players[unlucky].name}** down!` });
            }
        }
        if (victim.role === 'suicide') return await this.endGame(AlexaInc, game, "SUICIDE", [victim]);
    } else {
        await AlexaInc.sendMessage(game.groupId, { text: "⚖️ Tie vote. No one died." });
    }

    await this.checkWin(AlexaInc, game);
  },

  /* ===================== WIN CHECK ===================== */
  async checkWin(AlexaInc, game, skipNightStart = false) {
    const alive = getAlivePlayers(game);
    const mafiaCount = alive.filter(p => ["mafia", "don"].includes(p.role)).length;
    const maniacCount = alive.filter(p => p.role === "maniac").length;
    const townCount = alive.length - mafiaCount - maniacCount;

    if (alive.length === maniacCount && maniacCount > 0) return await this.endGame(AlexaInc, game, "MANIAC", alive);
    if (mafiaCount >= townCount + maniacCount) return await this.endGame(AlexaInc, game, "MAFIA", Object.values(game.players).filter(p => ["mafia", "don"].includes(p.role)));
    if (mafiaCount === 0 && maniacCount === 0) return await this.endGame(AlexaInc, game, "TOWN", Object.values(game.players).filter(p => !["mafia", "don", "maniac", "suicide"].includes(p.role)));

    if (!skipNightStart) await this.startNight(AlexaInc, game);
    return false;
  },

  /* ===================== END GAME ===================== */
  async endGame(AlexaInc, game, winningTeam, winners) {
      if (game.timers.register) clearTimeout(game.timers.register);
      if (game.timers.night) clearTimeout(game.timers.night);
      if (game.timers.vote) clearTimeout(game.timers.vote);

      winners.forEach(p => { userPoints[p.jid] = (userPoints[p.jid] || 0) + WIN_POINTS; });
      savePoints();

      let text = `🏆 *${winningTeam} WINS!*\n\n🥇 *Winners (+${WIN_POINTS} pts):*\n`;
      const winnerJids = winners.map(w => w.jid);
      const allPlayers = Object.values(game.players);

      allPlayers.filter(p => winnerJids.includes(p.jid)).forEach(p => { text += `• ${p.name} (${p.role})\n`; });
      text += `\n💀 *Others:*\n`;
      allPlayers.filter(p => !winnerJids.includes(p.jid)).forEach(p => { text += `• ${p.name} (${p.role})\n`; });

      await AlexaInc.sendMessage(game.groupId, { text });
      delete games[game.sessionCode];
      return true;
  }
};

module.exports = Mafia;