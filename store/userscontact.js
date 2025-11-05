const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'userscontact.json');

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

// === Load a single user by number ===
 function loadUserByNumber(number) {
  try {
    const users = readUsersFile();
    return users.find(u => u.number === number) || null;
  } catch (err) {
    console.error("Error loading user:", err);
    return null;
  }
}

// === Add or update user (only in private chat) ===
async function updateUser(msg , participants) {
  const from = msg.key.remoteJid ;
  //console.log(msg)
  let islid;
  if (!from.endsWith('@s.whatsapp.net')) {
    const isparticipantlid = msg.key.participant.endsWith('@lid')
    //console.log(isparticipantlid , participants)
    islid = isparticipantlid ? (await participants.find(jsn => jsn.lid === msg.key.participant))?.id?.replace(/@.*/, "") : msg.participant.replace(/@.*/, "") ;
  }else{  islid = from.replace(/:.*/, "").replace('@s.whatsapp.net', '');}

  const rawName = msg.pushName || null ;


  let users = readUsersFile();
  const existingIndex = users.findIndex(u => u.number === islid);

  // If user doesn't exist, add (even if name is missing)
  if (existingIndex === -1) {
    const name = rawName && rawName.trim() ? rawName : "Unknown";
    users.push({ number: islid, name });
    saveUsersjsonnn(users);
    console.log(`✅ Added new user: ${name} (${islid})`);
    return;
  }

  // If user exists, only update if new name is valid and different
  if (rawName && rawName.trim() && users[existingIndex].name !== rawName.trim()) {
    users[existingIndex].name = rawName.trim();
    saveUsersjsonnn(users);
    console.log(`🔁 Updated user name: ${islid} → ${rawName.trim()}`);
  }
}

module.exports = {
  updateUser,
  loadUserByNumber,
  readUsersFile,
   saveUsersjsonnn
};
