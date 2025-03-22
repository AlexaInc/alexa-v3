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
                ppuser = 'https://raw.githubusercontent.com/hansaka02/alexa-v3/refs/heads/main/res/img/alexa.jpeg'; // Fallback if no profile picture
            }
    
            // Fetch group profile picture
            try {
                ppgroup = await AlexaInc.profilePictureUrl(anu.id, 'image');
            } catch {
                ppgroup = 'https://raw.githubusercontent.com/hansaka02/alexa-v3/refs/heads/main/res/img/alexa.jpeg'; // Fallback if no group picture
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
                        buffer = null;
                    }
    
                    // Prepare the message to send
                    if (buffer && isWelcome) {
                        const fglink = {
                            key: {
                                fromMe: false,
                                "participant": "0@s.whatsapp.net",
                                "remoteJid": anu.id
                            },
                            message: {
                                orderMessage: {
                                    itemCount: 9999999,
                                    status: 200,
                                    thumbnail: buffer.data,
                                    surface: 200,
                                    message: wcmsg,  // Use the welcome message
                                    orderTitle: 'alexaaa',
                                    sellerJid: '0@s.whatsapp.net'
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
                        await AlexaInc.sendMessage(anu.id, { image: {url:'./res/img/alexa.jpeg'}, caption:he }, { quoted: fglink });
                    }
                });
            }
        }
    });
    

    AlexaInc.ev.on('messages.upsert', (m) => {


    handleMessage(AlexaInc, m)
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
            

            const ownerNumber = process.env["Owner_nb"];
            if (ownerNumber) {
                AlexaInc.sendMessage(`${ownerNumber}@s.whatsapp.net`, {
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
