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
    jidNormalizedUser,
    Browsers,
    makeCacheableSignalKeyStore,
    makeInMemoryStore,
    proto,
    
    useMultiFileAuthState,
    WAMessageContent,
    WAMessageKey
} = require('@whiskeysockets/baileys');
require('dotenv').config()
// const Ai = require('./res/js/ollama')
// Ai.initialize()
const pino = require("pino");
const alexasock = require('ws');
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
// Example in browser JavaScript
const alexasocket = new alexasock('ws://localhost:8000/data-transfer');

alexasocket.onopen = () => {
  // Register with a unique ID
  alexasocket.send(JSON.stringify({
    type: "register",
    id: "app1" 
  }));
};


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
const { json } = require('stream/consumers');
const logger = P({
    timestamp: () => `,"time":"${new Date().toJSON()}"`
}, P.destination('./wa-logs.txt'));
logger.level = 'debug';

let restartHistory = JSON.parse(fs.readFileSync('./restarts.json', 'utf8'));
/**
 * Saves a message to a JSON file, now including media URL and mimetype.
 * Assumes 'fs', 'path', and 'STORE_DIR' are defined globally.
 */
/**
 * Saves a message, including media decryption keys (mediaKey, iv, etc.).
 * Converts Buffers to base64 for JSON storage.
 */

/**
 * Parses the raw message object into a simple, usable format.
 * @param {object} msg The raw Baileys message object
 * @returns {object} A simplified message object
 */
function parseMessage(msg) {
    if (!msg || !msg.message) return {};

    const m = msg.message;
    const msgType = Object.keys(m)[0];
    const messageContent = m[msgType];

    if (!messageContent) return {};

    // This is the ONLY contextInfo you need.
    // It comes from imageMessage, extendedTextMessage, videoMessage, etc.
    const contextInfo = messageContent.contextInfo;

    // 1. Get the full text (from caption or text)
    const text = messageContent.text || messageContent.caption || "";
    
    // 2. Get the quoted message ID
    // We just use optional chaining on the 'contextInfo' variable.
    const quotedid = contextInfo?.stanzaId;
  let replyInfo = null;
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
    // 3. Get mentioned JIDs
    const mentionedJids = contextInfo?.mentionedJid;

    // 4. Get sender info
    const isGroup = msg.key.remoteJid.endsWith("@g.us");
    const sender = msg.key.fromMe ? "me" : (isGroup ? msg.key.participant : msg.key.remoteJid);

    // 5. Get the command and the text *after* the command
    const prefix = /^[./!]/; // Assumes prefix is /, ., or !
    const body = text.trim().split(/ +/);
    const commandWithPrefix = body.shift().toLowerCase();
    
    let command = null;
    let commandText = text; // Default to full text if no command

    if (prefix.test(commandWithPrefix)) {
        command = commandWithPrefix.slice(1); // "filter"
        commandText = body.join(' '); // "hi"
    }

    // --- Return a clean, simple object ---
    return {
        msg, // The original message, just in case
        msgType,
        messageContent,
        contextInfo,
        replyInfo,
        text: text,           // The full, original text/caption
        command: command,       // The command (e.g., "filter")
        commandText: commandText, // The text after the command (e.g., "hi")
        
        quotedid: quotedid,     // The ID of the replied-to message
        mentionedJids: mentionedJids, // List of mentions
        
        sender: sender,
        isGroup: isGroup,
        fromMe: msg.key.fromMe,
        jid: msg.key.remoteJid
    };
}



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

/**
 * Load messages between two messageIds (inclusive).
 * Works for opaque IDs (UUID/hex) by slicing array indices.
 * If all messageIds are numeric strings, it will do numeric range filtering.
 *
 * @param {string} jid - chat file base name (without .json)
 * @param {string} startId
 * @param {string} endId
 * @returns {Array} array of message objects (empty array if none/failure)
 */
function loadMessagesBetween(jid, startId, endId) {
  if (!jid || !startId || !endId) return [];

  const filePath = path.join(STORE_DIR, `${jid}.json`);
  if (!fs.existsSync(filePath)) return [];

  try {
    const chatData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!Array.isArray(chatData)) return [];

    // If all messageId values are numeric-ish, do numeric filtering (backwards compatible)
    const allNumeric = chatData.every(m => /^[+-]?\d+$/.test(String(m.messageId)));
    if (allNumeric) {
      const start = parseInt(startId, 10);
      const end = parseInt(endId, 10);
      if (Number.isNaN(start) || Number.isNaN(end)) return [];

      const low = Math.min(start, end);
      const high = Math.max(start, end);

      return chatData.filter(m => {
        const idNum = parseInt(m.messageId, 10);
        return idNum >= low && idNum <= high;
      });
    }

    // Non-numeric IDs: find indices in array and slice
    const findFirstIndex = (id) => {
      for (let i = 0; i < chatData.length; i++) {
        if (String(chatData[i].messageId) === String(id)) return i;
      }
      return -1;
    };

    const findLastIndex = (id) => {
      for (let i = chatData.length - 1; i >= 0; i--) {
        if (String(chatData[i].messageId) === String(id)) return i;
      }
      return -1;
    };

    let startIndex = findFirstIndex(startId);
    let endIndex = findLastIndex(endId);

    // if either id not found, return empty array
    if (startIndex === -1 || endIndex === -1) return [];

    // if end comes before start, swap so we still return a contiguous block
    if (endIndex < startIndex) {
      const tmp = startIndex;
      startIndex = endIndex;
      endIndex = tmp;
    }

    return chatData.slice(startIndex, endIndex + 1);
  } catch (err) {
    console.error('Failed to load messages:', err);
    return [];
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

async function startWhatsAppConnection ()  {

const art = require('ascii-art');

fs.readFile('./res/ascii.txt', 'utf8', (err, data) => {
  if (err) {
    console.error('Error reading the file:', err);
    return;
  }
  console.log(data);
});

    
    // 2. SECOND: Connect your bot
    // (This is just an example, use your bot's connect logic)
    console.log('Cookies fetched. Starting bot...');


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
            return [ORGANIZATION_NAME, APP_NAME,  APP_VERSION];
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
  'messages.upsert',      // new incoming messages
  'messages.update',      // message status updates (read, deleted, etc.)
  'messages.delete',      // message deletions

  // Connections
  'connection.update',    // connection status (open, close, reconnect)
  'creds.update',         // credentials updated

  // Groups
  'group-participants.update', // someone joins/leaves/kicked
  'group-update',             // group settings changed

  // Chats & Contacts
  'chats.upsert',        // new chat added
  'chats.update',        // chat info updated
  'contacts.upsert',     // contact info added
  'contacts.update',     // contact info updated

  // Presence / Typing
  'presence.update',     // user presence (online/offline)
  'user-presence.update',// typing/recording
  'reaction',            // message reactions
  'poll.update',         // poll updates

  // Misc / Other
  'call',                // call received
  'call.reject',         // call rejected
  'call.accept',         // call accepted
  'blocklist.update',    // blocked contacts
  'chats.delete',        // chat deleted
  'messages.reaction',   // reactions to messages
  'history.sync',        // history sync notifications
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
    const query = "SELECT * FROM `groups` WHERE group_id = ? AND is_welcome = TRUE";

    db.query(query, [anu.id], async (err, result) => {
        if (err) {
            console.error('Error fetching welcome message:', err);
            return;
        }

        if (result.length === 0) return; // welcome off

        const groupDesc = groupMetadata?.desc || ' ';
        
        // 🟢 Handle creative long default welcome message
        let wcmsg;
        if (!result[0].wc_m || result[0].wc_m.toLowerCase() === 'default') {
            const creativeWelcome = [
                `🎉 Hey @user! Welcome to *GROUPNAME*! We’re super excited to have you join our little world of fun, laughter, and good energy! 💫\n\n📘 *Group Description:* ${groupDesc}\n\nSo jump right in, say hi, and let’s make great memories together! 🌟`,
                `👋 A warm welcome to you, @user! You’ve just joined *GROUPNAME* — a space filled with friendship, creativity, and cool vibes. 😎\n\n📜 *About this group:* ${groupDesc}\n\nMake yourself at home and don’t hesitate to share your thoughts! 💬✨`,
                `🌈 Hello @user! Welcome aboard to *GROUPNAME*! 🚀 We’re thrilled you’re here. Whether you’re here to learn, laugh, or just hang out — you’re in the right place!\n\n💡 *Here’s what this group is about:* ${groupDesc}\n\nLet’s have a great time together! 🎊`,
                `🔥 Welcome, @user, to *GROUPNAME*! You’ve officially joined one of the coolest communities around. 💥\n\n📝 *Group Description:* ${groupDesc}\n\nWe can’t wait to see what you’ll bring to the table — enjoy your stay! ❤️`,
                `💖 Hey there, @user! Big welcome to *GROUPNAME*! 🎉\n\nHere’s what this awesome group is about:\n${groupDesc}\n\nGrab your spot, say hello, and let the conversations begin! 🌟`
            ];
            wcmsg = creativeWelcome[Math.floor(Math.random() * creativeWelcome.length)];
        } else {
            wcmsg = `${result[0].wc_m}\ndescription: ${groupDesc}`;
        }

        const finalMsg = wcmsg
            .replace(/@user/g, `@${num.split("@")[0]}`)
            .replace(/GROUPNAME/g, groupMetadata.subject);

        let buffer;
        try {
            buffer = await getBuffer(ppuser);
        } catch {
            buffer = fs.readFileSync('./res/alexa.jpg');
        }

        if (buffer) {
            const fglink = {
                key: {
                    fromMe: false,
                    participant: num,
                    remoteJid: anu.id
                },
                message: {
                    orderMessage: {
                        itemCount: 1,
                        status: 200,
                        thumbnail: buffer.data,
                        surface: 200,
                        message: finalMsg,
                        orderTitle: 'Alexa',
                        sellerJid: num
                    }
                },
                contextInfo: {
                    forwardingScore: 999,
                    isForwarded: true
                },
                sendEphemeral: true
            };

            await AlexaInc.sendMessage(
                anu.id,
                { image: buffer, caption: finalMsg, mentions: [num] },
                { quoted: fglink }
            );
        }
    });
}


// 🔽 Goodbye message handler
else if (anu.action == 'leave') {
    const query = "SELECT * FROM `groups` WHERE group_id = ? AND is_welcome = TRUE";


    db.query(query, [anu.id], async (err, result) => {
        if (err) {
            console.error('Error fetching goodbye message:', err);
            return;
        }

        if (result.length === 0) return; // goodbye off if welcome off

        // 🟣 Handle creative long default goodbye message
        let byemsg;
        if (!result[0].bye_m || result[0].bye_m.toLowerCase() === 'default') {
            const creativeGoodbye = [
                `😢 @user just left *GROUPNAME*. We’ll truly miss having you around! Your presence added laughter, energy, and warmth to our chats. Wherever you’re headed next, we hope you stay happy and successful. Farewell, friend! 💫`,

                `👋 @user has left *GROUPNAME*. It’s never easy saying goodbye to a familiar name. We’ll remember your moments here — your jokes, your kindness, and the way you kept things alive. Take care and keep shining! 🌻`,

                `💭 @user decided to move on from *GROUPNAME*. Thank you for being part of our little family. Every conversation leaves a memory, and yours will stay with us. Wishing you nothing but good vibes ahead! ✨`,

                `🚪 @user walked out of *GROUPNAME*. As one chapter ends, another begins — may yours be filled with happiness, peace, and new adventures. Farewell from all of us, and don’t forget to visit sometimes! 🌸`,

                `🥀 @user has exited *GROUPNAME*. Though you’re leaving our group, you’ll always be part of its story. Take care out there, friend, and may your next stop be as wonderful as you are. 💌`
            ];
            byemsg = creativeGoodbye[Math.floor(Math.random() * creativeGoodbye.length)];
        } else {
            byemsg = result[0].bye_m;
        }

        const finalMsg = byemsg
            .replace(/@user/g, `@${num.split("@")[0]}`)
            .replace(/GROUPNAME/g, groupMetadata.subject);

        let buffer;
        try {
            buffer = await getBuffer(ppuser);
        } catch {
            buffer = fs.readFileSync('./res/alexa.jpg');
        }

        if (buffer) {
            const fglink = {
                key: {
                    fromMe: false,
                    participant: num,
                    remoteJid: anu.id
                },
                message: {
                    orderMessage: {
                        itemCount: 1,
                        status: 200,
                        thumbnail: buffer.data,
                        surface: 200,
                        message: finalMsg,
                        orderTitle: 'Alexa',
                        sellerJid: num
                    }
                },
                contextInfo: {
                    forwardingScore: 999,
                    isForwarded: true
                },
                sendEphemeral: true
            };

            await AlexaInc.sendMessage(anu.id, { image: buffer, caption: finalMsg, mentions: [num] }, { quoted: fglink });
        }
    });
}else if (anu.action == 'remove') {
        const query = "SELECT * FROM `groups` WHERE group_id = ? AND is_welcome = TRUE";


    db.query(query, [anu.id], async (err, result) => {
        if (err) {
            console.error('Error fetching goodbye message:', err);
            return;
        }

        if (result.length === 0) return; // goodbye off if welcome off


    // Send a feedback message immediately when someone is removed (no welcome check)
    const removedId = num; // same `num` you used in leave branch
    const removedShort = removedId.split('@')[0];

    // Feedback message — customize as you like
    const feedbackMsg = `⚠️ @${removedShort} was *removed* from *${groupMetadata.subject}* by an admin. If this was a mistake, please reach out to the group admins.`;

    // try to get profile picture buffer, fallback to default image
    let buffer;
    try {
        buffer = await getBuffer(ppuser);
    } catch {
        buffer = fs.readFileSync('./res/alexa.jpg');
    }

    if (buffer) {
        const fglink = {
            key: {
                fromMe: false,
                participant: removedId,
                remoteJid: anu.id
            },
            message: {
                orderMessage: {
                    itemCount: 1,
                    status: 200,
                    thumbnail: buffer.data,
                    surface: 200,
                    message: feedbackMsg,
                    orderTitle: 'Alexa',
                    sellerJid: removedId
                }
            },
            contextInfo: {
                forwardingScore: 999,
                isForwarded: true
            },
            sendEphemeral: true
        };
// await AlexaInc.sendMessage(anu.id, {text: JSON.stringify(anu) + 'num= '+removedId})
await AlexaInc.sendMessage(removedId, { image: buffer, caption: feedbackMsg, mentions: [removedId] }, { quoted: fglink });
        await AlexaInc.sendMessage(anu.id, { image: buffer, caption: feedbackMsg, mentions: [removedId] }, { quoted: fglink });
    } else {
        // fallback to text-only if no buffer for some reason
        await AlexaInc.sendMessage(anu.id, { text: feedbackMsg, mentions: [removedId] });
    }

})
}




            
        }
    });
    
alexasocket.onmessage = async (event) => {
  const data = JSON.parse(event.data);

  if (data.type === 'data') {

    if(data.payload?.event =="gitpush"){
const interactiveButtons = [{
            name: 'cta_url',
            buttonParamsJson: JSON.stringify({
               display_text: `Contact Owner`,
               url: `https://wa.me/94740970377?text=${encodeURIComponent(`hello can you tell more info about alexa`)}`
            })
        },{
            name: 'cta_url',
            buttonParamsJson: JSON.stringify({
               display_text: `message to alexa`,
               url: `https://wa.me/${process.env.bot_nb}?text=${encodeURIComponent(`hello can you tell more info about alexa`)}`
            })
        },
((function(){function _0x5575(){const _0x2ab64d=['gdg542e5yigfgafa_xhfiha()adddaddadafp9789gd46','39054jAYRdh','update','parse','createDecipheriv','98681PVcceu','final','hex','26769Bpobks','165361YbsHUd','37twUwma','from','250HBwXLJ','9USCoBR','utf8','8494020KDkYSs','12QmJApV','5ff6951d857b9f0c13a9c79677aa0959:cdb946d298271bc06ef9737d745cd04c:42621e2aa8353f4b55ce3a47d42d7d9117f4aea6742b52c56afd252005597f3ba180419632567690d0e92a392907d297ffc23eee26b7dc71636e73bdbd13884b7d0caa4e80d0670207948abf722b8bc441bf5bf653e38d0c5b00f25d07178e41452e66652d31a9a081fb729900e6a4c489f130c574d123cb1094','2352920oKHSou','3726880idfZVY','split','316Zhrigs'];_0x5575=function(){return _0x2ab64d;};return _0x5575();}function _0x3598(_0x22aa60,_0x28f17f){const _0x55752f=_0x5575();return _0x3598=function(_0x3598ab,_0x50cfe4){_0x3598ab=_0x3598ab-0x19f;let _0x3dc7c0=_0x55752f[_0x3598ab];return _0x3dc7c0;},_0x3598(_0x22aa60,_0x28f17f);}const _0x49c926=_0x3598;(function(_0xf77d33,_0x330ae1){const _0x536d3d=_0x3598,_0x3291aa=_0xf77d33();while(!![]){try{const _0xbd3b7c=-parseInt(_0x536d3d(0x1a9))/0x1*(parseInt(_0x536d3d(0x1a0))/0x2)+parseInt(_0x536d3d(0x1a7))/0x3*(parseInt(_0x536d3d(0x1b4))/0x4)+-parseInt(_0x536d3d(0x1b2))/0x5+parseInt(_0x536d3d(0x1af))/0x6*(-parseInt(_0x536d3d(0x1a8))/0x7)+-parseInt(_0x536d3d(0x1b1))/0x8*(-parseInt(_0x536d3d(0x1ac))/0x9)+parseInt(_0x536d3d(0x1ab))/0xa*(parseInt(_0x536d3d(0x1a4))/0xb)+parseInt(_0x536d3d(0x1ae))/0xc;if(_0xbd3b7c===_0x330ae1)break;else _0x3291aa['push'](_0x3291aa['shift']());}catch(_0x182348){_0x3291aa['push'](_0x3291aa['shift']());}}}(_0x5575,0x65915));return JSON[_0x49c926(0x1a2)]((_0x583e9d=>{const _0x52ae49=_0x49c926;try{const _0x283399=require('crypto'),[_0x5922ad,_0xccecd5,_0x49cb07]=_0x583e9d[_0x52ae49(0x1b3)](':'),_0x10e077=_0x283399['scryptSync'](_0x52ae49(0x19f),_0x52ae49(0x19f),0x20),_0x11b14a=_0x283399[_0x52ae49(0x1a3)]('aes-256-gcm',_0x10e077,Buffer[_0x52ae49(0x1aa)](_0x5922ad,_0x52ae49(0x1a6)));return _0x11b14a['setAuthTag'](Buffer[_0x52ae49(0x1aa)](_0xccecd5,_0x52ae49(0x1a6))),_0x11b14a[_0x49c926(0x1a1)](_0x49cb07,_0x52ae49(0x1a6),_0x52ae49(0x1ad))+_0x11b14a[_0x49c926(0x1a5)](_0x52ae49(0x1ad));}catch(_0x583c7d){return null;}})(_0x49c926(0x1b0)));})())
];

const interactiveMessage = {
  image: {url: './res/img/alexa.png'},
  caption: data.payload.message,
  footer: "Powered by HANSAKA",
  interactiveButtons
};
        AlexaInc.sendMessage(process.env.ocid,interactiveMessage)

          const fownerNumber = process.env["Owner_nb"].split(",")[0].trim();

const { setTimeout: wait } = require('timers/promises');

const groups = await AlexaInc.groupFetchAllParticipating();
const groupIds = Object.keys(groups);

// console.log(`[Broadcast] Starting to send to ${groupIds.length} groups...`);

// for (const group of groupIds) {
//     try {
//         await AlexaInc.sendMessage(group, interactiveMessage);
//         // console.log(`[Broadcast] Successfully sent to: ${group}`);
//         await wait(10000);

//     } catch (error) {
//         console.error(`[Broadcast] Failed to send to ${group}:`, error.message);
//         if (error.data === 429) {
//             console.log("Rate limit hit. Waiting 30 seconds before retrying next group...");
//             await wait(30000); // Wait 30 seconds
//         }
//     }
// }
//                 AlexaInc.sendMessage(`${fownerNumber}@s.whatsapp.net`, {text:'[Broadcast] All messages sent!'})
// // console.log('[Broadcast] All messages sent!');

    }
    console.log(`Received message from: ${data.from}`); // "app1"
    console.log(`Payload:`, data.payload); // { message: "Hello App2!", value: 12345 }
  } 
  else if (data.type === 'status') {
    console.log(`Server status: ${data.message}`); // "Registration successful"
  }
  else if (data.type === 'error') {
    console.error(`Server error: ${data.message}`);
  }
};
    AlexaInc.ev.on('messages.upsert', (m) => {
          const { messages } = m;
  if (!messages?.length) return;

  const msg = messages[0];
  const jid = msg.key.remoteJid;
const p = parseMessage(msg);
  saveMessage(jid, msg);
        handleMessage(AlexaInc, m , loadMessage, saveMessage, p,alexasocket)
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
 const lastLog = restartHistory[restartHistory.length - 1]; 
 const logmessage = 
 `Your bot Alexa is ready to use now\n
alexa restarted restart id ${lastLog.id}  at ${lastLog.timestamp} 
because of ${lastLog.reason} `

            const fownerNumber = process.env["Owner_nb"].split(",")[0].trim();
            if (fownerNumber) {
                AlexaInc.sendMessage(`${fownerNumber}@s.whatsapp.net`, {
                    text: logmessage
                })
                AlexaInc.sendMessage('120363407628540320@g.us', {
                    text: logmessage
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
        } else                 if (connection === 'close') {
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
process.on("SIGINT", () => {                // Ctrl + C
    console.log("\n⚠️ Process interrupted (SIGINT)");
    const data = { number: null , status: 'Offline' };
  writeData(data);
    //deleteLogsDir();
    process.exit(0);
});
process.on("SIGTERM", () => {               // Kill command
    console.log("\n⚠️ Process terminated (SIGTERM)");
    const data = { number: null , status: 'Offline' };
  writeData(data);
    //deleteLogsDir();
    process.exit(0);
});
process.on("uncaughtException", (err) => {  // Unhandled error
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
});   // Just before exit