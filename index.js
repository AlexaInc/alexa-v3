const {
    makeWASocket,
    AnyMessageContent,
    BinaryInfo,
    delay,
    DisconnectReason,
    downloadAndProcessHistorySyncNotification,
    encodeWAM,
    fetchLatestBaileysVersion,
    getAggregateVotesInPollMessage,
    getHistoryMsg,
    isJidNewsletter,
    isJidBroadcast,
    Browsers,
    makeCacheableSignalKeyStore,
    makeInMemoryStore,
    proto,
    
    useMultiFileAuthState,
    WAMessageContent,
    WAMessageKey
} = require('@whiskeysockets/baileys');
require('dotenv').config()
const pino = require("pino");
//const art = require('ascii-art');
let isNewLogin = null;
//const app = require('./server');
const baileys = require('@whiskeysockets/baileys')
const mysql = require("mysql2");
const DB_HOST = process.env["DB_HOST"];
const DB_UNAME = process.env["DB_UNAME"];
const DB_NAME = process.env["DB_NAME"];
const DB_PASS = process.env["DB_PASS"];
const DB_PORT = process.env["DB_PORT"] || 3306 ;


const getBuffer = async (url, options) => {
    try {
        options ? options : {}
        const res = await axios({
            method: "get",
            url,
            headers: {
                'DNT': 1,
                'Upgrade-Insecure-Request': 1
            },
            ...options,
            responseType: 'arraybuffer'
        })
        return res.data
    } catch (err) {
        return err
    }
}



require('./whatsappState'); // Import shared state
const {
    handleMessage
} = require('./bot'); // Import message handler
const chalk = require('kleur');
const {
    default: P
} = require("pino");
const express = require('express');
const NodeCache = require('node-cache');

const session = require('express-session');
const fs = require('fs');
const path = require('path');
const STORE_DIR = "./store";
if (!fs.existsSync(STORE_DIR)) fs.mkdirSync(STORE_DIR);
const msgRetryCounterCache = new NodeCache();
const PORT = process.env.PORT || 8000;
const dataFile = path.join(__dirname, 'sharedData.json');
const si = require('systeminformation');
const WebSocket = require('ws');
const { default: axios } = require('axios');
const logger = P({
    timestamp: () => `,"time":"${new Date().toJSON()}"`
}, P.destination('./wa-logs.txt'));
logger.level = 'debug';

/**
 * Saves a message to a JSON file, now including media URL and mimetype.
 * Assumes 'fs', 'path', and 'STORE_DIR' are defined globally.
 */
/**
 * Saves a message, including media decryption keys (mediaKey, iv, etc.).
 * Converts Buffers to base64 for JSON storage.
 */
/**
 * Saves a message, including media decryption keys (mediaKey, iv, etc.).
 * Converts Buffers to base64 for JSON storage.
 */
function saveMessage(jid, msg) {
  if (!jid || !msg?.message) return;

  const isGroup = jid.endsWith("@g.us");
  const filePath = path.join(STORE_DIR, `${jid}.json`);
  let chatData = [];

  // Load existing messages
  if (fs.existsSync(filePath)) {
    try {
      chatData = JSON.parse(fs.readFileSync(filePath));
    } catch {
      chatData = [];
    }
  }

  // --- Start: Media Logic ---
  let messageText = "";
  let mediaUrl = null;
  let mediaMimetype = null;
  // --- Fields for decryption ---
  let mediaKey = null;
  let mediaIv = null;
  let mediaFileEncSha256 = null;
  let mediaFileSha256 = null;

  const msgType = Object.keys(msg.message)[0];
  const messageContent = msg.message[msgType];

  switch (msgType) {
    case "conversation":
      messageText = messageContent;
      break;
    case "extendedTextMessage":
      messageText = messageContent.text;
      break;
    case "imageMessage":
    case "videoMessage":
    case "documentMessage":
    case "stickerMessage":
    case "audioMessage":
      messageText = messageContent.caption || "";
      mediaUrl = messageContent.url;
      mediaMimetype = messageContent.mimetype;

      // --- Store decryption keys as base64 strings ---
      mediaKey = messageContent.mediaKey?.toString('base64') || null;
      mediaIv = messageContent.iv?.toString('base64') || null;
      mediaFileEncSha256 = messageContent.fileEncSha256?.toString('base64') || null;
      mediaFileSha256 = messageContent.fileSha256?.toString('base64') || null;
      break;
    default:
      // Other message types (reaction, poll, etc.)
      break;
  }
  // --- End: Media Logic ---

  // Handle replies
  let replyInfo = null;
  const contextInfo = messageContent?.contextInfo;

  if (contextInfo?.quotedMessage) {
    const quoted = contextInfo.quotedMessage;
    const quotedType = Object.keys(quoted)[0];
    const quotedContent = quoted[quotedType];
    let quotedText = "";

    switch (quotedType) {
      case "conversation":
        quotedText = quotedContent;
        break;
      case "extendedTextMessage":
        quotedText = quotedContent.text || "";
        break;
      case "imageMessage":
      case "videoMessage":
      case "documentMessage":
        quotedText = quotedContent.caption || "";
        break;
    }

    replyInfo = {
      sender: contextInfo.participant,
      messageId: contextInfo.stanzaId,
      messageText: quotedText,
    };
  }

  // --- Formatted Object ---
  const formatted = {
    sender: msg.key.fromMe ? "me" : isGroup ? msg.key.participant || msg.participant : msg.key.remoteJid,
    pushname: msg.pushname,
    messageId: msg.key.id,
    messageText: messageText,
    mediaUrl: mediaUrl,
    mediaMimetype: mediaMimetype,
    // --- New fields added (as base64 strings) ---
    mediaKey: mediaKey,
    mediaIv: mediaIv,
    mediaFileEncSha256: mediaFileEncSha256,
    mediaFileSha256: mediaFileSha256,
    //
    reply: replyInfo,
  };

  // Avoid duplicates
  if (!chatData.find(m => m.messageId === formatted.messageId)) {
    chatData.push(formatted);
  }

  // Optional: keep last 500 messages
  if (chatData.length > 500) chatData = chatData.slice(-500);

  fs.writeFileSync(filePath, JSON.stringify(chatData, null, 2));
}


function loadMessage(jid, messageId) {
  if (!jid || !messageId) return null;

  const filePath = path.join(STORE_DIR, `${jid}.json`);
  if (!fs.existsSync(filePath)) return null;

  try {
    const chatData = JSON.parse(fs.readFileSync(filePath));
    return chatData.find(m => m.messageId === messageId) || null;
  } catch {
    return null;
  }
}








const STORE_DIR2 = path.join(__dirname, "store_ev");
if (!fs.existsSync(STORE_DIR2)) fs.mkdirSync(STORE_DIR2);

// Save any event
function saveEvent(eventName, data) {
  const filePath = path.join(STORE_DIR2, `${eventName}.json`);
  let existing = [];

  if (fs.existsSync(filePath)) {
    try {
      existing = JSON.parse(fs.readFileSync(filePath));
    } catch {
      existing = [];
    }
  }

  existing.push({
    timestamp: Date.now(),
    data,
  });

  // Optional: keep last 500 events per type
  if (existing.length > 500) existing = existing.slice(-500);

  fs.writeFileSync(filePath, JSON.stringify(existing, null, 2));
}

// Load events of a certain type
function loadEvents(eventName) {
  const filePath = path.join(STORE_DIR2, `${eventName}.json`);
  if (!fs.existsSync(filePath)) return [];
  try {
    return JSON.parse(fs.readFileSync(filePath));
  } catch {
    return [];
  }
}














const db = mysql.createPool({
  host: DB_HOST,
  user: DB_UNAME,
  password: DB_PASS,
  database: DB_NAME,
  port:DB_PORT
});

db.getConnection((err) => {
  if (err) {
    console.error("Error connecting to MySQL:", err);
  } else {
    console.log("Connected to MySQL");
  }
});

// Store logs in an array, now also keeping HTML-styled logs
const SESSION_FOLDER = './auth5a'

async function startWhatsAppConnection ()  {

const art = require('ascii-art');

fs.readFile('./res/ascii.txt', 'utf8', (err, data) => {
  if (err) {
    console.error('Error reading the file:', err);
    return;
  }
  console.log(data);
});



    const {
        state,
        saveCreds
    } = await useMultiFileAuthState('./auth5a');
    const {
        version,
        isLatest
    } = await fetchLatestBaileysVersion();
    console.log(`using WA v${version.join('.')}, isLatest: ${isLatest}`);


const APP_NAME = 'Alexa'; // Your app name
const ORGANIZATION_NAME = 'AlexaInc'; // Your organization's name
const APP_VERSION = '3.0.0'; // Your app version

const CustomBrowsersMap = {
    ...Browsers, // Spread the original BrowsersMap to keep existing functionality

    // Override the appropriate method
    appropriate: (browser) => {
        // Use custom values for your app, organization, and version
        if (process.platform === 'linux') {
            return [ORGANIZATION_NAME, APP_NAME,  APP_VERSION];
        } else if (process.platform === 'darwin') {
            return [ORGANIZATION_NAME, APP_NAME, APP_VERSION];
        } else if (process.platform === 'win32') {
            return [ORGANIZATION_NAME, APP_NAME, APP_VERSION];
        } else {
            return [ORGANIZATION_NAME, APP_NAME, APP_VERSION]; // Default for unknown platform
        }
    }
};


    const AlexaInc = makeWASocket({
        version,
        logger: P({
            level: "fatal"
        }),
        browser: CustomBrowsersMap.appropriate('Alexa'),
        printQRInTerminal: true,
        auth: {
            creds: state.creds,
            /** caching makes the store faster to send/recv messages */
            keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
        msgRetryCounterCache,
        generateHighQualityLinkPreview: true,
        // ignore all broadcast messages -- to receive the same
        // comment the line below out
        shouldIgnoreJid: jid => isJidBroadcast(jid),
        // implement to handle retries & poll updates
    });

const eventsToStore = [
  // Messages
  'messages.upsert',      // new incoming messages
  'messages.update',      // message status updates (read, deleted, etc.)
  'messages.delete',      // message deletions

  // Connections
  'connection.update',    // connection status (open, close, reconnect)
  'creds.update',         // credentials updated

  // Groups
  'group-participants.update', // someone joins/leaves/kicked
  'group-update',             // group settings changed

  // Chats & Contacts
  'chats.upsert',        // new chat added
  'chats.update',        // chat info updated
  'contacts.upsert',     // contact info added
  'contacts.update',     // contact info updated

  // Presence / Typing
  'presence.update',     // user presence (online/offline)
  'user-presence.update',// typing/recording
  'reaction',            // message reactions
  'poll.update',         // poll updates

  // Misc / Other
  'call',                // call received
  'call.reject',         // call rejected
  'call.accept',         // call accepted
  'blocklist.update',    // blocked contacts
  'chats.delete',        // chat deleted
  'messages.reaction',   // reactions to messages
  'history.sync',        // history sync notifications
  'message-receipt.update', // message read/delivery receipts
];


for (const evName of eventsToStore) {
  AlexaInc.ev.on(evName, (data) => {
    try {
      saveEvent(evName, data); // your persistent store function
    } catch (err) {
      console.error(`❌ Failed to store event ${evName}:`, err);
    }
  });
}

    AlexaInc.ev.on('qr',(qr)=>{
        console.log("\n📌 Scan this QR code with WhatsApp:\n");
        console.log(qr);
    })
    AlexaInc.ev.on('creds.update', saveCreds);

    AlexaInc.ev.on('group-participants.update', async (anu) => {
       // console.log(anu);
        const botNumber = AlexaInc.user.id.split(':')[0];
        const frommmee = anu.participants.includes(`${botNumber}@s.whatsapp.net`);
        if (frommmee) return;
        let groupMetadata = await AlexaInc.groupMetadata(anu.id);
        let participants = anu.participants;
        //console.log(participants)
        
        for (let num of participants) {
            let ppuser;
            let ppgroup;
            
            // Fetch user profile picture
            try {
                ppuser = await AlexaInc.profilePictureUrl(num, 'image');
            } catch {
                ppuser = 'https://pngimg.com/uploads/anime_girl/anime_girl_PNG33.png'; // Fallback if no profile picture
            }
    
            // Fetch group profile picture
            try {
                ppgroup = await AlexaInc.profilePictureUrl(anu.id, 'image');
            } catch {
                ppgroup = 'https://pngimg.com/uploads/anime_girl/anime_girl_PNG33.png'; // Fallback if no group picture
            }
    
            // If action is 'add' (someone joined the group)
            if (anu.action == 'add') {
                const query = `
                    SELECT * FROM \`groups\` WHERE group_id = ? AND is_welcome = TRUE
                `;
                
                // Run SQL query to check if welcome message is enabled
                db.query(query, [anu.id], async (err, result) => {
                    if (err) {
                        console.error('Error fetching welcome message:', err);
                        return;
                    }
                    
                    let wcmsg;
                    let isWelcome = false;
                    
                    // Check if result is found and set wcmsg
                    if (result.length > 0) {
                        wcmsg = result[0].wc_m + '\n' + groupMetadata.desc;  // Set welcome message from DB
                        //console.log(groupMetadata)
                        isWelcome = true;  // Set welcome flag to true
                    } else {
                        wcmsg = groupMetadata.desc; // Fallback to group description
                    }
                    
                    // Fetch the user profile picture as a buffer
                    let buffer;
                    try {
                        buffer = await getBuffer(ppuser)
                    } catch (error) {
                        console.error('Error fetching profile picture:', error);
                        buffer = fs.readFileSync('./res/alexa.jpg');
                    }
    
                    // Prepare the message to send
                    if (buffer && isWelcome) {
                        const fglink = {
                            key: {
                                fromMe: false,
                                "participant": num,
                                "remoteJid": anu.id
                            },
                            message: {
                                orderMessage: {
                                    itemCount: 1,
                                    status: 200,
                                    thumbnail: buffer.data,
                                    surface: 200,
                                    message: wcmsg,  // Use the welcome message
                                    orderTitle: 'alexaaa',
                                    sellerJid: num,
                                }
                            },
                            contextInfo: {
                                "forwardingScore": 999,
                                "isForwarded": true
                            },
                            sendEphemeral: true
                        };
    
                        // Send the image message with the welcome message
                        he = `Welcome to ${groupMetadata.subject} @${num.split("@")[0]}\n\n ${wcmsg}`
                        await AlexaInc.sendMessage(anu.id, { image: buffer, caption:he }, { quoted: fglink });
                    }
                });
            }
        }
    });
    

    AlexaInc.ev.on('messages.upsert', (m) => {
          const { messages } = m;
  if (!messages?.length) return;

  const msg = messages[0];
  const jid = msg.key.remoteJid;

  saveMessage(jid, msg);
        handleMessage(AlexaInc, m , loadMessage, saveMessage)
    }); // Call bot.js function

    let isConnected = false;

    AlexaInc.ev.on('connection.update', (update) => {

        const { connection,lastDisconnect, qr, isNewLogin } = update;
        if (qr) {
            console.log("\n🔄 New QR code generated! Please scan it.\n");
            var qrcode = require('qrcode-terminal');
console.log("\n📌 Scan this QR code with WhatsApp:\n");
console.log(qr);
qrcode.generate(qr, {small: true}, function (qrcode) {
    console.log(qrcode)
});
            
        }

        isConnected = connection === 'open';

if (connection === 'open') {


 global.botPhoneNumber = AlexaInc.user.id.split(':')[0];

 if (!global.botPhoneNumber) {
    global.connectionStatus = 'Offline';
 }else{
    global.connectionStatus = 'Online';
 }
            

            const fownerNumber = process.env["Owner_nb"].split(",")[0].trim();
            if (fownerNumber) {
                AlexaInc.sendMessage(`${fownerNumber}@s.whatsapp.net`, {
                    text: 'Your bot Alexa is ready to use now'
                })
                AlexaInc.sendMessage('120363407628540320@g.us', {
                    text: 'Your bot Alexa is ready to use now'
                })
                    .then(() => console.log('Bot started without error'))
                    .catch(err => console.error('Error sending message to owner:', err));
            } else {
                console.error('Error: Owner phone number not found');
            }
        }

                if (isNewLogin) {
            console.log("🔄 Restarting connection after QR scan...");
            setTimeout(startWhatsAppConnection, 5000); // Restart after 2 sec
        } else                 if (connection === 'close') {
            const reason = lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.message;
 console.log(reason);


        } 
    });




//await AlexaInc.start();
}
startWhatsAppConnection();

// Log initialization
function writeData(data) {
  fs.writeFileSync(dataFile, JSON.stringify(data));
}

setInterval(() => {
  const data = { number: global.botPhoneNumber , status: global.connectionStatus };
  writeData(data);
  //console.log('Data written to shared file:', data);
}, 5000); // Write data every 5 seconds



// Function to delete logs directory


// Listen for process exit signals
          // Normal exit
process.on('exit', () => {
  // When index.js stops or crashes, set data to null
    const data = { number: null , status: 'Offline' };
  writeData(data);
 // deleteLogsDir();
  
});
process.on("SIGINT", () => {                // Ctrl + C
    console.log("\n⚠️ Process interrupted (SIGINT)");
    const data = { number: null , status: 'Offline' };
  writeData(data);
    //deleteLogsDir();
    process.exit(0);
});
process.on("SIGTERM", () => {               // Kill command
    console.log("\n⚠️ Process terminated (SIGTERM)");
    const data = { number: null , status: 'Offline' };
  writeData(data);
    //deleteLogsDir();
    process.exit(0);
});
process.on("uncaughtException", (err) => {  // Unhandled error
    console.error("❌ Uncaught Exception:", err);
    const data = { number: null , status: 'Offline' };
  writeData(data);
    //deleteLogsDir();
    process.exit(1);
});
process.on('beforeExit', () => {
  // When index.js stops or crashes, set data to null
    const data = { number: null , status: 'Offline' };
  writeData(data);
  //deleteLogsDir();
  console.log('index.js stopped, data set to null');
});   // Just before exit
