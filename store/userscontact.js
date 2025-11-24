const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'store', 'userscontact.json');

// === Ensure store folder exists ===
if (!fs.existsSync(path.dirname(filePath))) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

// === Safe file read helper ===
function readUsersFile() {
    try {
        if (!fs.existsSync(filePath)) return [];
        const data = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(data || '[]');
    } catch (err) {
        console.error("Error reading users file:", err);
        return [];
    }
}

// === Save users helper ===
function saveUsersjsonnn(users) {
    try {
        fs.writeFileSync(filePath, JSON.stringify(users, null, 2));
    } catch (err) {
        console.error("Error saving users:", err);
    }
}

// === MAIN FUNCTION: Add or update (Group OR User) ===
async function updateUser(msg, participants, groupSubject = null) {
    if (msg.key.remoteJid?.endsWith('@newsletter')) return;

    let database = readUsersFile();
    let dbChanged = false;

    const remoteJid = msg.key.remoteJid;
    
    // Check if this message is from a Private Chat (DM)
    // If it is NOT a group, it is private.
    const isDirectMessage = !remoteJid.endsWith('@g.us');

    // ===========================
    // 1. SAVE GROUP INFO (If applicable)
    // ===========================
    if (!isDirectMessage && groupSubject) {
        const existingGroupIndex = database.findIndex(u => u.id === remoteJid);

        if (existingGroupIndex === -1) {
            database.push({ type: 'group', id: remoteJid, name: groupSubject });
            dbChanged = true;
        } else {
            if (database[existingGroupIndex].name !== groupSubject) {
                database[existingGroupIndex].name = groupSubject;
                dbChanged = true;
            }
        }
    }

    // ===========================
    // 2. RESOLVE USER IDENTITY (JID vs LID)
    // ===========================
    let rawParticipant, rawParticipantAlt;

    if (isDirectMessage) {
        // Private Chat: RemoteJid is the user
        rawParticipant = remoteJid;
        rawParticipantAlt = msg.key.remoteJidAlt;
    } else {
        // Group Chat: Participant is the user
        rawParticipant = msg.key.participant;
        rawParticipantAlt = msg.key.participantAlt;
    }

    let finalJid = null; 
    let finalLid = null;

    // Logic: Swap based on extensions
    if (rawParticipant?.endsWith('@lid')) {
        finalLid = rawParticipant;
        finalJid = rawParticipantAlt; 
    } else if (rawParticipantAlt?.endsWith('@s.whatsapp.net')) {
        finalJid = rawParticipantAlt;
        finalLid = rawParticipant;
    } else {
        finalJid = rawParticipant;
        finalLid = rawParticipantAlt;
    }

    // ===========================
    // 3. SAVE USER INFO
    // ===========================
    if (finalJid && finalJid.endsWith('@s.whatsapp.net')) {
        
        const number = finalJid.replace(/@.*/, ""); 
        const pushName = msg.pushName || null;
        
        const existingUserIndex = database.findIndex(u => u.number === number);

        if (existingUserIndex === -1) {
            // === NEW USER ===
            database.push({
                type: 'user',
                number: number,
                jid: finalJid,
                lid: finalLid || null,
                name: pushName || "Unknown",
                isPrivate: isDirectMessage // True if DM, False if found in Group
            });
            //console.log(`✅ Added New User: ${pushName} (Private: ${isDirectMessage})`);
            dbChanged = true;
        } else {
            // === UPDATE EXISTING USER ===
            const currentUser = database[existingUserIndex];

            // Update Name
            if (pushName && pushName.trim() && currentUser.name !== pushName.trim()) {
                currentUser.name = pushName.trim();
                dbChanged = true;
            }
            // Update LID
            if (finalLid && !currentUser.lid) {
                currentUser.lid = finalLid;
                dbChanged = true;
            }
            
            // Update isPrivate STATUS
            // If they are chatting privately now, mark as true.
            // If they are in a group, KEEP existing status (don't downgrade true to false).
            if (isDirectMessage && !currentUser.isPrivate) {
                currentUser.isPrivate = true;
                //console.log(`🆙 User ${currentUser.name} upgraded to Private Chat User`);
                dbChanged = true;
            }
        }
    }

    if (dbChanged) {
        saveUsersjsonnn(database);
    }
}

// === Load Only Users who have DM'd the bot ===
function loadAllPrivateChats() {
    try {
        const data = readUsersFile();
        return data.filter(item => item.type === 'user' && item.isPrivate === true);
    } catch (err) {
        return [];
    }
}

// === Load User By Number ===
function loadUserByNumber(number) {
    try {
        const users = readUsersFile();
        return users.find(u => u.number === number && u.type !== 'group') || null;
    } catch (err) {
        return null;
    }
}

// === Load All Users (Group participants + Private) ===
function loadAllUsers() {
    try {
        const data = readUsersFile();
        return data.filter(item => item.type === 'user');
    } catch (err) {
        return [];
    }
}

// === Load All Groups ===
function loadAllGroups() {
    try {
        const data = readUsersFile();
        return data.filter(item => item.type === 'group');
    } catch (err) {
        return [];
    }
}

module.exports = {
    updateUser,
    loadUserByNumber,
    loadAllUsers,
    loadAllGroups,
    loadAllPrivateChats, // New function exported here
    readUsersFile,
    saveUsersjsonnn
};