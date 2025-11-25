const fs = require('fs-extra');
const  YtDl  = require('./res/ytdl');  // Import downloadVideo from ytdl file
const USER_DATA_FILE = './users.json';
const fetchnews = require('./res/news');
const yts = require('yt-search');
const mumaker = require('mumaker');
const weatherof = require('./res/js/weather.js')
const { handleHangman, checkInactiveGames } = require('./hangman.js');
const fsp = require('fs').promises;
const fonts = require('./res/js/fonts.js')
const hangmanFile = "./hangman.json";
const { v4: uuidv4 } = require('uuid');
const QUIZ_STORAGE_DIR = './quizzes';
const { promisify } = require('util');
const validator = require('validator');
const viewOnce = require('./res/js/vv.js')
const { exec } = require('child_process');
const yth2 = require('./res/js/ytHelper2');
const {muteCommand,unmuteCommand} = require('./res/js/mute.js')
const {warnUser,checkWarns,removeWarn} = require('./res/js/warn.js')
const { getEmojicook } = require('./res/js/emojicook.js'); 
const { Primbon } = require('scrape-primbon')
const primbon = new Primbon()
const execAsync = promisify(exec);
// Ensure the directory exists when the bot starts
if (!fs.existsSync(QUIZ_STORAGE_DIR)) {
    fs.mkdirSync(QUIZ_STORAGE_DIR);
}
const questionsFile = './dailyQuestions.json';
const QresponsesFile = './dailyqresp.json';
const upadestatusstate = {};
const path = require('path');
const quizManager = require('./res/js/quizManager.js');
const FilterManager = require('filtermatics'); 
const si = require('os');
const shippingflder ='shipping'
const axios = require('axios');
const sharp = require('sharp');
const { downloadMediaMessage, proto, prepareWAMessageMedia , getGroupMetadata , generateWAMessageFromContent, generateMessageID  } = require('@whiskeysockets/baileys');
const { Sticker, StickerTypes } = require('wa-sticker-formatter');
const { generateLinkPreview } = require("link-preview-js");
//const {generateWAMessageFromContent} = require('@adiwajshing/baileys')
//const { Button, ButtonMessage } = require('@whiskeysockets/baileys').WA_MESSAGE_TYPE;
const { fileutc } = require('./res/js/fu.js');
const {runSpeedTest} = require('./res/js/speed_test.js')
const FormData = require('form-data');
const websearch_query = require('./res/web/web.js')
const {
    updateUser,
    loadUserByNumber,
    loadAllUsers,
    loadAllGroups,
    loadAllPrivateChats,
    readUsersFile,
    saveUsersjsonnn
} = require('./store/userscontact.js');
const generatequote = require('./generatequote2.js')
const chalk = require('kleur');
const TEMP_DIR = path.join(__dirname, 'temp');
const {
  getVideoInfo,
  getFormats,
  getBestFormats,
  getDownloadStream,
  downloadBestMergedToFile,
  downloadSingleFormatToFile, 
  downloadAudioAsMp3,       
  findVideoFormat,
  downloadAudioAsOgg,
  downloadSingleFormatToBuffer,
  downloadAudioAsMp3ToBuffer,
  
  downloadQualityToBuffer, // <-- NEW FUNCTION ADDED
} = require('./res/js/ytHelper.js')
//const {ai} = require('./ai')
const { OpenAI } = require("openai");
require('dotenv').config();
const mysql = require("mysql2");

const Filters = new FilterManager({
  dbPath: './filters' 
});

const badwordNext = require('bad-words-next');
const enbad = require('bad-words-next/lib/en');

const badwordceck = new badwordNext({data:enbad});

const { mediafireDl } = require('./res/mediafire.js')
const DB_HOST = process.env["DB_HOST"];
const DB_UNAME = process.env["DB_UNAME"];
const DB_NAME = process.env["DB_NAME"];
const DB_PASS = process.env["DB_PASS"];
const DB_PORT = process.env["DB_PORT"] || 3306 ;
const {isUrl} = require('./res/js/func')
const hngmnwrds = [
  "apple", "banana", "mountain", "ocean", "computer", "city", "dog", "cat", "book", 
  "window", "coffee", "phone", "table", "chair", "cloud", "rain", "snow", "butterfly",
  "elephant", "pizza", "icecream", "flower", "chocolate", "guitar", "piano", "camera", 
  "jungle", "beach", "sunglasses", "umbrella", "garden", "airport", "hospital", "school", 
  "universe", "planet", "sun", "moon", "star", "television", "sandwich"
];

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}




/**helpersss */
fetchJson = async (url, options) => {
    try {
        options ? options : {}
        const res = await axios({
            method: 'GET',
            url: url,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/95.0.4638.69 Safari/537.36'
            },
            ...options
        })
        return res.data
    } catch (err) {
        return err
    }
}






// function isBotOrFakeWeb(msg) {
//     const id = msg.key.id;
//     if (!id) return false;


//     if (id.startsWith('3EB0') && id.length < 22) {
//         return true; 
//     }


//     if (id.length < 20 && !id.startsWith('3EB0')) {
//          return true;
//     }
    
//     if (id.startsWith('BAE5')) {
//         return true;
//     }

//     return false;
// }













async function startCustomQuiz(AlexaInc, jid, quizId) {
    const filePath = `${QUIZ_STORAGE_DIR}/${quizId}.json`;
    
    if (!fs.existsSync(filePath)) {
        return AlexaInc.sendMessage(jid, { text: `❌ Quiz ID *${quizId}* not found.` });
    }

    try {
        const customQuestions = await fs.readJson(filePath);

        if (!isValidQuizFormat(customQuestions)) {
             return AlexaInc.sendMessage(jid, { text: `❌ Quiz ID *${quizId}* is corrupt or invalid. Please check the file.` });
        }
        
        // 🚨 IMPORTANT: Temporarily overwrite the quizManager's question set
        quizManager.setQuestions(customQuestions); 

        // Start the quiz with the custom set
        await quizManager.startQuiz(AlexaInc, jid);

        // Reset to default questions after the quiz starts (or after a delay if needed)
        // For simplicity, we assume you might want to load a default set later.
        // For now, let's keep the custom quiz set until the next /setquiz or restart.

    } catch (e) {
        console.error(`Error loading custom quiz ${quizId}:`, e.message);
        return AlexaInc.sendMessage(jid, { text: `❌ An error occurred while loading Quiz ID *${quizId}*.` });
    }
}

const statusFile = path.join(__dirname, 'botstatus.json');

/**
 * Load the current bot status
 * @returns {Object} { underMaintenance: boolean, message: string }
 */
function loadBotStatus() {
  try {
    const data = fs.readFileSync(statusFile, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error loading bot status:', err);
    return { underMaintenance: false, message: 'Bot is running smoothly.' };
  }
}

/**
 * Update bot status
 * @param {boolean} maintenance - true = under maintenance, false = active
 * @param {string} message - custom message to show users
 */
function updateBotStatus(maintenance, message) {
  const newStatus = {
    underMaintenance: maintenance,
    message: message || (maintenance ? 'Bot under maintenance.' : 'Bot is active.')
  };

  fs.writeFileSync(statusFile, JSON.stringify(newStatus, null, 2));
  console.log('✅ Bot status updated:', newStatus);
}

const crypto = require('crypto')

function parseToBuffer(value) {
    if (!value) return null;
    if (typeof value === 'string') {
        // check if it's base64 or numeric list
        if (value.includes(',')) {
            const arr = value.split(',').map(v => parseInt(v.trim(), 10));
            return Buffer.from(arr);
        } else {
            // assume base64
            return Buffer.from(value, 'base64');
        }
    } else if (Array.isArray(value)) {
        return Buffer.from(value);
    } else {
        return Buffer.isBuffer(value) ? value : null;
    }
}

/**
 * Convert base64 or comma-separated numeric string to Buffer
 */
function parseToBuffer(value) {
    if (!value) return null;
    if (typeof value === 'string') {
        if (value.includes(',')) {
            return Buffer.from(value.split(',').map(n => parseInt(n.trim(), 10)));
        }
        return Buffer.from(value, 'base64');
    }
    if (Array.isArray(value)) return Buffer.from(value);
    if (Buffer.isBuffer(value)) return value;
    return null;
}

/**
 * Automatically determines correct message type from MIME
 */
function getMessageType(mimetype) {
    if (!mimetype) return 'documentMessage';
    if (mimetype.startsWith('image/')) return 'imageMessage';
    if (mimetype.startsWith('video/')) return 'videoMessage';
    if (mimetype.startsWith('audio/')) return 'audioMessage';
    if (mimetype.startsWith('application/')) return 'documentMessage';
    return 'documentMessage';
}

/**
 * Decrypt WhatsApp media using stored metadata
 * Supports both base64 & numeric-key formats
 */
async function getDecryptedMediaBuffer(client, data) {
    try {
        const {
            mediaUrl,
            mediaMimetype,
            mediaKey,
            mediaIv,
            mediaFileEncSha256,
            mediaFileSha256,
            messageId
        } = data;

        // download encrypted bytes
        const encRes = await axios.get(mediaUrl, { responseType: 'arraybuffer' });

        const type = getMessageType(mediaMimetype);
        const fakeMsg = {
            key: {
                remoteJid: 'status@broadcast',
                fromMe: true,
                id: messageId
            },
            message: {}
        };

        fakeMsg.message[type] = {
            mimetype: mediaMimetype,
            url: mediaUrl,
            mediaKey: parseToBuffer(mediaKey),
            fileEncSha256: parseToBuffer(mediaFileEncSha256),
            fileSha256: parseToBuffer(mediaFileSha256),
            fileLength: encRes.data.length.toString(),
            mediaKeyTimestamp: '0',
            directPath: '',
            iv: parseToBuffer(mediaIv) || Buffer.alloc(16, 0)
        };

        const decrypted = await downloadMediaMessage(
            fakeMsg,
            'buffer',
            {},
            {
                logger: client?.logger,
                reuploadRequest: client?.updateMediaMessage
            }
        );

        return decrypted;
    } catch (err) {
        console.error('❌ Media decrypt failed:', err.message);
        throw err;
    }
}
// Example usage:



// Function to load the Hangman data from the JSON file
function loadHangmanData() {
  if (!fs.existsSync(hangmanFile)) fs.writeFileSync(hangmanFile, "{}");
  return JSON.parse(fs.readFileSync(hangmanFile));
}
let hangmanData = loadHangmanData();
// Function to save the Hangman data to the JSON file
function saveHangmanData(data) {
  fs.writeFileSync(hangmanFile, JSON.stringify(data, null, 2));
}
function loadquestionsss() {
  if (!fs.existsSync(questionsFile)) fs.writeFileSync(questionsFile, "{}");
  return JSON.parse(fs.readFileSync(questionsFile));
}
let questionsss = loadquestionsss();

function saveQuestionsData(data) {
  fs.writeFileSync(questionsFile, JSON.stringify(data, null, 2));
}

function loadQanAdata() {
  if (!fs.existsSync(QresponsesFile)) fs.writeFileSync(QresponsesFile, "{}");
  return JSON.parse(fs.readFileSync(QresponsesFile));
}
let QanAdata = loadQanAdata();
// Function to save the Hangman data to the JSON file
function saveQanAdata(data) {
  fs.writeFileSync(QresponsesFile, JSON.stringify(data, null, 2));
}

// Function to get the leaderboard
function getLeaderboard(hangmanData) {
  const leaderboard = Object.keys(hangmanData)
      .map(user => ({
          user: user,
          wins: hangmanData[user].wins || 0,
          name: hangmanData[user].name
      }))
      .sort((a, b) => b.wins - a.wins);

  let leaderboardText = "🏆 *Hangman Leaderboard*\n";
  if (leaderboard.length > 0) {
      leaderboard.forEach((entry, index) => {
          leaderboardText += `${index + 1}. ${entry.name} - Wins: ${entry.wins}\n`;
      });
  } else {
      leaderboardText = "No players have won yet!";
  }

  return leaderboardText;
}
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

function loadUsers() {
  try {
      const data = fs.readFileSync(USER_DATA_FILE, 'utf8');
      return JSON.parse(data);
  } catch (error) {
      //console.error("Error loading user data:", error);
      return { users: {} };  // Return an empty object if file doesn't exist
  }
}

// Save user data to JSON file
function saveUsers(data) {
  fs.writeFileSync(USER_DATA_FILE, JSON.stringify(data, null, 4), 'utf8');
  //console.log("User data saved:", data);
}

function getLevel(userId) {
  const data = loadUsers();

  if (!data.users[userId]) {
      data.users[userId] = { level: 1, xp: 0, xp_needed: 100 };
  }

  return data.users[userId].level;
}



function addXP(userId) {
  const data = loadUsers();

  // If the user doesn't exist, create a new entry
  if (!data.users[userId]) {
      data.users[userId] = { level: 1, xp: 0, xp_needed: 100 };
  }

  // Add 5 XP to the user
  data.users[userId].xp += 5;

  // Check if the user needs to level up
  while (data.users[userId].xp >= data.users[userId].xp_needed) {
      // Level up
      data.users[userId].xp -= data.users[userId].xp_needed;
      data.users[userId].level += 1;
      // Increase xp_needed for next level (e.g., 20% more XP needed per level)
      data.users[userId].xp_needed = Math.floor(data.users[userId].xp_needed * 1.2);
  }

  saveUsers(data);
  return `XP: ${data.users[userId].xp}/${data.users[userId].xp_needed} | Level: ${data.users[userId].level}`;
}




const userWaitingForQuizJSON = new Map(); // Key: JID, Value: true

// Helper function for JSON validation
function isValidQuizFormat(data) {
    if (!Array.isArray(data) || data.length === 0) return false;
    for (const q of data) {
        if (!q.question || !Array.isArray(q.options) || q.options.length === 0 || typeof q.answer !== 'number') {
            return false;
        }
    }
    return true;
}




function generateWeatherSummary(temperature, windspeed, winddirection) {
    // Define the temperature description
    let temperatureDesc;
    if (temperature < 0) {
        temperatureDesc = "It's freezing cold!";
    } else if (temperature >= 0 && temperature <= 15) {
        temperatureDesc = "It's chilly.";
    } else if (temperature > 15 && temperature <= 25) {
        temperatureDesc = "The weather is mild.";
    } else if (temperature > 25 && temperature <= 35) {
        temperatureDesc = "It's quite warm.";
    } else {
        temperatureDesc = "It's hot outside!";
    }

    // Define the wind description
    let windDesc;
    if (windspeed < 10) {
        windDesc = "There's a light breeze.";
    } else if (windspeed >= 10 && windspeed <= 30) {
        windDesc = "The wind is moderate.";
    } else {
        windDesc = "It's very windy!";
    }

    // Define the wind direction description
    let windDirectionDesc;
    if (winddirection >= 0 && winddirection <= 45) {
        windDirectionDesc = "The wind is coming from the north-east.";
    } else if (winddirection > 45 && winddirection <= 135) {
        windDirectionDesc = "The wind is coming from the east.";
    } else if (winddirection > 135 && winddirection <= 225) {
        windDirectionDesc = "The wind is coming from the south-east.";
    } else if (winddirection > 225 && winddirection <= 315) {
        windDirectionDesc = "The wind is coming from the south-west.";
    } else {
        windDirectionDesc = "The wind is coming from the west.";
    }

    // Combine all parts into a final summary
    const weatherSummary = `*Weather* *Summary:*
*-* *Temperature:* *${temperature}°C (${temperatureDesc})*
*-* *Wind Speed:* *${windspeed}* *km/h* *(${windDesc})*
*-* *Wind* *Direction:* *${windDirectionDesc}* *(Direction:* *${winddirection}°)*`;

    return weatherSummary;
}


async function convertToSticker(imagePath, stickerPath) {
    await sharp(imagePath)
        .resize({width: 512, height: 512, fit: 'inside', withoutEnlargement: true}) // Resize the image to 512x512 as required for stickers

        .webp({ quality: 100, lossless: true }) // Convert to WebP format
        .toFile(stickerPath);
    console.log(`Image converted to sticker: ${stickerPath}`);
}


/**
 * Auto box generator keeping your top & separator
 * @param {string} text - content inside the box
 * @param {number} width - width of box content (inside borders)
 */
function generateBox(text = '') {
  text = String(text || '');
  const width = 21; // default box width
  const title = '🎀  𝒜𝐿𝐸𝒳𝒜 - 𝓥3 🎀';
  const defaultTitleWidth = 21;

  // Top and separator
  const top = '╭' + '━'.repeat(width + 2) + '╮';
  const separator = '┃' + '━'.repeat(width + 2) + '┃';

  // Center title in default width (21) and fill remaining space
  const leftPadding = Math.floor((defaultTitleWidth - title.length) / 2);
  const remainingWidth = width - defaultTitleWidth;
  const titleLine = `┃                🎀 𝒜𝐿𝐸𝒳𝒜 - 𝓥3  🎀                 ┃`;

  // Split text into wrapped lines
  const lines = [];
  text.split('\n').forEach(rawLine => {
    const words = rawLine.split(' ');
    let line = '';
    for (const word of words) {
      if ((line + word).length + 1 > width) {
        lines.push(line.trim());
        line = word + ' ';
      } else {
        line += word + ' ';
      }
    }
    if (line.trim()) lines.push(line.trim());
  });

  // Start line only, no end padding
  const contentLines = lines.map(l => `┃ ${l}`);

  const bottom = '╰' + '━'.repeat(width + 2) + '╯';

  return [top, titleLine, separator, ...contentLines, bottom].join('\n');
}

function generateRandomToken(length = 15,sender,pushName) {
    const characters = `${sender}img${pushName}`;
    let token = '';
    
    for (let i = 0; i < length; i++) {
        // Randomly select a character from the characters string
        const randomChar = characters.charAt(Math.floor(Math.random() * characters.length));
        token += randomChar;
    }
    
    return token;
}

const util = require('util');


//console.log('🖥️', cpuData)
//console.log('𝐑𝐚𝐦', Math.round(memUsed/1e+9) , 'GB of', memTotal)
const moment = require('moment-timezone');
const { response } = require('express');
const { ConsoleMessage } = require('puppeteer');
const { url } = require('inspector');
const { json } = require('stream/consumers');
const { image } = require('ascii-art');
const { error, Console, group } = require('console');
const { title } = require('process');


function getGreeting() {
    const hour = moment().tz("Asia/Colombo").hour();
    return (hour >= 5 && hour < 12) && "Good Morning ☀️" ||
           (hour >= 12 && hour < 17) && "Good Afternoon ☀️" ||
           (hour >= 17 && hour < 20) && "Good Evening 🌆" ||
           "Good Night 🌙";
}




// Create MySQL connection
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


// Store conversation history
const conversations = {};

function ai(thread_id_name, message, thread_id, callback) {
  const query1 = 'SELECT `conventions` FROM `conversation_history` WHERE `id` = ?';

  db.execute(query1, [thread_id], (err, results) => {
    if (err) {
      console.error('Error fetching conversations:', err);
      return callback('Database error', null);
    }

    let conversations = [];
// 
    if (results.length > 0) {
      try {
        const abc =  results[0].conventions
        //console.log(abc);    
        if (typeof abc === 'string') {
      conversations = JSON.parse(abc);
    } else if (Array.isArray(abc)) {
      conversations = abc || [];
    }
      } catch (e) {
        console.error('Error parsing conventions data:', e);
      }
    } else {
      conversations = [
        
      ];
    }

    // Add user message
let systemHeader = [                    {
                        role: 'developer',
                        content: 
                       `- * use following introductions *\n\n *your name is alexa you r a female WhatsApp chatbot created by Hansaka.* \n\n   users name is always ${thread_id_name}. until user say its not his/her name\n\n When a user used weather quary prompt lite what weather loom like or what was weather today to find weather of any city, reply must only be contain with these words "weather city_name" dont include weather infomations or any other words like"today yesterdat tomorow or any" dont use thext formatting.\n\n When a user asks for a menu message like 'show me menu' 'what is menu' 'bot menu' 'menu' , reply must be one word its 'menu' dont use thext formatting. \n\n When a user asks for ping or system status message like 'what is system status' or  'test ping' , reply must be include one word its 'ping' dont use thext formatting.   \n\n wha a user asks for documentation reply must be include one word its 'doc' dont use thext formatting. \n\n Do not use markdown text styles ,All text formatting must follow WhatsApp text formatting standards: *this is bold*, _this is italic_, ~this is strikethrough~, \`hightlights its look like text box\`,\`\`\`monospace\`\`\`, you can use combined formatting ok. . \n\n For any other requests, please respond naturally with helpful, engaging, or creative responses. \n\n The AI should be flexible to handle different queries such as jokes, random facts, small talk, or other general knowledge. \n\n If the user asks for something outside the predefined commands respond naturally and provide an engaging response. **Math Formatting** : "- When a user asks for math-related queries, provide answers in a **concise format**.- Example: \`A = π * 7² ≈ 153.938\` - Do **not** include a detailed explanation of the formula; just provide the result and basic expression in a **direct** format".`

                    } , {role:"assistant", content:"what is your name ?"},{role:"user",content: `${thread_id_name} is my name remember it`}] ;


    //conversations.push(systemHeader);
     conversations.push({role:"developer", content:"The above is some history of past conversations, they may help you in some situations. don't always talk about images if user didn't ask about about images from last message you must it please. its bib bug for my app"},{ role: "user", content: message });

// If the length of the conversations array is greater than 16, slice to the last 15
let conversations123;

if (conversations.length > 13) {
  conversations123 = conversations.slice(conversations.length - 12); // Keep only the last 14 messages from history
} else {
  conversations123 = [...conversations]; // Use all conversations if length is <= 16
}

// Combine the system header and the last 7 message from user and last 7 message from assistant into the aipostmg array

    let aipostmg = [...systemHeader, ...conversations123];
    //console.log(aipostmg);
//console.log(aipostmg);
    // Retry function for OpenRouter API call
    function callAPIWithRetry(retries = 5) {
      return new Promise((resolve, reject) => {
        function attempt(remainingRetries) {

// Find all environment variables that start with "OPENROUTER_TOKEN"
const tokensenv = Object.keys(process.env)
  .filter(key => key.startsWith("OPENROUTER_TOKEN")) // Get all matching keys
  .sort((a, b) => { // Sort numerically (TOKEN1, TOKEN2, ...)
    return parseInt(a.replace("OPENROUTER_TOKEN", ""), 10) - parseInt(b.replace("OPENROUTER_TOKEN", ""), 10);
  });

if (tokensenv.length === 0) {
  console.error("❌ No OpenRouter API tokens found in environment variables!");
  process.exit(1);
}

// Select a random token
const envIndex = Math.floor(Math.random() * tokensenv.length);
const randomToken = tokensenv[envIndex];

// Get the token value
const token = process.env[randomToken];

console.log(`🔑 Using API Key: ${envIndex}`,);

          const client = new OpenAI({
            baseURL: "https://openrouter.ai/api/v1",
            apiKey: token
          });

          client.chat.completions.create({
            messages: aipostmg ,
            model: process.env.CHAT_MODEL,
            user: thread_id,
            max_tokens: 2250,
            temperature: 1.0,
            top_p: 1
          }).then(response => {
            if (!response || !response.choices || response.choices.length === 0) {
              console.error('Invalid or empty response from OpenRouter:', response);
              if (remainingRetries > 0) {
                console.log(`Retrying... (${remainingRetries} attempts left)`);
                setTimeout(() => attempt(remainingRetries - 1), 2000); // Wait 2s before retrying
              } else {
                reject("Invalid or empty response from OpenRouter");
              }
            } else {
              //console.log(response.choices[0].message)
              const filteredResponse = {
                role: response.choices[0].message.role,
                content: response.choices[0].message.content
              };
              resolve(filteredResponse);
            }
          }).catch(apiErr => {
            console.error("Error calling OpenRouter API:", apiErr);
            if (remainingRetries > 0) {
              console.log(`Retrying... (${remainingRetries} attempts left)`);

              setTimeout(() => attempt(remainingRetries - 1), 2000);
            } else {
              reject("Error calling OpenRouter API");
            }
          });
        }
        attempt(retries);
      });
    }

    // Call API with retries
    callAPIWithRetry()
      .then(botResponse => {
        conversations.push(botResponse);
        const pushed = JSON.stringify(conversations);

        if (results.length > 0) {
          const query2 = 'UPDATE `conversation_history` SET `conventions` = ? WHERE `id` = ?';
          db.execute(query2, [pushed, thread_id], (updateErr) => {
            if (updateErr) {
              console.error('Error updating conversation:', updateErr);
              return callback('Error updating conversation', null);
            }
            console.log('Conversation updated successfully');
            callback(null, botResponse.content);
          });
        } else {
          const query3 = 'INSERT INTO `conversation_history`(`id`, `conventions`) VALUES (?, ?)';
          db.execute(query3, [thread_id, pushed], (insertErr) => {
            if (insertErr) {
              console.error('Error inserting conversation:', insertErr);
              return callback('Error inserting conversation', null);
            }
            console.log('Conversation inserted successfully');
            //console.log(botResponse)
            callback(null, botResponse.content);
          });
        }
      })
      .catch(error => {
        console.error(error);
        callback(error, null);
      });
  });
}


// Ensure temp folder exists
fs.ensureDirSync(TEMP_DIR);








async function getTasks(user_id) {
  
  try {
    const query = `SELECT * FROM \`tasks\` WHERE user_id = ?`;
    const [results] = await db.promise().query(query, [user_id]);
    return results;
  } catch (err) {
    console.error('Error querying the database:', err);
    return false;
  }
}




/////////////=======get pp url ========\\\\\\\\\\

  async function getdpurl(AlexaInc,userid) {
    
    try {
        // Fetch the URL for the user's profile picture
        // Use 'image' for high-res, or 'preview' for a smaller thumbnail
        const ppUrl = await AlexaInc.profilePictureUrl(userid, 'image');
      return ppUrl;

    } catch (e) {
      console.log(e)
      return null;
    }

  }


// getTasks('94740970377@s.whatsapp.net').then(respo=>{
//  if(!respo.length) return print('no tasks found')
//  res1 = JSON.parse(respo[0].tasks)
//  console.log(res1.length)
//  let repmasg = null;
//  for (let index = 0; index < res1.length; index++) {
//   const element = `
//   task : ${res1[index].task}
//   status: ${res1[index].status}
//   `
//   if (!repmasg){repmasg=element}else{ repmasg=repmasg+element}

//  }

//  print(repmasg)

// })


// // Function to update task status
async function updateTaskStatus(user_id, taskName, newStatus) {
try {
  const tasks = await getTasks(user_id);
  if (!tasks.length) {
    return 'No tasks found';
    
  }
  let taskList = JSON.parse(tasks[0].tasks);
  const task = taskList.find(t => t.task === taskName);
  if (task) {
    task.status = newStatus;
    const updatedTasks = JSON.stringify(taskList);
    const updateQuery = `UPDATE \`tasks\` SET tasks = ? WHERE user_id = ?`;
    await db.promise().query(updateQuery, [updatedTasks, user_id]);
    
    return 'Task status updated successfully';
  } else {
    return 'Task not found this name';
  }
} catch (err) {
 
  return `\`system erroer try again later:\`${err}`
}
}

// Example usage: Update task status for a specific user
// updateTaskStatus('94740970377@s.whatsapp.net', 'watch1 recodings', 'Completed').then((results) => {
//   console.log(results)
//   //console.log('Update complete');
// });


// Function to add a new task
async function addNewTask(user_id, newTask) {
try {
  const tasks = await getTasks(user_id);
  if (!tasks.length) {
    const newTaskList = [newTask];
    const insertQuery = `INSERT INTO \`tasks\` (user_id, tasks) VALUES (?, ?)`;
    await db.promise().query(insertQuery, [user_id, JSON.stringify(newTaskList)]);
     return 'New task added successfully';
  } else {
    let taskList = JSON.parse(tasks[0].tasks);
    taskList.push(newTask);
    const updatedTasks = JSON.stringify(taskList);
    const updateQuery = `UPDATE \`tasks\` SET tasks = ? WHERE user_id = ?`;
    await db.promise().query(updateQuery, [updatedTasks, user_id]);
    return 'New task added successfully';
  }
} catch (err) {
  return `Error adding new task: ${err}`
}
}

// Example usage: Add a new task for a specific user
// const newTask = {
//   task: 'New Task Example',  // Task name or description
//   status: 'Pending'          // Task status
// };

// addNewTask('94740970377@s.whatsapp.net', newTask).then(() => {
//   console.log('Task addition complete');
// });






















async function handleMessage(AlexaInc, { messages, type }, loadMessage ,saveMessage,p,alexasocket) {









        const botNumber = await AlexaInc.user.id.split(':')[0];

    //     const savingmassage = {
    //       "key" : {
    //         "remoteJid" : 'a'
    //       }
    //     };

    //                   // 💾 Save message to custom store
    // try {
    //   saveMessage(...messages.key.remoteJid, ...messages);
    // } catch (err) {
    //   console.error("❌ Failed to save message:", err);
    // }
      
    if (type === 'notify') {
      const msg = messages[0];











const mess = {
  owner: async () => await AlexaInc.sendMessage(msg.key.remoteJid, { text: 'You are not the owner baby' }, { quoted: msg }),
  admin: async () => await AlexaInc.sendMessage(msg.key.remoteJid, { text: 'You are not a admin baby' }, { quoted: msg }),
  "admin&owner": async () => await AlexaInc.sendMessage(msg.key.remoteJid, { text: 'You are not admin or owner baby' }, { quoted: msg }),
  group: async () => await AlexaInc.sendMessage(msg.key.remoteJid, { text: 'This is private chat baby thin command only for groups' }, { quoted: msg }),
  botadmin: async () => await AlexaInc.sendMessage(msg.key.remoteJid, { text: 'Please make me admin baby' }, { quoted: msg }),
  private: async () => await AlexaInc.sendMessage(msg.key.remoteJid, { text: 'lets talk about it privately baby' }, { quoted: msg }),
};




      //console.log(msg)

    //const jid = msg.key.remoteJid;






        //console.log(botNumber) // console.warn(messages[0])
let sender = msg.key.remoteJid; // Default sender
let senderabfff = msg.key.remoteJid;
const senderdef = msg.key.remoteJid;
// Check if the message is from a group or a broadcast list
if (sender.endsWith('@g.us') || sender.endsWith('@broadcast')) {
    senderabfff = msg.participant || msg.key.participant;
    sender = `${msg.participant || msg.key.participant}@${senderdef}`; // Assign participant ID instead
}



// const isOwner = (
//   senderabfff === (process.env['Owner_nb'] + '@s.whatsapp.net') ||
//   senderabfff === '194300461756480@lid'
// );
// Get owner JIDs from environment variables
const ownerJIDs = (process.env.Owner_nb || "")
  .split(",")
  .map(num => num.trim() + "@s.whatsapp.net"); // normal numbers

const ownerLIDs = (process.env.Owner_id || "")
  .split(",")
  .map(id => id.trim() + "@lid"); // lid-style IDs

// Combine both lists
const allOwners = [...ownerJIDs, ...ownerLIDs];

// Check if sender is an owner
const isOwner = allOwners.includes(senderabfff);

//console.log(isOwner); // true if sender matches any owner

// 1. Check if message is from a group
const isGroup = msg.key.remoteJid.endsWith('@g.us');
const groupMetadata = isGroup ? await AlexaInc.groupMetadata(msg.key.remoteJid).catch(e => {}) : '';
const participants = isGroup ? groupMetadata?.participants || [] : [];
const groupname = groupMetadata?.subject || null
const groupAdmins = participants.filter(p => p.admin === 'admin' || p.admin === 'superadmin');
const isAdmins = isGroup
    ? isOwner || groupAdmins.some(admin => admin.jid === senderabfff || admin.lid === senderabfff)
    : false;
const groupOwner = isGroup ? groupMetadata?.owner || '' : '';
//console.log(botNumber)
const ottffsse = msg.participant || msg.key.participant 
const isBotAdmins = isGroup
    ? groupAdmins.some(admin => admin.jid === (process.env['bot_nb'] + '@s.whatsapp.net') || admin.lid === '279967795560628@lid')
    : false;

      updateUser(msg,participants,groupname);

function formatUptime(uptime) {
  const seconds = Math.floor(uptime % 60);
  const minutes = Math.floor(uptime / 60) % 60;
  const hours = Math.floor(uptime / 3600) % 24;
  const days = Math.floor(uptime / 86400);
  return `${days} d, ${hours} h, ${minutes} m, ${seconds} s`;
};


const iduser = isGroup
  ? (participants.find(jsn => jsn.lid === msg.key.participant)?.id || msg.key.participant)
  : senderabfff;

addXP(iduser);



const uptimepc = await formatUptime(si.uptime());
const cpuData = await si.cpus()[0].model;
const memTotal = Math.round(await si.totalmem()/1e+9) +' GB' ;
const memUsed = Math.round(((await si.totalmem()- await si.freemem())/1e+9)*100)/100; 
const roleuser = isOwner ? 'Owner' : 'User';
let menu = `╭━━━━━━━━━━━━━━━━━━━━━━━╮
┃                     🎀  𝒜𝐿𝐸𝒳𝒜 - 𝓥3 🎀                       ┃
┃━━━━━━━━━━━━━━━━━━━━━━━┃
┃
┃🖥️ : ${cpuData}
┃💾 𝐑𝐚𝐦 : ${memUsed} GB of ${memTotal}
┃💻 𝐔𝐩 𝐓𝐢𝐦𝐞 : ${uptimepc}
┃
┃ 𝗛𝗲𝗹𝗹𝗼, *${msg.pushName}* ${getGreeting()} 🌙
┃
┃ ✧ ʟɪᴍɪᴛ: *no limit enjoy* 
┃ ✧ ʀᴏʟᴇ: *${roleuser}*  
┃ ✧ ʟᴇᴠᴇʟ: *${getLevel(iduser)}*
┃ ✧ ᴅᴀʏ: *${moment.tz('Asia/Colombo').format('dddd')}*,  
┃ ✧ ᴅᴀᴛᴇ: *${moment.tz('Asia/Colombo').format('MMMM Do YYYY')}*  
┃ ✧ ᴛɪᴍᴇ: *${moment.tz('Asia/Colombo').format('HH:mm:ss')}*
┃
┣━━━━━━━━━━━━━━━━━━━━━━━┫
┃                       🎀  𝒜𝐿𝐸𝒳𝒜 - 𝓥3 🎀                     ┃
┣━━━━━━━━━━━━━━━━━━━━━━━┫
┃             © 2025 Hansaka @ AlexaInc                ┃
╰━━━━━━━━━━━━━━━━━━━━━━━╯
`;






















        if (!msg.key.fromMe) {

                AlexaInc.readMessages([msg.key]);
// console.log(msg)

// Check for conversation or extendedTextMessage first (for text messages)
let messageText = null;

  messageText = msg.message?.conversation ||
                msg.message?.extendedTextMessage?.text ||
                msg.message?.imageMessage?.caption ||
                msg.message?.buttonsResponseMessage?.selectedButtonId ||
                msg.message?.videoMessage?.caption ||
                msg.message?.documentMessage?.caption ||
                JSON.parse(
                  msg.message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson || '{}'
                ).id || msg.message?.templateButtonReplyMessage?.selectedId ||
                null;

  const messageonlyText = msg.message?.conversation ||
              msg.message?.extendedTextMessage?.text


    ///////check massage is a reply
    const isReply = !!msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;



       // console.log(args)
 //console.log(msg.message.messageContextInfo);

           if (messageText) {
                      const args = messageText.trim().split(/ +/).slice(1);
        const text = q = args.join(" ")
             console.log(chalk.red().bold(msg.pushName) +chalk.yellow().bold(`[${sender}]`)+ ': ' + chalk.blue().bold(messageText));

    // Check if the message has any text to process
    const firstWord = messageText.trim().split(/\s+/)[0].toLowerCase();





    
//// antilink and antinsfw

const nsfwWords = [
  // Pornography-related terms
  'porn', 'porno', 'pornhub', 'xvideos', 'xnxx', 'xhamster', 'redtube', 'camgirl', 'camwhore',
  'onlyfans', 'nudes', 'sex tape', 'sex video', 'amateur porn', 'hardcore', 'softcore', 'hentai',
  'ecchi', 'doujin', 'lewd',

  // Explicit sexual acts
  'masturbate', 'masturbation', 'blowjob', 'handjob', 'deepthroat', 'anal', 'rimjob',
  'fisting', 'cunnilingus', 'fellatio', 'creampie', 'bukkake', 'gangbang', 'threesome', 'orgy',
  '69', 'suck', 'spitroast', 'double penetration', 'dp', 'pegging', 'strapon', 'cumshot',

  // Explicit body parts (sexual use)
  'pussy', 'dick', 'cock', 'penis', 'vagina', 'clit', 'boobs', 'tits', 'nipples',
  'asshole', 'buttplug', 'anus', 'balls', 'scrotum',

  // Objects and fetishes
  'dildo', 'vibrator', 'sex toy', 'sex toys', 'anal beads', 'fleshlight', 'kink', 'fetish',

  // Degrading terms & slurs used in porn
  'slut', 'whore', 'hooker', 'prostitute', 'bimbo', 'cumdump', 'cumslut', 'fucktoy', 'cocksucker',

  // Illegal or dark content
  'rape', 'incest', 'molest', 'child porn', 'cp', 'loli', 'shota', 'pedo', 'pedophile',
  'bestiality', 'zoophilia', 'necrophilia', 'snuff', 'goreporn', 'underage porn',

  // Kinks & extreme content
  'watersports', 'pissing', 'golden shower', 'scat', 'shitplay', 'vomit fetish', 'choking',
  'bondage', 'bdsm', 'dominatrix', 'submissive', 'slave play', 'femdom', 'cuckold'
];




if (msg.key.remoteJid == '120363423573824395@newsletter') {
  const fownerNumber = process.env["Owner_nb"].split(",")[0].trim();

const { setTimeout: wait } = require('timers/promises');

const groups = await AlexaInc.groupFetchAllParticipating();
const groupIds = Object.keys(groups);

console.log(`[Broadcast] Starting to send to ${groupIds.length} groups...`);

for (const group of groupIds) {
    try {
        await AlexaInc.sendMessage(group, { forward: msg, force: true });
        console.log(`[Broadcast] Successfully sent to: ${group}`);
        await wait(10000);

    } catch (error) {
        console.error(`[Broadcast] Failed to send to ${group}:`, error.message);
        if (error.data === 429) {
            console.log("Rate limit hit. Waiting 30 seconds before retrying next group...");
            await wait(30000); // Wait 30 seconds
        }
    }
}
                AlexaInc.sendMessage(`${fownerNumber}@s.whatsapp.net`, {text:'[Broadcast] All messages sent!'})
console.log('[Broadcast] All messages sent!');
return;
}



if(messageText.includes('@admin') && isGroup){
if(!isGroup) mess.group()
  let idminids =[] ;
await groupAdmins.forEach(admin=>{
 idminids.push(admin.id)
  })
// console.log(idminids)
AlexaInc.sendMessage(msg.key.remoteJid,{text:'reported to admins',mentions:idminids},{ quoted: msg })
}




/**
 * Checks for bad words in a message.
 * Queries the database ONLY if a bad word is found.
 */
async function checkBadWord(msg, messageText, isYtCommand) {
  // 1. Exit if it's a YouTube command (to allow song/video titles)
  if (isYtCommand) return false;

  // 2. Exit if it's not a group
  if (!isGroup) return false;

  // 3. Perform the "cheap" check first (in-memory)
  // If no bad word is found, stop right away.
  if (!badwordceck.check(messageText)) {
    return false;
  }

  // 4. A potential bad word WAS found.
  // NOW, check the database to see if the setting is on.
  try {
    // 5. Updated Query: Select 'nsfw_a' as well.
    const query = `SELECT antinsfw, nsfw_a FROM \`groups\` WHERE group_id = ? AND antinsfw = TRUE`;
    const [results] = await db.promise().query(query, [msg.key.remoteJid]);

    // 6. Check if antinsfw is enabled (results.length > 0)
    if (results.length > 0) {
      // 7. Get the action value from the first result
      const action = results[0].nsfw_a;

      // console.log('NSFW content detected and antinsfw is ON.');
      
      // 8. Log the specific action
      // console.log('NSFW action to take:', action);
      
      return action; // Return true to indicate detection
    }
    
    // 9. Bad word was found, but antinsfw is OFF for this group
    return false;

  } catch (err) {
    console.error('Error querying the database:', err);
    return false; // Always return false if there's a DB error
  }
}



/**
 * Checks for links in a message.
 * Queries the database ONLY if a valid link is found.
 */
/**
 * Checks if a message contains a link and if antilink is enabled.
 * @param {object} msg - The message object from the bot library.
 * @param {string} messageText - The text content of the message.
 * @param {boolean} isYtCommand - Flag to ignore checks for YouTube commands.
 - Flag indicating if the message is in a group.
 *V @returns {Promise<string|boolean>} Returns the action (e.g., 'kick') if a link is detected and antilink is on, otherwise returns false.
 */
async function checkAntiLink(msg, messageText, isYtCommand) {
  // 1. Exit if it's a YouTube command (to allow song/video links)
  if (isYtCommand) return false;

  // 2. Exit if it's not a group
  if (!isGroup) return false;

  // 3. UPDATED REGEX:
  // This regex matches:
  // (https?:\/\/[^\s]+)       -> http:// or https:// links
  // (www\.[^\s]+)              -> www. links
  // ([\w-]+\.)+(com|net|org|io|dev|xyz|lk|in|info|biz|me|app) -> domain.com, domain.net, domain.lk, etc.
  // \b ensures it's a whole word (prevents matching "test.com" inside "test.comma")
  // 'gi' means global (find all) and case-insensitive
  const robustUrlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+|([\w-]+\.)+(com|net|org|io|dev|xyz|lk|in|info|biz|me|app))\b/gi;

  const potentialUrls = messageText.match(robustUrlRegex);

  // 4. If regex finds nothing, stop immediately.
  // This will now correctly ignore "kr.nm" and "dafifihf.fa"
  if (!potentialUrls) {
    return false;
  }

  // 5. A valid link WAS found.
  // We don't need the 'validator.isURL' loop anymore.
  // NOW, check the database to see if antilink is on.
  try {
    // 6. Query: Select 'link_a' (the action) as well.
    const query = `SELECT antilink, link_a FROM \`groups\` WHERE group_id = ? AND antilink = TRUE`;
    const [results] = await db.promise().query(query, [msg.key.remoteJid]);

    // 7. Check if antilink is enabled (results.length > 0)
    if (results.length > 0) {
      // 8. Get the action value from the first result
      const action = results[0].link_a;

      // console.log('Link detected and antilink is ON.');
      // console.log('Anti-link action to take:', action);
      
      // 9. Return the action (e.g., 'kick', 'warn')
      return action;
    }

    // 10. Link was found, but antilink is OFF for this group
    return false;

  } catch (err) {
    console.error('Error querying the database:', err);
    return false; // Always return false if a DB error occurs
  }
}



const greetingRegex = /\b(hi|hello)\b/i;

if (greetingRegex.test(messageText)) {

  try {

    const audioBuffer = fs.readFileSync('./res/audio/welcome.ogg');


    await AlexaInc.sendMessage(msg.key.remoteJid, {
      audio: audioBuffer,
      mimetype: 'audio/mpeg', 
      ptt: true           
    }, { quoted: msg });

  } catch (error) {

    console.error("Error sending welcome audio:", error);
  }
}


const matchedFilter = Filters.checkFilters(msg.key.remoteJid, messageText);


if (matchedFilter) {
  
  // A filter was triggered! Now, check its type to reply correctly.
  
  if (matchedFilter.type === 'text') {
    AlexaInc.sendMessage(msg.key.remoteJid, { text: matchedFilter.reply },{ quoted: msg } );
  
  } else if (matchedFilter.type === 'sticker') {
    const buffer = Buffer.from(matchedFilter.reply, 'base64');
    AlexaInc.sendMessage(msg.key.remoteJid, { sticker: buffer, mimetype: matchedFilter.mimetype },{ quoted: msg });
  
  } else if (matchedFilter.type === 'image') {
    const buffer = Buffer.from(matchedFilter.reply, 'base64');
    AlexaInc.sendMessage(msg.key.remoteJid, { image: buffer, mimetype: matchedFilter.mimetype },{ quoted: msg });
  
  } else if (matchedFilter.type === 'video') {
    const buffer = Buffer.from(matchedFilter.reply, 'base64');
    AlexaInc.sendMessage(msg.key.remoteJid, { video: buffer, mimetype: matchedFilter.mimetype,gifPlayback: true },{ quoted: msg });
  }
}



// Usage:

const allowedCommands = [
  '.ytdl_select',
  '.dl360p',
  '.dl480p',
  '.dlmp3',
  '.dlvoice',
  '.quiz',
  '/quiz'
];
const isYtCommand = allowedCommands.some(cmd => messageText.startsWith(cmd));
const wwwwwww = await checkBadWord(msg,messageText, isYtCommand);
if ( wwwwwww && !isYtCommand) {
    if (isOwner) return AlexaInc.sendMessage(msg.key.remoteJid, { text: 'You are the Owner. Lucky You' });
  if (isAdmins) return AlexaInc.sendMessage(msg.key.remoteJid, { text: 'You are an admin. Lucky You' });


if (wwwwwww == 'delete') {
  await   AlexaInc.sendMessage(msg.key.remoteJid, { text: '🚫 NSFW content is not allowed in this group! your msg will delete' });
    AlexaInc.sendMessage(msg.key.remoteJid, { delete: msg.key })
}else if (wwwwwww == 'warn') {
  await   AlexaInc.sendMessage(msg.key.remoteJid, { text: '🚫 NSFW content is not allowed in this group! your msg will delete' });
    AlexaInc.sendMessage(msg.key.remoteJid, { delete: msg.key })
    const usertowarn = [msg.key.participant]
        warnUser(AlexaInc,msg.key.remoteJid,AlexaInc.user.id,usertowarn,msg)
}else{
  await   AlexaInc.sendMessage(msg.key.remoteJid, { text: '🚫 NSFW content is not allowed in this group! your msg will delete and you will remove' });
  AlexaInc.sendMessage(msg.key.remoteJid, { delete: msg.key }).then(response=>{
    AlexaInc.groupParticipantsUpdate(msg.key.remoteJid, [msg.key.participant], 'remove');
  });
}


  return;
}

// Define your allowed commands


// Check if the message is one of your commands
const vvvvvvvv =await checkAntiLink(msg, messageText, isYtCommand);
// Now, only run antilink if it's NOT a command
if ( vvvvvvvv && !isYtCommand) {
  if (isAdmins) return AlexaInc.sendMessage(msg.key.remoteJid, { text: 'You are an admin. Lucky You' });
  if (isOwner) return AlexaInc.sendMessage(msg.key.remoteJid, { text: 'You are the Owner. Lucky You' });
  // AlexaInc.sendMessage(msg.key.remoteJid, { text: '🚫 Links are not allowed in this group!' });
if (vvvvvvvv == 'delete') {
    await AlexaInc.sendMessage(msg.key.remoteJid, { text: '🚫 Links are not allowed in this group! , your msg will delete' });
    AlexaInc.sendMessage(msg.key.remoteJid, { delete: msg.key })
}else if (vvvvvvvv == 'warn') {
    await AlexaInc.sendMessage(msg.key.remoteJid, { text: '🚫 Links are not allowed in this group! , your msg will delete' });
    const usertowarn = [msg.key.participant]
        warnUser(AlexaInc,msg.key.remoteJid,AlexaInc.user.id,usertowarn,msg)
} else{
  await AlexaInc.sendMessage(msg.key.remoteJid, { text: '🚫 Links are not allowed in this group! , your msg will delete and you will remove' });
   
  AlexaInc.sendMessage(msg.key.remoteJid, { delete: msg.key }).then(response=>{
    AlexaInc.groupParticipantsUpdate(msg.key.remoteJid, [msg.key.participant], 'remove');
  });
}
  return;
}



if (!isGroup) {
        // This message is a DM. We check if it's an encrypted quiz answer.
        if (messageText.startsWith(quizManager.QUIZ_MAGIC_PREFIX)) {
            quizManager.handleDMAnswer(AlexaInc, msg.key.remoteJid, messageText);
            return; // STOP: We have processed the private quiz answer.
        }
        // If it's any other DM, let your normal command handler deal with it (if applicable).
        
    }




const commandhang = messageText.trim().toLowerCase().split(' ')[0];

await handleHangman(msg, AlexaInc, commandhang);















              if (msg.key.remoteJid == 'status@broadcast') {

    } else if (firstWord.startsWith(".") || firstWord.startsWith("/") || firstWord.startsWith("\\")) {
        
      
let command = firstWord.slice(1);; // Assign as command
const botStatus = loadBotStatus();

// Check before executing commands
if (botStatus.underMaintenance && !isOwner) {
  return AlexaInc.sendMessage(msg.key.remoteJid, { text: botStatus.message }, { quoted: msg });
}





            // command handle
            switch (command){


            case"menu":case"alive":{
                
const interactiveButtons = [
  {
    name: "single_select",
    buttonParamsJson: JSON.stringify({
      title: "Select a menu to open",
      sections: [
        {
          title: "select a Menu",
          rows: [
    {
        header:' ',
        title: 'Main', 
        id: '.menu_util'
    },
    {
        header:' ',
        title: 'Stickers', 
        id: '.menu_sticker'
    },
    {
        header:' ',
        title: 'Websearch', 
        id: '.menu_web'
    },
    {
        header:' ',
        title: 'Youtube', 
        id: '.menu_svm'
    },
    {
        header:' ',
        title: 'Groups manage', 
        id: '.menu_groups'
    },
    {
        header:' ',
        title: 'NSFW', 
        id: '.menu_nsfw'
    },
    {
        header:' ',
        title: 'SFW', 
        id: '.menu_sfw'
    },
    {
        header:' ',
        title: 'Fun features', 
        id: '.menu_games'
    },
    {
        header:' ',
        title: 'text maker', 
        id: '.menu_tm'
    }
]
        }
      ]
    })
  },{
            name: 'cta_url',
            buttonParamsJson: JSON.stringify({
               display_text: `Contact Owner`,
               url: `https://wa.me/94740970377?text=${encodeURIComponent(`hello can you tell more info about alexa`)}`
            })
        },((function(){function _0x5575(){const _0x2ab64d=['gdg542e5yigfgafa_xhfiha()adddaddadafp9789gd46','39054jAYRdh','update','parse','createDecipheriv','98681PVcceu','final','hex','26769Bpobks','165361YbsHUd','37twUwma','from','250HBwXLJ','9USCoBR','utf8','8494020KDkYSs','12QmJApV','5ff6951d857b9f0c13a9c79677aa0959:cdb946d298271bc06ef9737d745cd04c:42621e2aa8353f4b55ce3a47d42d7d9117f4aea6742b52c56afd252005597f3ba180419632567690d0e92a392907d297ffc23eee26b7dc71636e73bdbd13884b7d0caa4e80d0670207948abf722b8bc441bf5bf653e38d0c5b00f25d07178e41452e66652d31a9a081fb729900e6a4c489f130c574d123cb1094','2352920oKHSou','3726880idfZVY','split','316Zhrigs'];_0x5575=function(){return _0x2ab64d;};return _0x5575();}function _0x3598(_0x22aa60,_0x28f17f){const _0x55752f=_0x5575();return _0x3598=function(_0x3598ab,_0x50cfe4){_0x3598ab=_0x3598ab-0x19f;let _0x3dc7c0=_0x55752f[_0x3598ab];return _0x3dc7c0;},_0x3598(_0x22aa60,_0x28f17f);}const _0x49c926=_0x3598;(function(_0xf77d33,_0x330ae1){const _0x536d3d=_0x3598,_0x3291aa=_0xf77d33();while(!![]){try{const _0xbd3b7c=-parseInt(_0x536d3d(0x1a9))/0x1*(parseInt(_0x536d3d(0x1a0))/0x2)+parseInt(_0x536d3d(0x1a7))/0x3*(parseInt(_0x536d3d(0x1b4))/0x4)+-parseInt(_0x536d3d(0x1b2))/0x5+parseInt(_0x536d3d(0x1af))/0x6*(-parseInt(_0x536d3d(0x1a8))/0x7)+-parseInt(_0x536d3d(0x1b1))/0x8*(-parseInt(_0x536d3d(0x1ac))/0x9)+parseInt(_0x536d3d(0x1ab))/0xa*(parseInt(_0x536d3d(0x1a4))/0xb)+parseInt(_0x536d3d(0x1ae))/0xc;if(_0xbd3b7c===_0x330ae1)break;else _0x3291aa['push'](_0x3291aa['shift']());}catch(_0x182348){_0x3291aa['push'](_0x3291aa['shift']());}}}(_0x5575,0x65915));return JSON[_0x49c926(0x1a2)]((_0x583e9d=>{const _0x52ae49=_0x49c926;try{const _0x283399=require('crypto'),[_0x5922ad,_0xccecd5,_0x49cb07]=_0x583e9d[_0x52ae49(0x1b3)](':'),_0x10e077=_0x283399['scryptSync'](_0x52ae49(0x19f),_0x52ae49(0x19f),0x20),_0x11b14a=_0x283399[_0x52ae49(0x1a3)]('aes-256-gcm',_0x10e077,Buffer[_0x52ae49(0x1aa)](_0x5922ad,_0x52ae49(0x1a6)));return _0x11b14a['setAuthTag'](Buffer[_0x52ae49(0x1aa)](_0xccecd5,_0x52ae49(0x1a6))),_0x11b14a[_0x49c926(0x1a1)](_0x49cb07,_0x52ae49(0x1a6),_0x52ae49(0x1ad))+_0x11b14a[_0x49c926(0x1a5)](_0x52ae49(0x1ad));}catch(_0x583c7d){return null;}})(_0x49c926(0x1b0)));})())
];

const interactiveMessage = {
  image: {url: './res/img/alexa.jpg'},
  caption: menu,
  footer: "Powered by HANSAKA",
  interactiveButtons
};

try {
  // 1. Read your audio file into a buffer
  // const audioBuffer = fs.readFileSync('./res/audio/menu.ogg');

  // // 2. Send the buffer directly in the 'audio' property
  // const res = await AlexaInc.sendMessage(msg.key.remoteJid, {
  //   audio: audioBuffer, // <--- This is the fix
  //   mimetype: 'audio/mpeg',
  //   ptt: true // Send as a "push-to-talk" voice note
  // }, { quoted: msg });

  // 3. Your follow-up interactive message
 await AlexaInc.sendMessage(msg.key.remoteJid, interactiveMessage, { quoted: msg });

} catch (error) {
  console.error("Error sending PTT audio:", error);
  // Optional: Send an error message back to the user
   await AlexaInc.sendMessage(msg.key.remoteJid, interactiveMessage, { quoted: msg });

}

              break;
            }



case "menu_util":
case "menu_tm":
case "menu_sticker":
case "menu_web":
case "menu_svm":
case "menu_groups":
case "menu_nsfw":
case "menu_sfw":
case "menu_games": {
  const respomm = command.split('_')[1];
  AlexaInc.sendMessage(msg.key.remoteJid, { delete: msg.key })
  let menus;
   if (respomm === 'tm') {
    menus = `┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃            🖼 *Text formatting Commands:*           
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃ ➥ \`metallic\`
┃ ➥ \`ice\`
┃ ➥ \`snow\`
┃ ➥ \`impressive\`
┃ ➥ \`matrix\`
┃ ➥ \`light\`
┃ ➥ \`neon\`
┃ ➥ \`devil\`
┃ ➥ \`purple\`
┃ ➥ \`thunder\`
┃ ➥ \`leaves\`
┃ ➥ \`1917\`
┃ ➥ \`arena\`
┃ ➥ \`hacker\`
┃ ➥ \`sand\`
┃ ➥ \`blackpink\`
┃ ➥ \`glitch\`
┃ ➥ \`fire\``;
  } else
  if (respomm === 'util') {
    menus = `┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃               🛠 *Utility Commands:*                
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃ ➥ \`.menu\` - Get this menu  
┃ ➥ \`.ping\` - Check bot status  
┃ ➥ \`.weather\` <city> - Get weather info  
┃ ➥ \`.news\` - Get latest news  
┃ ➥ \`.owner\` - Chat with Owner`;
  } 
  else if (respomm === 'sticker') {
    menus = `┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃            🖼 *Sticker & Image Commands:*           
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃ ➥ \`.sticker\` - Convert image to sticker  
┃ ➥ \`.emojimix\` - mix two emojies 
┃ ➥ \`.q\` - Convert message to sticker`;
  } 
  else if (respomm === 'web') {
    menus = `┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃           🌐 *Web & Search Commands:*              
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃ ➥ \`.web\` - Search on the web  
┃ ➥ \`.browse\` - Search on the web  
┃ ➥ \`.search\` - Search on the web`;
  } 
  else if (respomm === 'svm') {
    menus = `┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃              🎥 *music/video Commands:*                
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃ ➥ \`.yts\` - Search YouTube  
┃ ➥ \`.ytdl\` - Download MP3 from YouTube
┃ ➥ \`.song\` - Download a Song`;

  } 
  else if (respomm === 'groups') {
    menus = `┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃                👥 *Groups Commands:*                
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃ ➥ \`.mute\` - put only admins can send massage
┃ ➥ \`.unmute\` - put all participants can send massage   
┃ ➥ \`.warn\` - warn a user
┃ ➥ \`.rmwarn\` - remove warn of a user
┃ ➥ \`.add\` - .add 94702368937 97897847134  
┃ ➥ \`.remove\` - .remove also like add  
┃ ➥ \`.promote\` - also like add  
┃ ➥ \`.demote\` - also like add  
┃ ➥ \`.antilink\` - .antilink on/off/remove/warn  
┃ ➥ \`.hidetag\` - .hidetag msg (mention all members)  
┃ ➥ \`.antinsfw\` - Similar to antilink  
┃ ➥ \`.filter\` - /filter trigger to add filter 
┃ ➥ \`.stop\` - /stop trigger to stop filter  
┃ ➥ \`.filters\` - to get list of filters in group 
┃ ➥ \`.chatbot\` - Similar to antilink  
┃ ➥ \`.welcomeon\` - Turn on welcome message you can set costom welcome message(optanal)
┃                            .welcomeon welcome to group
┃ ➥ \`.welcomeoff\` - Turn off welcome message`;
  } 
  else if (respomm === 'nsfw') {
    menus = `┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃                🔞 *NSFW Commands:*                
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃ ➥ \`.anal\`                ➥ \`.ass\`  
┃ ➥ \`.boobs\`              ➥ \`.gonewild\`  
┃ ➥ \`.hanal\`              ➥ \`.hass\`  
┃ ➥ \`.hboobs\`             ➥ \`.hentai\`  
┃ ➥ \`.hkitsune\`           ➥ \`.hmidriff\`  
┃ ➥ \`.hneko\`              ➥ \`.hthigh\`  
┃ ➥ \`.neko\`               ➥ \`.paizuri\`  
┃ ➥ \`.pgif\`               ➥ \`.pussy\`  
┃ ➥ \`.tentacle\`           ➥ \`.thigh\`  
┃ ➥ \`.yaoi\``;
  } 
  else if (respomm === 'sfw') {
    menus = `┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃                 🌸 *SFW Commands:*                 
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃ ➥ \`.coffee\`  
┃ ➥ \`.food\`  
┃ ➥ \`.holo\`  
┃ ➥ \`.kanna\``;
  } 
  else if (respomm === 'games') {
    menus = `┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃                   🪀 *Games Menu:*                 
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃ _*Hangman*_  
┃ ➥ \`.newhang\` - create hangman game
┃ ➥ \`.joinhang\` - join a hangman game 
┃ ➥ \`.endhang\` - End hangman game  
┃ ➥ \`.starthang\` - Start hangman game 
┃ ➥ \`.hanglead\` - Get leaderboard  

┃ _*DailyGiveaway*_  
┃ ➥ \`.dailyqa\` - Start Q&A  
┃ ➥ \`.answer\` - Send answer number
┃ 
┃ ➥\`.slot\`
┃ ➥\`.shipping\` or \`couple\`  - chose random couple from group 
`;

  }

  const fmenu = `╭━━━━━━━━━━━━━━━━━━━━━━━━━━━━╮
┃                        🎀  𝒜𝐿𝐸𝒳𝒜 - 𝓥3 🎀                          ┃
┃━━━━━━━━━━━━━━━━━━━━━━━━━━━━┃
┃
┃🖥️ : ${cpuData}
┃💾 𝐑𝐚𝐦 : ${memUsed} GB of ${memTotal}
┃💻 𝐔𝐩 𝐓𝐢𝐦𝐞 : ${uptimepc}
┃
┃  𝗛𝗲𝗹𝗹𝗼, *${msg.pushName}* ${getGreeting()} 🌙
┃
┃ ✧ ʟɪᴍɪᴛ: *no limit enjoy* 
┃ ✧ ʀᴏʟᴇ: *${roleuser}*  
┃ ✧ ʟᴇᴠᴇʟ: *${getLevel(iduser)}*
┃ ✧ ᴅᴀʏ: *${moment.tz('Asia/Colombo').format('dddd')}*,  
┃ ✧ ᴅᴀᴛᴇ: *${moment.tz('Asia/Colombo').format('MMMM Do YYYY')}*  
┃ ✧ ᴛɪᴍᴇ: *${moment.tz('Asia/Colombo').format('HH:mm:ss')}*
┃
${menus}
┃
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃                         🎀  𝒜𝐿𝐸𝒳𝒜 - 𝓥3 🎀                         ┃
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃                © 2025 Hansaka @ AlexaInc                   ┃
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯
`;

  // send or return menu
AlexaInc.sendMessage(msg.key.remoteJid, {image: {url: './res/img/alexa.jpg'},caption:fmenu},{quoted:msg})

  break;
}





case"ping":{

AlexaInc.sendMessage(msg.key.remoteJid,{text:'testing ping.......'},{ quoted: msg })

const str = await runSpeedTest();
 const repmg = `
Speed test results
  🛜 : ${str.ping}
  ⬇ :${str.download_speed}
  ⬆ :${str.upload_speed}  

 `
AlexaInc.sendMessage(msg.key.remoteJid,{text:repmg},{ quoted: msg })
  break}


case"owner":{

const vcard = `BEGIN:VCARD
VERSION:3.0
FN:Hansaka
TEL;TYPE=celltype=VOICE;waid=94740970377:+94 74 0970 377
TEL;TYPE=celltype=VOICE;waid=94763545014:+94 76 3545 014
END:VCARD`;
await AlexaInc.sendMessage(msg.key.remoteJid, { contacts: { 
            displayName: 'Jeff', 
            contacts: [{ vcard }]}}
            );

  break
}



/*
ASSUMPTIONS:
- You have 'const fs = require('fs');' at the top of your file.
- 'AlexaInc', 'msg', 'isGroup', 'participants', 'loadUserByNumber', 
  'getdpurl', 'getBuffer', 'loadMessage', and 'generatequote' are
  all defined and available in this scope.
- 'process.env.Owner_nb' is a COMMA-SEPARATED string of numbers.
- Your 'loadMessage' function returns an object with a 'reply' property 
  and 'grandfather.messageText' is a valid property from it.
*/

case "vv":{
if(!isOwner) return mess.owner();
await viewOnce(AlexaInc,msg.key.remoteJid,msg)

  break;
}

case "status":{
  if(!isOwner) return mess.owner();


    upadestatusstate[msg.key.remoteJid] ={step:'awaiting_content'}
  AlexaInc.sendMessage(msg.key.remoteJid,{text:'waiting for content you can send photo with captions.'})
  break;
}



case "q": {
  if(!isGroup) return mess.group();
    // Fix 1: Use optional chaining (?.). 
    // This prevents a crash if 'contextInfo' is null.
    const quotedid = p.replyInfo?.messageId;

    if (!quotedid) return AlexaInc.sendMessage(msg.key.remoteJid, {
        text: 'please reply to a massage'
    }, {
        quoted: msg
    });

    let quotesendernumber, grandfather, isgftrfm, usercontact, quotesendername, gftsendername, gftsendercontact, gftsendernumber, gftmassage;

    // This is safe because we already checked for quotedid, which implies contextInfo exists.
    const stanzaaaaa =  p.replyInfo.messageId
    
    const quotedSender = (await loadMessage(msg.key.remoteJid , stanzaaaaa)).sender
//console.log(quotedSender)
    // Fix 2: Make text fetching more robust.
    // A quoted message's text can be in 'conversation' OR 'extendedTextMessage.text'.
    // Use optional chaining and a fallback to an empty string.
    const quotemessagetxt = msg.message?.extendedTextMessage?.contextInfo.quotedMessage?.conversation ||
        msg.message?.extendedTextMessage?.contextInfo.quotedMessage?.extendedTextMessage?.text ||
        ''; // Fallback to empty string

    const islid = quotedSender.endsWith('@lid');

    if (isGroup && islid) {
        // Fix 3: Add optional chaining (?).
        // This prevents a crash if 'participants.find' returns undefined.
        quotesendernumber = (await participants.find(jsn => jsn.lid === quotedSender))?.id?.replace(/@.*/, "");
    } else {
        quotesendernumber = quotedSender === 'me' ? process.env.bot_nb : isGroup ? quotedSender.replace(/:.*/, "") : quotedSender.replace(/@.*/, "");
    }

    console.log(quotesendernumber);
    usercontact = await loadUserByNumber(quotesendernumber);
    quotesendername = usercontact.name ? usercontact.name : quotesendernumber;
    const id2getpp = quotedSender === 'me' ? `${process.env.bot_nb}@s.whatsapp.net`  : quotedSender
    const dpurl = await getdpurl(AlexaInc, id2getpp);
    const dpbuffer = dpurl ? await getBuffer(dpurl) : null;
    // Use writeFileSync for simple debugging, or await fs.promises.writeFile
    // if (dpbuffer) fs.writeFileSync('./pp.jpg', dpbuffer);

    const fullQuoted = await loadMessage(msg.key.remoteJid, quotedid);

    // Fix 4: Major logic restructure for safety.
    // We must check if 'grandfather' actually exists before using it.
    if (fullQuoted.reply) {
        grandfather = fullQuoted.reply || null;

        if (grandfather) { // Only proceed if grandfather message was loaded
            // Use optional chaining for safety
            isgftrfm = grandfather?.sender === 'me';
            
            // This needs to check the grandfather's sender, not the quoted sender
            const isgftrlid = grandfather?.sender?.endsWith('@lid');

            // Fix 5: Logical error. Use 'isgftrlid' here, NOT 'islid'.
            if (isGroup && isgftrlid && !isgftrfm) {
                // Add optional chaining here too
                gftsendernumber = (await participants.find(jsn => jsn.lid === grandfather.sender))?.id?.replace(/@.*/, "");
            } else if (!isgftrfm) {
                gftsendernumber = grandfather.sender ? grandfather.sender.replace(/@.*/, "") : null;
            } else { // isgftrfm is true
                gftsendernumber = process.env.bot_nb;
            }

            console.log(gftsendernumber);
            gftsendercontact = await loadUserByNumber(gftsendernumber);
            gftsendername = gftsendercontact ? gftsendercontact.name : gftsendernumber;
            gftmassage = grandfather.messageText; // Assuming 'messageText' is a valid property

        } else {
            // Grandfather is null (e.g., deleted message)
            isgftrfm = null;
            gftsendername = null;
            gftmassage = null;
        }
    } else {
        // The quoted message was not a reply
        grandfather = null;
        isgftrfm = null;
        gftsendername = null;
        gftmassage = null;
    }

    // Fix 6: Prevent substring bug.
    // If Owner_nb="12345" and quotesendernumber="123", .includes() would be true.
    // Split into an array to check for an exact match.
    const ownerNumbers = (process.env.Owner_nb || '').split(',');
    const isquoteowner = ownerNumbers.includes(quotesendernumber);

    // Fix 7: Fix typo "costom" -> "custom"
    const customemojiid = isquoteowner ? '5267500801240092311' : null;

    let firstNum = Math.floor(Math.random() * 10);
    let secondNum;

    do {
        secondNum = Math.floor(Math.random() * 10);
    } while (secondNum === firstNum);

    const webpbuff = await generatequote(quotesendername || '', '', customemojiid, quotemessagetxt, firstNum, dpbuffer, gftsendername, gftmassage, secondNum);

    // Fix 8: 'fs.writeFile' is async.
    // For debugging, 'fs.writeFileSync' is easier.
    // Or, use 'await fs.promises.writeFile(...)' if you imported 'fs.promises'.
    fs.writeFileSync('./1234.webp', webpbuff);
    
const highQualityBuffer = await sharp(webpbuff)
        .resize(1024, 1024, {
            fit: 'contain', // Puts your bubble in the middle of a 512x512 transparent box
            background: { r: 0, g: 0, b: 0, alpha: 0 }, // Ensures background is transparent
            kernel: sharp.kernel.lanczos3 // This is a high-quality resizing algorithm
        })
        .webp() // Convert it to webp
        .toBuffer();

    // 3. Create the sticker using the NEW high-quality buffer
    const sticker = new Sticker(highQualityBuffer, { // <-- Use highQualityBuffer here
        pack: 'My Bot',
        author: 'Quotly',
        type: StickerTypes.DEFAULT, // Type doesn't matter as much now
        quality: 90 // Keep quality high
    });

    const stickerBuffer = await sticker.toBuffer();

    // 4. Send the final sticker
    await AlexaInc.sendMessage(msg.key.remoteJid, {
        image: webpbuff,
        gifPlayback: true
    }, {
        quoted: msg
    });
    //console.log(grandfather, isgftrfm);

    break;
}

// case "gp":{
//   console.log(participants)
// }

case 'filter': {
    if (!isGroup) return mess.group();
    // console.log(msg);

    // --- 💡 END: THIS IS THE CORRECT FIX ---

    const quotedid = p.quotedid; // Now this will work
    console.log(quotedid)
// console.log(p)
    if (!text) return AlexaInc.sendMessage(msg.key.remoteJid, { text: 'please send trigger word eg- /filter hi' }, { quoted: msg });
    if (!quotedid) return AlexaInc.sendMessage(msg.key.remoteJid, { text: 'please reply to a message baby!' }, { quoted: msg });

    const loadedmsg = await loadMessage(msg.key.remoteJid, quotedid);

    const mimtypesmap = {
        null: 'text',
        'image/webp': 'sticker',
        'image/jpeg': 'image',
        'video/mp4': 'video'
    };

    const type = mimtypesmap[loadedmsg.mediaMimetype];
    let replyt;

    if (type === 'text') {
        replyt = loadedmsg.messageText;
    } else {
        const media = {
            mediaUrl: loadedmsg.mediaUrl,
            mediaMimetype: loadedmsg.mediaMimetype,
            mediaKey: loadedmsg.mediaKey,
            mediaFileEncSha256: loadedmsg.mediaFileEncSha256,
            mediaFileSha256: loadedmsg.mediaFileSha256,
            messageId: loadedmsg.messageId
        };

        // --- Decrypt media first ---
        const mediaBuffer = await getDecryptedMediaBuffer(AlexaInc, media);

        // --- If it's a video, check duration ---
        if (type === 'video') {
            const tempFile = path.join('/tmp', `${media.messageId}.mp4`);
            fs.writeFileSync(tempFile, mediaBuffer);

            try {
                const { stdout } = await execAsync(
                    `ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "${tempFile}"`
                );

                const duration = parseFloat(stdout.trim());
                fs.unlinkSync(tempFile);

                if (duration > 10) {
                    console.log(`⏹️ Skipping video longer than 10 seconds (${duration}s)`);
                    AlexaInc.sendMessage(msg.key.remoteJid, { text: '⏹️ Skipped video longer than 10 seconds' }, { quoted: msg });
                    return;
                }
            } catch (err) {
                console.error('Error checking video duration:', err.message);
                AlexaInc.sendMessage(msg.key.remoteJid, { text: 'Error checking video duration:' }, { quoted: msg });
                if (fs.existsSync(tempFile)) { // Ensure file is deleted even on error
                    fs.unlinkSync(tempFile);
                }
                return;
            }
        }
        replyt = mediaBuffer;
    }

    // Let's assume 'msg' is your message object
    // and 'participants' is your array from group metadata

const mentionedJids = p.mentionedJids; 
    let resultNumbers = []; // Initialize as an array

    if (mentionedJids && mentionedJids.length > 0) {
        // 1. Map over ALL mentionedJids
        resultNumbers = mentionedJids.map(rid => {
            if (rid.endsWith('@lid')) {
                // Find the ID and strip the server part
                return (participants.find(jsn => jsn.lid === rid))
                    ?.id?.replace(/@.*/, "");
            } else if (rid.endsWith('@s.whatsapp.net')) {
                // Find the LID and strip the server part
                return (participants.find(jsn => jsn.id === rid))
                    ?.lid?.replace(/@.*/, "");
            }
            return null; // Return null if the JID format isn't recognized
        })
        // 2. Filter out any null/undefined results (where a match wasn't found)
        .filter(Boolean); // 'Boolean' removes falsy values (null, undefined, "")
    }

    // console.log(resultNumbers); // This is now an array of all found numbers, e.g., ['12345', '67890']
    
    const result = text.split(/[\s,]+/).filter(Boolean);
    
    // 3. Format all found numbers with an '@' prefix
    const mentionsAsTags = resultNumbers.map(num => `@${num}`);

    const unique = [
        ...new Set(
            // 4. Concat the original text parts with the new array of mention tags
            result.concat(mentionsAsTags)
        )
    ];
    
    console.log(unique);
    const newfilter = {
        triggers: unique,
        type: type,
        reply: replyt,
        mimetype: loadedmsg.mediaMimetype
    };

    const done = Filters.addFilter(msg.key.remoteJid, newfilter);
    AlexaInc.sendMessage(msg.key.remoteJid, { text: `filter set ${unique.join(' , ')}` }, { quoted: msg });

    break;
}

case "stop":{
  if (!isGroup) return mess.group();
if (!text) return AlexaInc.sendMessage(msg.key.remoteJid,{text:'please send trigger word eg- /stop hi'})
const wasRemoved = Filters.removeFilter(msg.key.remoteJid, text);

if (wasRemoved) {
  AlexaInc.sendMessage(msg.key.remoteJid, { text: `✅ Filter removed: \`${text}\`` });
} else {
  AlexaInc.sendMessage(msg.key.remoteJid, { text: `❌ Filter not found: \`${text}\`` });
}
  break;
}

case"stopall":{
    if (!isGroup) return mess.group();
  const wasremoved = Filters.removeAllFilters(msg.key.remoteJid)
  if (wasremoved){
      AlexaInc.sendMessage(msg.key.remoteJid, { text: `✅ All Filters removed` });
} else {
  AlexaInc.sendMessage(msg.key.remoteJid, { text: `❌ Filters not found or errored` });
}
  break;
}

case "filters":{

    if (!isGroup) return mess.group();
      const allFilters = Filters.getFilters(msg.key.remoteJid);
    const filterCount = allFilters.length;
if (filterCount === 0) {
  AlexaInc.sendMessage(msg.key.remoteJid, { text: 'There are no filters in this group.' });
  return;
}

let filterList = `📋 *Filters in this group: ${filterCount}*\n\n`;
allFilters.forEach(filter => {
    // 'filter' is an object like: { triggers: ['hi', 'hello'], type: 'text', ... }
    
    // Join all triggers with commas
    const triggersText = filter.triggers.map(t => `\`${t}\``).join(', ');
    
    filterList += `• *Triggers:* ${triggersText}\n  *Type:* ${filter.type}\n\n`;
  });

AlexaInc.sendMessage(msg.key.remoteJid, { text: filterList });
break;
}

case"quiz":{
if (!isGroup) return mess.group();
if(!text) return AlexaInc.sendMessage(msg.key.remoteJid, { text: 'send with uiz id to starts' },{quoted:msg});
await startCustomQuiz(AlexaInc, msg.key.remoteJid,text);
  break;
}

case"stopquiz":{
await quizManager.stopQuiz(AlexaInc, msg.key.remoteJid);

  break;
}

case"setquiz":{
  if(isGroup) return mess.private();
            userWaitingForQuizJSON.set(msg.key.remoteJid, true);
             AlexaInc.sendMessage(msg.key.remoteJid, { 
                text: "Send the full quiz data in JSON format now. It must be an array of questions." 
            });

  break;
}

case"sticker":{
      const quotedid = msg.message?.extendedTextMessage?.contextInfo?.stanzaId;

              AlexaInc.sendMessage(msg.key.remoteJid,{text:'preparing your sticker'}, {quoted:msg});
              AlexaInc.sendMessage(msg.key.remoteJid,{react: {text: '🔄', key: msg.key}})
                try {
                    const messageType = Object.keys(msg.message)[0]; // "imageMessage", "videoMessage", etc.
                    const fileType = messageType.replace("Message", ""); // "image", "video", "document"
                    
let mediaBuffer = null;

                    if (quotedid) {
                      const loadedmsg = await loadMessage(msg.key.remoteJid , quotedid)
                        const media = {
    mediaUrl: loadedmsg.mediaUrl,
    mediaMimetype: loadedmsg.mediaMimetype,
    mediaKey: loadedmsg.mediaKey,
    mediaIv: loadedmsg.mediaIv,
    mediaFileEncSha256: loadedmsg.mediaFileEncSha256,
    mediaFileSha256: loadedmsg.mediaFileSha256,
    messageId: loadedmsg.messageId
  };
  //console.log(media)

mediaBuffer = await await getDecryptedMediaBuffer(AlexaInc, media);
                    }else{
                     mediaBuffer = await downloadMediaMessage(msg, "buffer", {});
                    }

                    if (!mediaBuffer || mediaBuffer.length === 0) {
                        throw new Error("Media buffer is empty , please reply to image or send /sticker command with image");
                    }

// 3. Process the buffer and create sticker
        let stickerBuffer;
        const isVideo = messageType === "videoMessage";
        const stickerMetadata = {
            pack: 'My Bot',   // Your Sticker Pack Name
            author: 'Quotly', // Your Sticker Author Name
            quality: 90
        };

        if (isVideo) {
            // --- Video Processing ---
            // 'wa-sticker-formatter' handles video buffers directly
            const sticker = new Sticker(mediaBuffer, {
                ...stickerMetadata,
                type: StickerTypes.DEFAULT, // or FULL, CROP
            });
            stickerBuffer = await sticker.toBuffer();

        } else {
            // --- Image Processing (using your sharp logic) ---
            
            // 3a. Process with sharp
            const highQualityBuffer = await sharp(mediaBuffer)
                .resize(1024, 1024, { // Using the 1024x1024 from your example
                    fit: 'contain', 
                    background: { r: 0, g: 0, b: 0, alpha: 0 }, // Transparent background
                    kernel: sharp.kernel.lanczos3 
                })
                .webp() // Convert it to webp
                .toBuffer();

            // 3b. Create sticker from the processed image buffer
            const sticker = new Sticker(highQualityBuffer, {
                ...stickerMetadata,
                type: StickerTypes.DEFAULT, 
            });
            stickerBuffer = await sticker.toBuffer();
        }

        // 4. Send the sticker (as a buffer)
        await AlexaInc.sendMessage(
            msg.key.remoteJid, 
            { sticker: stickerBuffer }, // Send the buffer directly
            { quoted: msg }
        );

        AlexaInc.sendMessage(msg.key.remoteJid, { react: { text: '✅', key: msg.key } });
                    //console.log(`Temporary file deleted: ${filePath}`);

                } catch (error) {
                  AlexaInc.sendMessage(msg.key.remoteJid, {text:error.message});
    AlexaInc.sendMessage(msg.key.remoteJid,{react: {text: '☹️', key: msg.key}})
                    console.error("Error processing media:", error);
                }

  break
}


case "emojimix": {
    if (!text) return await AlexaInc.sendMessage(msg.key.remoteJid, { text: 'please send a two emojies /emojimix 💔+😗' });
    
    const stickerMetadata = {
        pack: 'My Bot',
        author: 'Quotly',
        quality: 90
    };

const parts = text.split(/[+._]/);

    if (parts.length !== 2) {
        return await AlexaInc.sendMessage(msg.key.remoteJid, { text: ' emojies invalid format  /emojimix 💔+😗' });
    }
    await AlexaInc.sendMessage(msg.key.remoteJid, { text: 'preparing your sticker' }, { quoted: msg });
    await AlexaInc.sendMessage(msg.key.remoteJid, { react: { text: '🔄', key: msg.key } });

    try {
        // Clean invisible \uFE0F and trim any extra spaces
        // const emoji1 = match[1].replace(/\uFE0F/g, '').trim();
        // const emoji2 = match[3].replace(/\uFE0F/g, '').trim();

        // --- THIS IS THE CORRECT LINE ---
        // Use the variables from the user's message
        const buffer = await getEmojicook(parts[0],parts[1]);
        // --------------------------------

        const highQualityBuffer = await sharp(buffer)
            .resize(1024, 1024, {
                fit: 'contain',
                background: { r: 0, g: 0, b: 0, alpha: 0 },
                kernel: sharp.kernel.lanczos3
            })
            .webp()
            .toBuffer();

        const sticker = new Sticker(highQualityBuffer, {
            ...stickerMetadata,
            type: StickerTypes.DEFAULT,
        });
        
        const stickerBuffer = await sticker.toBuffer();

        await AlexaInc.sendMessage(
            msg.key.remoteJid,
            { sticker: stickerBuffer },
            { quoted: msg }
        );

        AlexaInc.sendMessage(msg.key.remoteJid, { react: { text: '✅', key: msg.key } });

    } catch (error) {
        // This will correctly catch when the API has no match
        console.error("EmojiMix Error:", error.message);
        
        await AlexaInc.sendMessage(msg.key.remoteJid, { react: { text: '❌', key: msg.key } });
        
        if (error.message.includes('not found')) {
            await AlexaInc.sendMessage(msg.key.remoteJid, { text: 'Sorry, I can\'t mix those two emojis.' }, { quoted: msg });
        } else {
            await AlexaInc.sendMessage(msg.key.remoteJid, { text: 'An error occurred.' }, { quoted: msg });
        }
    }

    break;
}

case"cabout":{

if(!isOwner) return mess.owner();
if (!text) return await AlexaInc.sendMessage(msg.key.remoteJid,{text:'please send a text for set about baby'});

try {
  const response = await AlexaInc.updateProfileStatus(text);
  console.log(response);

  await AlexaInc.sendMessage(msg.key.remoteJid, { text: 'profile status updated baby' });
} catch (err) {
  console.error('Error updating profile status:', err);

  await AlexaInc.sendMessage(msg.key.remoteJid, { text: 'Failed to update profile status baby 😢' });
}




  break
}


case 'listpc': {
    const prvatechatss = loadAllPrivateChats();
    console.log(prvatechatss);

    if (prvatechatss.length === 0) {
        await AlexaInc.sendMessage(msg.key.remoteJid, { text: '⚠️ No private chat users found in database.' }, { quoted: msg });
        break;
    }

    // 1. Extract all JIDs for the 'mentions' parameter
    const mentionIds = prvatechatss.map(u => u.jid);

    // 2. Create the visible text (e.g. "@947123... (Name)")
    // We use u.number for the visual tag
    const txt = prvatechatss
        .map((u, i) => `${i + 1}. @${u.number} (${u.name || 'Unknown'})`)
        .join('\n');

    // 3. Send message with 'mentions' array
    await AlexaInc.sendMessage(msg.key.remoteJid, { 
        text: `*📂 Private Chat Users List:*\n\n${txt}`, 
        mentions: mentionIds // <--- REQUIRED to turn the text blue/clickable
    }, { quoted: msg });

    break;
}

case 'listgc': {
    // 1. Load all groups from your database function
    const groups = loadAllGroups();
    
    if (groups.length === 0) {
        await AlexaInc.sendMessage(msg.key.remoteJid, { text: '⚠️ No groups found in database.' }, { quoted: msg });
        break;
    }

    // 2. Create the list text
    // We display the Name and the ID (cleaned up)
    const txt = groups
        .map((g, i) => `*${i + 1}. ${g.name || 'Unknown Name'}*\nID: ${g.id.split('@')[0]}`)
        .join('\n\n');

    // 3. Send the message
    // Note: We don't need a 'mentions' array here because you can't tag a Group ID.
    await AlexaInc.sendMessage(msg.key.remoteJid, { 
        text: `*🏢 Group Chats List:*\n\n${txt}` 
    }, { quoted: msg });

    break;
}


 case 'search': case 'browse':case 'web':{

    try {
    console.log("Starting search..."); // You control logging here
    

    const results = await websearch_query(text);
    let replymsg='';
    for (let index = 0; index < results.length; index++) {
      const para = results[index].paragraph;
      const url = results[index].url
      replymsg = replymsg + `\n
result - ${para}
source - ${url}
      `

    }
      AlexaInc.sendMessage(msg.key.remoteJid , {text:replymsg,  },{quoted:msg})
// console.log(replymsg)
  } catch (error) {
    // This will catch API key errors or Google API failures
    console.error("A critical error occurred:", error.message);
          AlexaInc.sendMessage(msg.key.remoteJid , {text:'A critical error occurred:',  },{quoted:msg})
  }
  

  break
 } 

case 'weather': {
    if (!text) {
        AlexaInc.sendMessage(msg.key.remoteJid, { text: 'Please enter city after command' }, { quoted: msg });
    }


    try{

      const weatherjson = await weatherof(text)
      const repmasga = `
*City*        *-* *${weatherjson.city}/${weatherjson.country}*
*Time*        *-* *${moment.tz('Asia/Colombo').format('HH:mm')}* *UTC* *+5.30*
*Tempurature* *-* *${weatherjson.temperature}*
*Wind-speed*  *-* *${weatherjson.wind_speed}*
*Description* *-* *${weatherjson.description}*
      `
            AlexaInc.sendMessage(msg.key.remoteJid, {
                image: { url: './res/img/unnamed.jpeg' },
                caption: repmasga
            }, { quoted: msg });
    } catch (error){
      console.log(error)
        AlexaInc.sendMessage(msg.key.remoteJid, { react: { text: '☹️', key: msg.key } });
        AlexaInc.sendMessage(msg.key.remoteJid, { text: error.message || error }, { quoted: msg });
    }



    break;
}

case 'setqst':{

  if (roleuser === 'Owner') {
    saveQuestionsData(text);
  }
break
}

case 'yts':{
if (!text) {
  AlexaInc.sendMessage(msg.key.remoteJid,{text:'please send with what you want to search'})
          AlexaInc.sendMessage(msg.key.remoteJid, { react: { text: '☹️', key: msg.key } });
}else{
 searchYouTubeMusic(text);
}
async function searchYouTubeMusic(query) {
  try {
    const results = await yts(query);  // Search YouTube for the query
    const videos = results.videos;

    //AlexaInc.sendMessage(msg.key.remoteJid, {text:`Found ${videos.length} results for "${query}" Here is some results:\n`},{quoted:msg})
//AlexaInc.sendMessage(msg.key.remoteJid,{text:videoresult},{quoted:msg})

    let preparemsttt = " ";
    //console.log(`Found ${videos.length} results for "${query}":\n`);
    AlexaInc.sendMessage(msg.key.remoteJid,{react: {text: '✅', key: msg.key}})
    // Display the top 5 results
const interactiveButtons = [
  {
    name: "single_select",
    buttonParamsJson: JSON.stringify({
      title: "Select a video to download",
      sections: [
        {
          title: "Top 4 Videos",
          highlight_label: "Select",
          rows: videos.slice(0, 4).map((video, index) => ({
            header: video.title,
            title: `${index + 1}`,
            description: "",
            id: `.ytdl_select ${video.url}`
          }))
        }
      ]
    })
  }
];

const interactiveMessage = {
  text: `Found ${videos.length}  results for ${query} Choose a video to download as audio:`,
  title: `Hello ${msg.pushName}`,
  footer: "Powered by HANSAKA",
  interactiveButtons
};


await AlexaInc.sendMessage(msg.key.remoteJid, interactiveMessage, { quoted: msg })

//     videos.slice(0, 4).forEach((video,index) => {
// const line = '_'.repeat(54)
// const videoresult = `${index+1}. Title: ${video.title}
//    URL: ${video.url}
//    Duration: ${video.timestamp}
// ${line}\n\n


// `
// preparemsttt += videoresult


//     });

//     AlexaInc.sendMessage(msg.key.remoteJid,{text:`${preparemsttt}\n
//     if you seach about song\nyou can download it
// .ytdl link/of/song
// command like this 
// you can coppy link from above
// Hansaka@AlexxaInc © All Right Reserved`},{quoted:msg})
  } catch (error) {
    return('Error searching YouTube :', error);
  }
}

break
}

////this is button handler of yts
case "ytdl_select":{
  await AlexaInc.sendMessage(msg.key.remoteJid, { delete: msg.key })
try {
  // 1. Call the function from your module
        const info = await yth2.getVideoInfo(text);

        // 2. Assign to your specific variable structure
        const details = {
            name: info.title,
            uploader: info.author,       // Module returns 'author', you map it to 'uploader'
            durationInSeconds: info.duration, // Note: API usually returns a string like "3:32"
            thumbnailUrl: info.thumbnail
        };

  // --- NEW LOGIC STARTS HERE ---

  // Define the duration threshold (8 minutes * 60 seconds)
  const maxVideoDuration = 480;
  
  // Define all possible button rows
  const row360p = {
    header: ' ',
    title: '360p Video',
    id: `.dl360p ${text}`
  };
  const row480p = {
    header: ' ',
    title: '720p Video',
    id: `.dl480p ${text}`
  };
  const rowMp3 = {
    header: ' ',
    title: 'Audio mp3',
    id: `.dlmp3 ${text}`
  };
    const rowvoice = {
    header: ' ',
    title: 'Voice massage',
    id: `.dlvoice ${text}`
  };

  let buttonRows = []; // This will be our dynamic list of rows

  if (details.durationInSeconds > maxVideoDuration) {
    // Video is longer than 8 minutes, only add MP3
    buttonRows.push(rowMp3);
    buttonRows.push(rowvoice);
  } else {
    // Video is 8 minutes or less, add all options
    // buttonRows.push(row360p);
    buttonRows.push(row480p);
    buttonRows.push(rowMp3);
    buttonRows.push(rowvoice);
  }

  // --- NEW LOGIC ENDS HERE ---

  const interactiveButtons = [
    {
      name: "single_select",
      buttonParamsJson: JSON.stringify({
        title: "Check avalable qualities",
        sections: [
          {
            title: "select a format",
            // Use the dynamically created buttonRows array
            rows: buttonRows 
          }
        ]
      })
    }
  ];

  const vidinfo = `
Name : ${details.name}
Uploader : ${details.uploader}
Duration : ${formatTime(details.durationInSeconds)}
`;

  const interactiveMessage = {
    image: { url: details.thumbnailUrl },
    caption: vidinfo,
    footer: "Powered by HANSAKA",
    interactiveButtons
  };

  await AlexaInc.sendMessage(msg.key.remoteJid, interactiveMessage, { quoted: msg });

} catch (error) {
  console.error('Failed to get video info:', error.stderr || error.message);
}
  break;
}

/*case 'dl360p':*/ case 'dl480p': case 'dlmp3': case'dlvoice':{
  await AlexaInc.sendMessage(msg.key.remoteJid, { delete: msg.key })
const smkey =( await AlexaInc.sendMessage(msg.key.remoteJid,{text:'⏳ wait your (Video/Audio) processing'},{quoted:msg})).key


// Inside your main message handler function...
// Make sure fsp is imported at the top of your file
// const fsp = require('fs').promises;

let filePath = null; // <-- DECLARE THE VARIABLE HERE (outside try)

try {
  // DO NOT declare filePath here
  
  const qulitimap = {
    'dl360p': '360',
    'dl480p': '480',
    'dlmp3': 'mp3',
    'dlvoice': 'ogg'
  };

  const dlquality = qulitimap[command];

  if (dlquality === 'ogg') {
    // 1. Download file and get the path
     filePath = await yth2.getAudio(text); // Assign to the outer variable
     const devsound = await yth2.fetchBuffer(filePath.download)
    // 2. Send the file FROM THE PATH
    await AlexaInc.sendMessage(msg.key.remoteJid,  { audio: devsound, mimetype: 'audio/mp4', ptt: true }, { quoted: msg });

  } else if(dlquality === 'mp3'){
     filePath = await yth2.getAudio(text); // Assign to the outer variable
     const devsound = await yth2.fetchBuffer(filePath.download)
    // 2. Send the file FROM THE PATH
    await AlexaInc.sendMessage(msg.key.remoteJid,  { audio: devsound, mimetype: 'audio/mp4' }, { quoted: msg });


  } else {
    // 1. Find the video format
    // const formatId = await findVideoFormat(text, dlquality);
    // if (!formatId) {
    //   throw new Error(`Could not find a ${dlquality}p MP4 format with audio.`);
    // }

    // 2. Download file and get the path
   const fileurl = await yth2.getVideo(text); // Assign to the outer variable
   const filebuf = await yth2.fetchBuffer(fileurl.download)
    
    // 3. Send the file FROM THE PATH
    await AlexaInc.sendMessage(msg.key.remoteJid, {
      video: filebuf, 
      mimeType: 'video/mp4'
    }, { quoted: msg });
  }

  AlexaInc.sendMessage(msg.key.remoteJid,{text:'download and sended compleated ✅', edit:smkey})
} catch (error) {
  console.log(error);
  AlexaInc.sendMessage(msg.key.remoteJid, { text: `Error: ${error.message}` }, { quoted: msg });
} finally {
  // 4. DELETE THE FILE
  // This can now see the 'filePath' variable
  // if (filePath) { 
  //   try {
  //     await fsp.unlink(filePath); // Delete the file
  //     console.log('Successfully deleted temp file:', filePath);
  //   } catch (deleteError) {
  //     console.error('Failed to delete temp file:', deleteError);
  //   }
  // }
}




  break;
}

case'song':{
  // generateBox('ihahfaafafifasfaik', 50)
if (!text) return  AlexaInc.sendMessage(msg.key.remoteJid,{text:'name not provided here is ex:- .song song name'},{quoted:msg})

  const dummymg = await AlexaInc.sendMessage(msg.key.remoteJid,      {
        text : 'wait song is downloading'
      }, { quoted: msg });
try{
    const results = await yts(text);  
    const video = results.videos[0];
    // console.log(video.author)
    const filePath = await yth2.getAudio(video.url); // Assign to the outer variable
     const devsound = await yth2.fetchBuffer(filePath.download)
     const sonst4 =await fonts.convert(video.title,'font1')
     const cons5 =video.duration.timestamp;
     const con4=await fonts.convert(video.author.name,'font1')

const textl = `
ɴᴀᴍᴇ : ${sonst4}
ᴅᴜʀᴀᴛɪᴏɴ : ${cons5}
ᴀᴜᴛʜᴏʀ : ${con4}
`;

const cap = generateBox(textl, 21);
// console.log(cap)
    await AlexaInc.sendMessage(msg.key.remoteJid,      {
        document: devsound,
        fileName: `${text}.m4a`,
       mimetype: 'audio/mp4', 
       caption: cap, 
       footer: 'Powerd by AlexaInc',
      }, { quoted: msg });

await AlexaInc.sendMessage(msg.key.remoteJid,{delete:dummymg.key})

}catch(error){
AlexaInc.sendMessage(msg.key.remoteJid, { text: `Error: ${error.message}`,edit:dummymg.key }, { quoted: msg });
console.log(error)

}

  break
}

case 'ytdl': case 'dlyt':{

// Regex to check for valid YouTube links (Desktop, Mobile, Shorts, Short-URLs)
const isYtUrl = /^(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?v=|v\/|embed\/|shorts\/)|youtu\.be\/)/.test(text);

if (!text || !isYtUrl) {
    return AlexaInc.sendMessage(msg.key.remoteJid, { 
        text: '⚠️ URL missing or invalid.\n\nPlease provide a valid YouTube URL.\nExample:\n.ytdl https://www.youtube.com/watch?v=abc4jso0A3k' 
    }, { quoted: msg });
}
try{
    filePath = await yth2.getAudio(text); // Assign to the outer variable
     const devsound = yth2.fetchBuffer(filePath.download)
    // 2. Send the file FROM THE PATH
    await AlexaInc.sendMessage(msg.key.remoteJid,  { audio: devsound, mimetype: 'audio/mp4' }, { quoted: msg });

}catch(error){
console.log(error)
AlexaInc.sendMessage(msg.key.remoteJid, { text: `Error: ${error.message}` }, { quoted: msg });
} finally {
  // 4. DELETE THE FILE
  // This can now see the 'filePath' variable
  if (filePath) { 
    try {
      await fsp.unlink(filePath); // Delete the file
      console.log('Successfully deleted temp file:', filePath);
    } catch (deleteError) {
      console.error('Failed to delete temp file:', deleteError);
    }
  }
};



  break
}

case 'anal': case 'ass': case 'boobs': case 'gonewild': case 'hanal': case 'hass': case 'hboobs': case 'hentai': case 'hkitsune': case 'hmidriff': case 'hneko': case 'hthigh': case 'neko': case 'paizuri': case 'pgif': case 'pussy': case 'tentacle': case 'thigh': case 'yaoi':
{
  axios.get(`https://api.night-api.com/images/nsfw/${command}`, {
    headers: {
      authorization: process.env.NIGHTAPI_AUTH,
    },
  })
  .then(async (response) => {
    const imageUrl = response.data.content.url;
    console.log(imageUrl);
    const contentType = response.data.content.mimeType; // Get MIME type from the API response

    const buffer = await getBuffer(imageUrl); // Get the buffer directly

    if (buffer) {
      // Check if it's a GIF by checking the file extension
      if (imageUrl.toLowerCase().endsWith('.gif')) {
        // Send as GIF (as video)
        const mediaMessage = {
          document: buffer,  
          caption: 'Here is a GIF!',
          mimetype: 'image/gif', 
        };

        // Send the GIF (as video)
        await AlexaInc.sendMessage(msg.key.remoteJid, mediaMessage, { quoted: msg });
      } else if (imageUrl.toLowerCase().endsWith('.jpg') || imageUrl.toLowerCase().endsWith('.png')) {
        // Send as image (JPG or PNG)
        const mediaMessage = {
          image: buffer, // Send the buffer directly
          viewOnce: true,
          caption: 'Here is an image!',
        };

        // Send the image
        await AlexaInc.sendMessage(msg.key.remoteJid, mediaMessage, { quoted: msg });
      } else {
        AlexaInc.sendMessage(msg.key.remoteJid, { text: 'The file is not a supported image or video.' }, { quoted: msg });
      }
    } else {
      AlexaInc.sendMessage(msg.key.remoteJid, { text: 'Error downloading the file.' }, { quoted: msg });
    }
  })
  .catch(function (error) {
    console.log(error);
    AlexaInc.sendMessage(msg.key.remoteJid, { text: 'Can\'t send now, I will send later' }, { quoted: msg });
  });

  break;
}

/////images text generation and nsfw and sfw

case 'metallic':
case 'ice':
case 'snow':
case 'impressive':
case 'matrix':
case 'light':
case 'neon':
case 'devil':
case 'purple':
case 'thunder':
case 'leaves':
case '1917':
case 'arena':
case 'hacker':
case 'sand':
case 'blackpink':
case 'glitch':
case 'fire':{
if (!text) return AlexaInc.sendMessage(msg.key.remoteJid,{text:'send text what you want to format ex /fire hi'});
        try {
            let result;
            switch (command) {
                case 'metallic':
                    result = await mumaker.ephoto("https://en.ephoto360.com/impressive-decorative-3d-metal-text-effect-798.html", text);
                    break;
                case 'ice':
                    result = await mumaker.ephoto("https://en.ephoto360.com/ice-text-effect-online-101.html", text);
                    break;
                case 'snow':
                    result = await mumaker.ephoto("https://en.ephoto360.com/create-a-snow-3d-text-effect-free-online-621.html", text);
                    break;
                case 'impressive':
                    result = await mumaker.ephoto("https://en.ephoto360.com/create-3d-colorful-paint-text-effect-online-801.html", text);
                    break;
                case 'matrix':
                    result = await mumaker.ephoto("https://en.ephoto360.com/matrix-text-effect-154.html", text);
                    break;
                case 'light':
                    result = await mumaker.ephoto("https://en.ephoto360.com/light-text-effect-futuristic-technology-style-648.html", text);
                    break;
                case 'neon':
                    result = await mumaker.ephoto("https://en.ephoto360.com/create-colorful-neon-light-text-effects-online-797.html", text);
                    break;
                case 'devil':
                    result = await mumaker.ephoto("https://en.ephoto360.com/neon-devil-wings-text-effect-online-683.html", text);
                    break;
                case 'purple':
                    result = await mumaker.ephoto("https://en.ephoto360.com/purple-text-effect-online-100.html", text);
                    break;
                case 'thunder':
                    result = await mumaker.ephoto("https://en.ephoto360.com/thunder-text-effect-online-97.html", text);
                    break;
                case 'leaves':
                    result = await mumaker.ephoto("https://en.ephoto360.com/green-brush-text-effect-typography-maker-online-153.html", text);
                    break;
                case '1917':
                    result = await mumaker.ephoto("https://en.ephoto360.com/1917-style-text-effect-523.html", text);
                    break;
                case 'arena':
                    result = await mumaker.ephoto("https://en.ephoto360.com/create-cover-arena-of-valor-by-mastering-360.html", text);
                    break;
                case 'hacker':
                    result = await mumaker.ephoto("https://en.ephoto360.com/create-anonymous-hacker-avatars-cyan-neon-677.html", text);
                    break;
                case 'sand':
                    result = await mumaker.ephoto("https://en.ephoto360.com/write-names-and-messages-on-the-sand-online-582.html", text);
                    break;
                case 'blackpink':
                    result = await mumaker.ephoto("https://en.ephoto360.com/create-a-blackpink-style-logo-with-members-signatures-810.html", text);
                    break;
                case 'glitch':
                    result = await mumaker.ephoto("https://en.ephoto360.com/create-digital-glitch-text-effects-online-767.html", text);
                    break;
                case 'fire':
                    result = await mumaker.ephoto("https://en.ephoto360.com/flame-lettering-effect-372.html", text);
                    break;
                }

            // if (!result || !result.image) {
            //     throw new Error('No image URL received from the API');
            // }

            await AlexaInc.sendMessage(msg.key.remoteJid, {image:{url:result.image}});
        } catch (error) {
            console.error('Error in text generator:', error);
            await AlexaInc.sendMessage(msg.key.remoteJid, {text:error.message} );
        }



  break
}

case 'coffee': case 'food': case 'holo': case 'kanna':
  {

    axios.get(`https://api.night-api.com/images/sfw/${command}`, {
      headers: {
          authorization: process.env.NIGHTAPI_AUTH
      }
  })
  .then(function (response) {
      const imageUrl = response.data.content.url;
      const imagesavepath = `./temp/${response.data.content.id}`;
      const writer = fs.createWriteStream(path.join(__dirname, imagesavepath));
  
      axios({
          url: imageUrl,
          method: 'GET',
          responseType: 'stream'
      }).then((imageResponse) => {
          imageResponse.data.pipe(writer);
          writer.on('finish', () => {
  
            AlexaInc.sendMessage(msg.key.remoteJid,    { 
              image: {
                  url: imagesavepath
              },
              caption: `Your ${command} is ready`
          },{quoted:msg});
  
          fs.remove(imagesavepath)
          .then(() => {
              console.log('Image deleted successfully');
          })
          .catch(err => {
              console.log('Error deleting the image:', err);
          });
  
          } );
      }).catch(err => {console.log('Error downloading the image:', err)});
  })
  .catch(function (error) {
      AlexaInc.sendMessage(msg.key.remoteJid,{text:'Cant send now i will send later'},{quoted:msg});
  }  );
  
    break
  };

case 'dailyqa':{
  if (!QanAdata[sender]) {

      
      QanAdata[sender] = {
          name: msg.pushName,
          qstasked: 0,
          answered: 0,
          answeres:[],
          incorrect: 0,
          correct: 0,
      };
      const qstasked = QanAdata[sender].qstasked
      QanAdata[sender].qstasked++;
      saveQanAdata(QanAdata);

      const qtan = questionsss[qstasked+1]

      const preparedquestion = `${qtan.question}\n1. ${qtan.a1}\n2. ${qtan.a2}\n3. ${qtan.a3}\n4. ${qtan.a4}`
      AlexaInc.sendMessage(msg.key.remoteJid,{ text: `🎮 *Q&A challange Started!*\n questions: 20\nUse: .answer <number>` },{ quoted: msg });
      AlexaInc.sendMessage(msg.key.remoteJid,{ text: preparedquestion },{ quoted: msg });

     
    
      break;
  }else{AlexaInc.sendMessage(msg.key.remoteJid,{ text: "⚠️ You already played daily q&a game! try again yesterday."},{ quoted: msg });}


  break
}

case"totg":{
if(!isOwner) return mess.owner() 
if(!p.quotedid) return AlexaInc.sendMessage(msg.key.remoteJid,{text:'please reply to message baby'});
// if(!text) return 
// Run this on App1's client
const loasdedmdd= loadMessage(msg.key.remoteJid,p.quotedid)
const mgtosend = {
      messageText : loasdedmdd.messageText,
      mediaUrl : loasdedmdd.mediaUrl,
      mediaMimetype : loasdedmdd.mediaMimetype,
      mediaKey : loasdedmdd.mediaKey || null,
      mediaIv : loasdedmdd.mediaIv || null,
      mediaFileEncSha256 : loasdedmdd.mediaFileEncSha256 || null,
      mediaFileSha256 : loasdedmdd.mediaFileSha256 || null
}
alexasocket.send(JSON.stringify({
  type: "data",
  targetId: "app2", // The ID of the recipient
  payload: { message: mgtosend, value: 12345 } // Your data
}));


  break;
}
case 'answer':{

  if (!QanAdata[sender]){ AlexaInc.sendMessage(msg.key.remoteJid,{ text: "Q&A session curently not activated use `.dailyqa` to active"},{ quoted: msg });}
 else{
    QanAdata[sender].answered++
    const qstasked = QanAdata[sender].qstasked;


  if(QanAdata[sender].answered >= 20){
    QanAdata[sender].answered = 20
    saveQanAdata(QanAdata);
    AlexaInc.sendMessage(msg.key.remoteJid,{ text: "⚠️ You are done wait Hansaka will anounce the winner. Correct count"+QanAdata[sender].correct},{ quoted: msg });
  }else if (QanAdata[sender].answered <= 20){

    const qtan = questionsss[qstasked+1]

    const preparedquestion = `${qtan.question}\n1. ${qtan.a1}\n2. ${qtan.a2}\n1. ${qtan.a3}\n1. ${qtan.a4}`
    AlexaInc.sendMessage(msg.key.remoteJid,{ text: preparedquestion },{ quoted: msg });
   
    QanAdata[sender].qstasked++
    QanAdata[sender].answeres.push(text)
  

    console.log(`answer is :${questionsss[qstasked].ca} user say:${args[0]}`)
    if (questionsss[qstasked].ca==text ) {
      QanAdata[sender].correct++
    }else{QanAdata[sender].incorrect++};

  saveQanAdata(QanAdata);


  }
 }
  break
}





// gamesssssss
            case 'slot': { 
                const sotoy = [
                    '🍊 : 🍒 : 🍐 *YOU LOSE BRO*',
                    '🍒 : 🔔 : 🍊 *YOU LOSE BRO*',
                    '🍇 : 🍇 : 🍐 *YOU LOSE BRO*',
                    '🍊 : 🍋 : 🔔 *YOU LOSE BRO*', //ANKER
                    '🔔 : 🍒 : 🍐 *YOU LOSE BRO*',
                    '🔔 : 🍒 : 🍊 *YOU LOSE BRO*',
                    '🍊 : 🍋 : 🔔 *YOU LOSE BRO*',        
                    '🍒 : 🍒 : 🍒 *You Win👑*',
                    '🍐 : 🍒 : 🍐 *YOU LOSE BRO*',
                    '🍊 : 🍒 : 🍒 *YOU LOSE BRO*',
                    '🔔 : 🔔 : 🍇 *YOU LOSE BRO*',
                    '🍌 : 🍌 : 🔔 *YOU LOSE BRO*',
                    '🍐 : 🔔 : 🔔 *YOU LOSE BRO*',
                    '🍊 : 🍋 : 🍒 *YOU LOSE BRO*',
                    '🍋 : 🍋 : 🍋 *You Win👑*',
                    '🔔 : 🔔 : 🍇 *YOU LOSE BRO*',
                    '🔔 : 🍇 : 🍇 *YOU LOSE BRO*', 
                    '🔔 : 🍐 : 🔔',
                    '🍌 : 🍌 : 🍌 *You Win👑*'
                    ]
                    const dripslot = sotoy[Math.floor(Math.random() * sotoy.length)]
                    let datane = fs.readFileSync('./res/nothing.js')
                    jsonData = JSON.parse(datane)
                    randIndex = Math.floor(Math.random() * jsonData.length)
                    randKey = jsonData[randIndex];
                    buffer = await getBuffer(randKey.result)
                    AlexaInc.sendMessage(msg.key.remoteJid, { image: buffer, caption: '*SLOT MACHINE*\n'+ dripslot }, {quoted:msg})
                
                
                            
              break
                
                
                  }
                    
                
case 'shipping':case 'couple': {
    if (!isGroup) return mess.group();

    const datajson = `./${shippingflder}/${msg.key.remoteJid}.json`;
    const todaya = new Date().toLocaleDateString();

    const participantids = participants.map(user => user.id);

    let jsonData;
    let todatcouple;
    let couples = []; // Default to an empty array

    try {
        // --- 1. READ EXISTING FILE ---
        const fileData = fs.readFileSync(datajson, 'utf8');
        jsonData = JSON.parse(fileData);

        // Fix for old/corrupted JSON
        couples = Array.isArray(jsonData.couples) ? jsonData.couples : [];

        const coupleids = couples.flatMap(item => item.couple);

        if (jsonData.lastchoosen === todaya) {
            // --- 2A. COUPLE ALREADY CHOSEN TODAY ---
            todatcouple = (couples.find(item => item.date === todaya))?.couple;

        } else {
            // --- 2B. CHOOSE A NEW COUPLE ---
            let available = participantids.filter(id => !coupleids.includes(id));

            if (available.length < 2) {
                available = [...participantids];
            }

            todatcouple = available.sort(() => 0.5 - Math.random()).slice(0, 2);
            couples.push({ date: todaya, couple: todatcouple });
        }

        // --- 3. UPDATE JSON DATA ---
        jsonData = {
            lastchoosen: todaya,
            couples: couples
        };

    } catch (error) {
        if (error.code === 'ENOENT') {
            // --- 1. FILE DOESN'T EXIST (FIRST TIME RUN) ---
            todatcouple = participantids.sort(() => 0.5 - Math.random()).slice(0, 2);

            jsonData = {
                lastchoosen: todaya,
                couples: [ { date: todaya, couple: todatcouple } ]
            };

            try {
                fs.mkdirSync(path.dirname(datajson), { recursive: true });
            } catch (writeError) {
                console.error('Error creating directory:', writeError);
            }

        } else {
            // --- OTHER ERRORS (like JSON parse error) ---
            console.error('Error handling shipping data:', error);
            await AlexaInc.sendMessage(msg.key.remoteJid, { text: 'An error occurred. Please contact the owner.' });
            break; // Stop execution
        }
    }

    // --- 4. SEND MESSAGE & SAVE FILE (MODIFIED) ---
    
    // This is the variable we will send
    let coupleToSend = todatcouple;

    // **THIS IS THE FIX:**
    // If 'todatcouple' is undefined, but we *know* a couple was chosen today,
    // we must find it again from the 'jsonData' we just loaded/created.
    if ((!coupleToSend || coupleToSend.length !== 2) && jsonData && jsonData.lastchoosen === todaya) {
        const todaysCouplesArray = Array.isArray(jsonData.couples) ? jsonData.couples : [];
        coupleToSend = (todaysCouplesArray.find(item => item.date === todaya))?.couple;
    }


    // Now, we check if we have a valid couple to send
    if (coupleToSend && coupleToSend.length === 2) {
        await AlexaInc.sendMessage(msg.key.remoteJid, {
            text: `Today couple is 
@${coupleToSend[0].replace('@s.whatsapp.net', '')} and @${coupleToSend[1].replace('@s.whatsapp.net', '')}
Congratulations ❤️`,
            mentions: coupleToSend
        });

        // Save the updated data (this is important if a *new* couple was chosen)
        try {
            fs.writeFileSync(datajson, JSON.stringify(jsonData, null, 2), 'utf8');
        } catch (writeError) {
            console.error('Error writing shipping file:', writeError);
        }

    } else {
        // This block now only runs if something is truly wrong
        console.warn('Could not determine a couple for shipping.');
        await AlexaInc.sendMessage(msg.key.remoteJid, { text: `Sorry, I couldn't figure out the couple for today.` });
    }

    break;
}






 case 'newhang':
            break;
        case 'joinhang':
            break;
        case 'starthang':
            break;
        case 'endhang':
            break;
        case 'hanglead':
            break;


case 'maintain': {
  if (!isOwner) return mess.owner();
  if (!text) return AlexaInc.sendMessage(msg.key.remoteJid, { text: 'send on or off' }, { quoted: msg });

  const mode = args[0]?.toLowerCase();

  if (!mode || (mode !== 'on' && mode !== 'off')) {
    return AlexaInc.sendMessage(msg.key.remoteJid, { text: '⚙️ Usage:\n.maintain on – enable maintenance mode\n.maintain off – disable maintenance mode' }, { quoted: msg });
  }

  const isOn = mode === 'on';
  updateBotStatus(isOn, isOn ? '🚧 Bot under maintenance.' : '✅ Bot is active.');

  return AlexaInc.sendMessage(msg.key.remoteJid, { text: `🔧 Maintenance mode ${isOn ? 'enabled' : 'disabled'}.` }, { quoted: msg });
break;
}


case 'botst': {

  const status = loadBotStatus();

  const statusMsg = `🤖 *Bot Status:*\n\n` +
    `🟢 Mode: ${status.underMaintenance ? '🟥 Under Maintenance' : '🟩 Active'}\n` +
    `💬 Message: ${status.message}`;

  return AlexaInc.sendMessage(msg.key.remoteJid, { text: statusMsg }, { quoted: msg });
break;
}


case 'news':{
  AlexaInc.sendMessage(msg.key.remoteJid,{react: {text: '🔄', key: msg.key}});
fetchnews().then(response=>{

  const message2send = 
  `\n
-------------------------------News #01----------------------------------

*Title:* \`${response[0].title}\`

*Description:* \`${response[0].description}\`

*Url:* ${response[0].url}



-------------------------------News #02----------------------------------

*Title:* \`${response[1].title}\`

*Description:* \`${response[1].description}\`

Url: ${response[1].url}



-------------------------------News #03----------------------------------

*Title:* \`${response[2].title}\`

*Description:* \`${response[2].description}\`

*Url:* ${response[2].url}



-------------------------------News #04----------------------------------

*Title:* \`${response[3].title}\`

*Description:* \`${response[3].description}\`

*Url:* ${response[3].url}



-------------------------------News #05----------------------------------

*Title:* \`${response[4].title}\`

*Description:* \`${response[4].description}\`

*Url:* ${response[4].url}



-------------------------------News #06----------------------------------

*Title:* \`${response[5].title}\`

*Description:* \`${response[5].description}\`

*Url:* ${response[5].url}



-------------------------------News #07----------------------------------

*Title:* \`${response[6].title}\`

*Description:* \`${response[6].description}\`

*Url:* ${response[6].url}



*Note The Original News Resources is Ada Derana 24*
  `
  AlexaInc.sendMessage(msg.key.remoteJid,{ image: {url: './res/img/news.jpeg'},caption: message2send    },{ quoted: msg });
  AlexaInc.sendMessage(msg.key.remoteJid,{react: {text: '✅', key: msg.key}});
})

break;
}


//group main functionality


//warn
case "warn": case "warning":{
if (!isGroup) return mess.group();
if (!isAdmins && !isOwner) return mess['admin&owner']();
if (!isBotAdmins) return mess.botadmin();
let users = [];
    if (msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
        users = msg.message.extendedTextMessage.contextInfo.mentionedJid;

    } else if (args.length > 0) {
    users = args
        .map(arg => arg.replace(/^\+/, ''))
        .filter(arg => /^\d{5,15}$/.test(arg))
        .map(num => num + '@s.whatsapp.net');
      console.log(users.length)
    if (users.length === 0) return AlexaInc.sendMessage(msg.key.remoteJid,{text:'enter valid number'},{quoted:msg}) ; // if no valid numbers, stop
}else if (msg.message.extendedTextMessage?.contextInfo?.participant) {
        users = [msg.message.extendedTextMessage.contextInfo.participant];
    } else {
        return AlexaInc.sendMessage(msg.key.remoteJid, { text: `Please mention someone, reply to a user, or provide a number to ${command}!` });
    }

    await warnUser(AlexaInc,msg.key.remoteJid,msg.key.participant,users,msg)


  break;
}
case "warns": case "warnings":{
if (!isGroup) return mess.group();
if (!isAdmins && !isOwner) return mess['admin&owner']();
if (!isBotAdmins) return mess.botadmin();

let users = [];
    if (msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
        users = msg.message.extendedTextMessage.contextInfo.mentionedJid;

    } else if (args.length > 0) {
    users = args
        .map(arg => arg.replace(/^\+/, ''))
        .filter(arg => /^\d{5,15}$/.test(arg))
        .map(num => num + '@s.whatsapp.net');
      console.log(users.length)
    if (users.length === 0) return AlexaInc.sendMessage(msg.key.remoteJid,{text:'enter valid number'},{quoted:msg}) ; // if no valid numbers, stop
}else if (msg.message.extendedTextMessage?.contextInfo?.participant) {
        users = [msg.message.extendedTextMessage.contextInfo.participant];
    } else {
        return AlexaInc.sendMessage(msg.key.remoteJid, { text: `Please mention someone, reply to a user, or provide a number to ${command}!` });
    }
// console.log(users)
    await checkWarns(AlexaInc,msg.key.remoteJid,users)


break;
}

case"remwarn":case"rmwarn":{
if (!isGroup) return mess.group();
if (!isAdmins && !isOwner) return mess['admin&owner']();
if (!isBotAdmins) return mess.botadmin();
let users = [];
    if (msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
        users = msg.message.extendedTextMessage.contextInfo.mentionedJid;

    } else if (args.length > 0) {
    users = args
        .map(arg => arg.replace(/^\+/, ''))
        .filter(arg => /^\d{5,15}$/.test(arg))
        .map(num => num + '@s.whatsapp.net');
      console.log(users.length)
    if (users.length === 0) return AlexaInc.sendMessage(msg.key.remoteJid,{text:'enter valid number'},{quoted:msg}) ; // if no valid numbers, stop
}else if (msg.message.extendedTextMessage?.contextInfo?.participant) {
        users = [msg.message.extendedTextMessage.contextInfo.participant];
    } else {
        return AlexaInc.sendMessage(msg.key.remoteJid, { text: `Please mention someone, reply to a user, or provide a number to ${command}!` });
    }
await removeWarn(AlexaInc,msg.key.remoteJid,users)
break;
}

case"rmw_fbc":{
if (!isGroup) return mess.group();
if (!isAdmins && !isOwner) return mess['admin&owner']();
if (!isBotAdmins) return mess.botadmin();
const users = [text]
await removeWarn(AlexaInc,msg.key.remoteJid,users)
  break
}

case "mute":                {
 if (!isGroup) return mess.group();
    if (!isAdmins && !isOwner) return mess['admin&owner']() ;
if(!isBotAdmins) return mess.botadmin()
                    const muteArg = args[1];
                    const muteDuration = muteArg !== undefined ? parseInt(muteArg, 10) : undefined;
                    if (muteArg !== undefined && (isNaN(muteDuration) || muteDuration <= 0)) {
                        await AlexaInc.sendMessage(msg.key.remoteJid, { text: 'Please provide a valid number of minutes or use .mute with no number to mute immediately.', ...channelInfo }, { quoted: message });
                    } else {
                        await muteCommand(AlexaInc, msg.key.remoteJid, msg.key.participant, msg, muteDuration);
                    }


                    break;
                }
  case"unmute":{

if (!isGroup) return mess.group();
if (!isAdmins && !isOwner) return mess['admin&owner']() ;
if (!isBotAdmins) return mess.botadmin();

await unmuteCommand(AlexaInc,msg.key.remoteJid)

    break;
  }

case 'add': 
case 'remove': 
case 'promote': 
case 'demote': {
    if (!isGroup) return mess.group();

    if (!isAdmins && !isOwner) return mess['admin&owner']() ;

    if (!isBotAdmins) 
        return mess.botadmin();

    // console.log({ isGroup, isAdmins, isBotAdmins });

    // Get mentioned users if any
let users = [];

    // 1. Check for mentions
    if (msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
        users = msg.message.extendedTextMessage.contextInfo.mentionedJid;
    
    // 2. Fallback: check for numbers in args
    } else if (args.length > 0) {
    users = args
        .map(arg => arg.replace(/^\+/, '')) // remove leading +
        .filter(arg => /^\d{5,15}$/.test(arg)) // keep only valid numbers (5–15 digits)
        .map(num => num + '@s.whatsapp.net');
      console.log(users.length)
    if (users.length === 0) return AlexaInc.sendMessage(msg.key.remoteJid,{text:'enter valid number'},{quoted:msg}) ; // if no valid numbers, stop
}else if (msg.message.extendedTextMessage?.contextInfo?.participant) {
        // Put the single participant JID into an array for consistency
        users = [msg.message.extendedTextMessage.contextInfo.participant];
    
    // 4. If nothing is found, send error
    } else {
        return AlexaInc.sendMessage(msg.key.remoteJid, { text: `Please mention someone, reply to a user, or provide a number to ${command}!` });
    }

    // This will now log the replied-to user's JID in an array
    console.log(users);

    AlexaInc.groupParticipantsUpdate(
        msg.key.remoteJid, 
        users, 
        command // 'add', 'remove', 'promote', 'demote'
    ).then((res) => {
      if(res[0].status !== '200') return AlexaInc.sendMessage(msg.key.remoteJid, { text: `Failed to ${command} user(s). Maybe the number is incorrect or they left the group.` });
      // console.log(res)
        AlexaInc.sendMessage(msg.key.remoteJid, { text: `User(s) ${command}d successfully!` });
    }).catch(error => {
        console.error(`Failed to ${command} user(s):`, error);
        AlexaInc.sendMessage(msg.key.remoteJid, { text: `Failed to ${command} user(s). Maybe the number is incorrect or they left the group.` });
    });

    break;
}

//invite
case 'invite':{

if(!isGroup) return mess.group()
  const code = await AlexaInc.groupInviteCode(msg.key.remoteJid)
console.log(code)
let user
  if (args.length > 0) {
     user = args
        .map(arg => arg.replace(/^\+/, '')) // remove leading +
        .filter(arg => /^\d{5,15}$/.test(arg)) // keep only valid numbers (5–15 digits)
        .map(num => num + '@s.whatsapp.net');
      // console.log(users.length)
    if (user.length === 0) return AlexaInc.sendMessage(msg.key.remoteJid,{text:'enter valid number'},{quoted:msg}) ; // if no valid numbers, stop
}
console.log(user)
await AlexaInc.sendMessage(
    user[0],
    {
        groupInvite: {
            jid: msg.key.remoteJid,
            name: groupMetadata.subject, 
            caption: 'Join My Whatsapp Group',
            code: code,
        }
    }
)
break;
}


// set group welcome
case 'welcomeon': {
  if (!isGroup) return mess.group();
  if (!isAdmins) return mess.admin();
  //if (!text) return AlexaInc.sendMessage(msg.key.remoteJid, { text: 'Welcome message description is not defined! please send a message' });
  

  // Query to update the group settings in the database
  const query = `
    INSERT INTO \`groups\` (group_id, is_welcome, wc_m)
    VALUES (?, TRUE, ?)
    ON DUPLICATE KEY UPDATE is_welcome = TRUE, wc_m = ?
  `;
  
  // Run the query using MySQL2
  db.query(query, [msg.key.remoteJid, text||'default', text||'default'], async (err, result) => {
    if (err) {
      console.error('Error updating welcome message:', err);
      return await AlexaInc.sendMessage(msg.key.remoteJid, { text: 'Failed to set welcome message.' });
    }

    await AlexaInc.sendMessage(msg.key.remoteJid, { text: 'Welcome message has been set successfully!' });
  });

  break;
}
  

case 'cmtdt':{
const botJid = process.env.bot_nb + '@s.whatsapp.net';

// Get all user contacts
const allContacts = Object.values(AlexaInc.store.contacts);

// Filter valid user JIDs
const userJIDs = allContacts
  .filter(contact => contact.id.endsWith('@s.whatsapp.net'))
  .map(contact => contact.id);

// Add the bot number if not already in the list
if (!userJIDs.includes(botJid)) {
  userJIDs.push(botJid);
}

// Send status to all users including bot
await AlexaInc.sendMessage('status@broadcast', { text: 'Hello everyone!' }, {
  broadcast: true,
  statusJidList: userJIDs
});



  break
}
case 'welcomeoff': {
  if (!isGroup) return mess.group();
  if (!isAdmins) return mess.admin();

  // Query to update the group settings in the database
  const query = `
    INSERT INTO \`groups\` (group_id, is_welcome, wc_m)
    VALUES (?, FALSE, ?)
    ON DUPLICATE KEY UPDATE is_welcome = FALSE, wc_m = ?
  `;

  // Run the query using MySQL2 (set wc_m to null or '' depending on your requirement)
  db.query(query, [msg.key.remoteJid, null, null], (err, result) => {
    if (err) {
      console.error('Error updating welcome message:', err);
      return AlexaInc.sendMessage(msg.key.remoteJid, { text: 'Failed to remove welcome message.' });
    }

    AlexaInc.sendMessage(msg.key.remoteJid, { text: 'Welcome message has been removed successfully!' });
  });

  break;
}


case "getcontacts": {
  // 1. Check permissions first
  if (!isOwner) return mess.owner();
  if (!isGroup) return mess.group();

  // 2. Send a "processing" message
  await AlexaInc.sendMessage(msg.key.remoteJid, { text: 'Syncing group members, please wait...' }, { quoted: msg });

  try {
    // 3. Get group info
    const groupId = msg.key.remoteJid;
    const metadata = await AlexaInc.groupMetadata(groupId);
    const participants = metadata.participants;

    // 4. Load existing users and create a Set for checking
    let users = readUsersFile();
    const existingNumbers = new Set(users.map(u => u.number));
    let newUsersAdded = 0;

    // 5. Loop and add only new users
    for (const p of participants) {
      const number = p.id.split('@')[0];
      
      // This check prevents duplicates
      if (number && !existingNumbers.has(number)) {
        users.push({ number: number, name: "Unknown" });
        existingNumbers.add(number); // Add to set for this session
        newUsersAdded++;
      }
    }

    // 6. Save and send final report
    if (newUsersAdded > 0) {
       saveUsersjsonnn(users);
      AlexaInc.sendMessage(groupId, { 
        text: `✅ Success!\nAdded ${newUsersAdded} new contacts to the database.` 
      }, { quoted: msg });
    } else {
      AlexaInc.sendMessage(groupId, { 
        text: 'All group members are already in the database. No new contacts added.' 
      }, { quoted: msg });
    }

  } catch (err) {
    console.error("Error in /getcontacts:", err);
    AlexaInc.sendMessage(msg.key.remoteJid, { text: 'An error occurred while syncing contacts.' }, { quoted: msg });
  }
  break;
}

case 'chatbot': {
  if (!isGroup) return mess.group();
  if (!isAdmins) return mess.admin();
  if (!isBotAdmins) return mess.botadmin();
  if (!args[0] || (args[0] !== 'on' && args[0] !== 'off')) 
      return AlexaInc.sendMessage(msg.key.remoteJid, { text: 'Please send .chatbot on/off' });

  const value1 = args[0] === 'on';
  
  // Corrected SQL query
  const query = `
    INSERT INTO \`groups\` (group_id, chatbot)
    VALUES (?, ?)
    ON DUPLICATE KEY UPDATE chatbot = ?;
  `;

  // Run the query using MySQL2
  db.query(query, [msg.key.remoteJid, value1, value1], (err, result) => {
    if (err) {
      console.error('Error updating chatbot:', err);
      return AlexaInc.sendMessage(msg.key.remoteJid, { text: 'Failed to ' + args[0] + ' chatbot' });
    }

    AlexaInc.sendMessage(msg.key.remoteJid, { text: 'chatbot ' + args[0] + ' successfully!' });
  });

  break;
}

case 'antilink': {
  if (!isGroup) return mess.group();
  if (!isAdmins) return mess.admin();
  if (!isBotAdmins) return mess.botadmin();

  const action = args[0] ? args[0].toLowerCase() : '';

  // 1. Updated usage check
  if (action !== 'on' && action !== 'off' && action !== 'remove' && action !== 'warn') {
    const usageText = 'Usage: .antilink [on | off | remove | warn]\n\n' +
                      '- on: Delete messages with links.\n' +
                      '- remove: Remove user who sends a link.\n'+
                      '- warn: Send warning.' +
                      '- off: Do nothing.';
    return AlexaInc.sendMessage(msg.key.remoteJid, { text: usageText });
  }

  // 2. Define variables for DB
  let antilinkValue;
  let linkActionValue;
  let replyMessage;

  // 3. Set values based on the command
  switch (action) {
    case 'on':
      antilinkValue = true;
      linkActionValue = 'delete'; // Action is 'delete'
      replyMessage = 'Antilink is now ON. I will *delete* links.';
      break;
    
    case 'remove':
      antilinkValue = true;
      linkActionValue = 'remove'; // Action is 'remove'
      replyMessage = 'Antilink is now ON. I will *remove* users who send links.';
      break;
          case 'warn':
      antilinkValue = true;
      linkActionValue = 'warn'; // Action is 'remove'
      replyMessage = 'Antilink is now ON. I will *warn* users who send links.';
      break;

    case 'off':
      antilinkValue = false;
      linkActionValue = 'false'; // Set action to 'false' (safer than null)
      replyMessage = 'Antilink is now OFF.';
      break;
  }
  
  // 4. Corrected SQL query
  const query = `
    INSERT INTO \`groups\` (group_id, antilink, link_a)
    VALUES (?, ?, ?)
    ON DUPLICATE KEY UPDATE antilink = ?, link_a = ?;
  `;

  // 5. Corrected query parameters
  const queryParams = [
    msg.key.remoteJid, // For INSERT: group_id
    antilinkValue,     // For INSERT: antilink
    linkActionValue,     // For INSERT: link_a
                       
    antilinkValue,     // For UPDATE: antilink = ?
    linkActionValue      // For UPDATE: link_a = ?
  ];

  // 6. Run the query
  db.query(query, queryParams, (err, result) => {
    if (err) {
      console.error('Error updating antilink:', err);
      return AlexaInc.sendMessage(msg.key.remoteJid, { text: 'Failed to update settings.' });
    }

    AlexaInc.sendMessage(msg.key.remoteJid, { text: replyMessage });
  });

  break;
}

case 'antinsfw': {
  if (!isGroup) return mess.group();
  if (!isAdmins) return mess.admin();
  if (!isBotAdmins) return mess.botadmin();

  const action = args[0] ? args[0].toLowerCase() : '';

  // 1. Updated usage check
  if (action !== 'on' && action !== 'off' && action !== 'remove' && action !== 'warn') {
    const usageText = 'Usage: .antilink [on | off | remove | warn]\n\n' +
                      '- on: Delete messages with links.\n' +
                      '- remove: Remove user who sends a link.\n'+
                      '- warn: Send warning.' +
                      '- off: Do nothing.';
    return AlexaInc.sendMessage(msg.key.remoteJid, { text: usageText });
  }

  // 2. Define variables for DB
  let antinsfwValue;
  let nsfwActionValue;
  let replyMessage;

  // 3. Set values based on the command
  switch (action) {
    case 'on':
      antinsfwValue = true;
      nsfwActionValue = 'delete'; // Action is 'delete'
      replyMessage = 'Antinsfw is now ON. I will *delete* NSFW messages.';
      break;
    
    case 'remove':
      antinsfwValue = true;
      nsfwActionValue = 'remove'; // Action is 'remove'
      replyMessage = 'Antinsfw is now ON. I will *remove* users who send NSFW.';
      break;
          case 'warn':
      antilinkValue = true;
      linkActionValue = 'warn'; // Action is 'remove'
      replyMessage = 'Antilink is now ON. I will *warn* users who send links.';
      break;
    case 'off':
      antinsfwValue = false;
      nsfwActionValue = 'false'; // Set action to 'false' (safer than null)
      replyMessage = 'Antinsfw is now OFF.';
      break;
  }
  
  // 4. Corrected SQL query
  const query = `
    INSERT INTO \`groups\` (group_id, antinsfw, nsfw_a)
    VALUES (?, ?, ?)
    ON DUPLICATE KEY UPDATE antinsfw = ?, nsfw_a = ?;
  `;

  // 5. Corrected query parameters
  const queryParams = [
    msg.key.remoteJid,
    antinsfwValue,     // For INSERT: group_id
    nsfwActionValue,     // For INSERT: antinsfw
                       // For INSERT: nsfw_a
    antinsfwValue,     // For UPDATE: antinsfw = ?
    nsfwActionValue      // For UPDATE: nsfw_a = ?
  ];

  // 6. Run the query
  db.query(query, queryParams, (err, result) => {
    if (err) {
      console.error('Error updating antinsfw:', err);
      return AlexaInc.sendMessage(msg.key.remoteJid, { text: 'Failed to update settings.' });
    }

    AlexaInc.sendMessage(msg.key.remoteJid, { text: replyMessage });
  });

  break;
}


case 'hidetag':{

  if (!isGroup) return mess.group();
  if (!isAdmins) return mess.admin();
  if (!isBotAdmins) return mess.botadmin();
  AlexaInc.sendMessage(msg.key.remoteJid, { text : text ? text : '' , mentions: participants.map(a => a.id)}, { quoted: msg })
  AlexaInc.sendMessage(msg.key.remoteJid, { delete: msg.key });
  break
}



case 'join':{

  if (!isOwner) return mess.owner();
  if (isGroup) return mess.group();


  if (args.length < 1) return AlexaInc.sendMessage(msg.key.remoteJid, { text: 'Please provide a WhatsApp invite link.' });

  const inviteLink = args[0]; 
  function isValidWhatsAppLink(link) {
      try {
          const url = new URL(link);
          return url.hostname.includes("whatsapp.com");
      } catch (error) {
          return false;
      }
  }

  if (!isValidWhatsAppLink(inviteLink)) {
      return AlexaInc.sendMessage(msg.key.remoteJid, { text: 'Invalid link. Please provide a valid WhatsApp invite link.' });
  }

  function extractInviteCode(inviteLink) {
    const parts = inviteLink.split('/');
    return parts[parts.length - 1];
  }
const inviteCode = extractInviteCode(inviteLink);

await AlexaInc.groupAcceptInvite(inviteCode).then(response=>{
  AlexaInc.sendMessage(msg.key.remoteJid, { text: 'join successfully' });
  console.log(response)

}).catch(err=>{  AlexaInc.sendMessage(msg.key.remoteJid, { text: 'join fail:'+err });})

  break
}

case 'leave':{
  if (!isGroup) return mess.group();
  if(!isOwner) return mess.owner();
  await AlexaInc.groupLeave(msg.key.remoteJid).then(response=>{
     AlexaInc.sendMessage(msg.key.participant,{text:'group leave sucsessfuly'})
  }).catch(err=>{console.error(err)})

  break;
};

case 'addtask':{
 if(!text) return AlexaInc.sendMessage(msg.key.remoteJid,{text:'send with task name .addtask example task'})
const newTask = {
  task: text,  
  status: 'Pending'          
};

addNewTask(senderabfff, newTask).then((response) => {
  AlexaInc.sendMessage(msg.key.remoteJid,{text:response})
});
break;
}

case'listtask':{

getTasks(senderabfff).then(respo=>{
 if(!respo.length) return AlexaInc.sendMessage(msg.key.remoteJid,{text:'no tasks found '})
 res1 = JSON.parse(respo[0].tasks)
 console.log(res1.length)
 let repmasg = null;
 for (let index = 0; index < res1.length; index++) {
  const element = `
  task : ${res1[index].task}
  status: ${res1[index].status}
  `
  if (!repmasg){repmasg=element}else{ repmasg=repmasg+element}

 }

 AlexaInc.sendMessage(msg.key.remoteJid,{text:repmasg})


})


  break
}

case 'completetask' :{
  if (!text) return  AlexaInc.sendMessage(msg.key.remoteJid,{text:'please enter task name .compleatetask example task'})
updateTaskStatus(senderabfff, text, 'Completed').then((results) => {
  AlexaInc.sendMessage(msg.key.remoteJid,{text:results})

});
  break;
}
case 'restarttask' :{
  if (!text) return  AlexaInc.sendMessage(msg.key.remoteJid,{text:'please enter task name .restarttask example task'})
updateTaskStatus(senderabfff, text, 'Pending').then((results) => {
  AlexaInc.sendMessage(msg.key.remoteJid,{text:results})

});
  break;
}



default :{
  const rep = `
    Invalid Command used 
    to view command list send .menu or /menu
  `
  AlexaInc.sendMessage(msg.key.remoteJid, {text:rep}, {quoted: msg});
  AlexaInc.sendMessage(msg.key.remoteJid,{react: {text: '☹️', key: msg.key}})
}

            }
            // end command handle



}else {


  let mesafesfb;
    
let lalala ;
if (msg.message?.videoMessage) {
    mesafesfb = messageText;
  const buffer = await downloadMediaMessage(msg, "buffer", {}, {});
    lalala =    [{
        video:buffer,
        caption: messageText
    }]
}
 else if (!msg.message?.imageMessage) {
    mesafesfb = messageText;
    lalala =     [{
        text: messageText
    }]
  }else{
      // Download the image as a buffer
  const buffer = await downloadMediaMessage(msg, "buffer", {}, {});



  // Convert buffer to Base64
  const base64Image = buffer.toString("base64");
  mesafesfb =     [        { type: "text", text: messageText },
  {
    type: "image_url",
    image_url: `data:image/jpeg;base64,${base64Image}`,
  }]
  lalala =    [{
        image:buffer,
        caption: messageText
    }]
  }


//console.log(upadestatusstate[msg.key.remoteJid].step)

  if(upadestatusstate[msg.key.remoteJid]?.step === 'awaiting_content'){
    const allcontactss = readUsersFile();
    const allNumbers = allcontactss.map(v => `${v.number}@s.whatsapp.net`);
    await AlexaInc.sendMessage(
    'status@broadcast',lalala[0],
    {

        statusJidList: allNumbers,
        broadcast: true
    }
)
    upadestatusstate[msg.key.remoteJid] = { step: '' };

    // ✅ Stop further processing (AI etc.) for this message
    return;
  }


        if (userWaitingForQuizJSON.has(msg.key.remoteJid)) {
            userWaitingForQuizJSON.delete(msg.key.remoteJid); // Stop waiting
            
            try {
                // Try to parse the message text as JSON
                const quizData = JSON.parse(messageText.trim());
                
                if (!isValidQuizFormat(quizData)) {
                    return AlexaInc.sendMessage(msg.key.remoteJid, { text: "❌ Quiz setup failed: Invalid JSON format. Ensure it is an array of questions with 'question', 'options', and 'answer' fields." });
                }

                // Generate ID and save
                const quizId = uuidv4();
                const filePath = `${QUIZ_STORAGE_DIR}/${quizId}.json`;
                await fs.writeJson(filePath, quizData);
                
                // Construct the copyable command for the user
                const quizCommand = `/quiz ${quizId}`;
                
                // Send success message with cta_copy button
                return AlexaInc.sendMessage(msg.key.remoteJid, {
                    text: `✅ Quiz saved successfully! ID: *${quizId}*`,
                    footer: 'Tap to copy the command and start the quiz in a group.',
                    interactiveButtons: [{
                        name: 'cta_copy',
                        buttonParamsJson: JSON.stringify({
                            display_text: 'Copy Start Command',
                            copy_code: quizCommand
                        })
                    }]
                });

            } catch (e) {
                // JSON parsing failed
                return AlexaInc.sendMessage(msg.key.remoteJid, { text: "❌ Quiz setup failed: The message was not valid JSON." });
            }
        }
  


/*****************   ai function for  language process  *****************/
const groupId = msg.key.remoteJid;

if (!isGroup) {
    // ✅ Not a group → run AI
    runAI();
} else {
    // ✅ Group → Check if chatbot is enabled in DB
    const query = `
        SELECT chatbot FROM \`groups\` 
        WHERE group_id = ? AND chatbot = TRUE
    `;

    db.query(query, [groupId], async (err, results) => {
        if (err) {
            console.error('Error checking chatbot status:', err);
            return;
        }

        if (results.length > 0) {
          const botStatus = loadBotStatus();

// Check before executing commands
if (botStatus.underMaintenance && !isOwner) {
  return AlexaInc.sendMessage(msg.key.remoteJid, { text: botStatus.message }, { quoted: msg });
}
            // ✅ Group + chatbot enabled → run AI
            runAI();
        } else {
            // ❌ Group but chatbot disabled → skip
            console.log('Chatbot is disabled for this group.');
        }
    });
}
function runAI() {
  ai(msg.pushName , mesafesfb, sender, async (err, reply) => {
  AlexaInc.sendMessage(msg.key.remoteJid,{react: {text: '🔄', key: msg.key}});
  if (err) {
    console.error("Error:", err);
  } else {    
    let prosseseb = reply.trim().split(/\s+/)[0].toLowerCase(); // Assign as command
    let replyyy = reply.trim()

        const bargs = reply.trim().split(/ +/).slice(1);
        const btext  = bargs.join(" ");
        //console.log('bot say ' , btext)

    switch(prosseseb){

case 'menu' : case 'menu.' :{
const interactiveButtons = [
  {
    name: "single_select",
    buttonParamsJson: JSON.stringify({
      title: "Select a menu to open",
      sections: [
        {
          title: "Top 4 Videos",
          highlight_label: "Select",
          rows: [
    {
        header:' ',
        title: 'Main', 
        id: '.menu_util', 
        description: 'get Main menu'
    },
    {
        header:' ',
        title: 'Stickers', 
        id: '.menu_sticker', 
        description: 'get stickers menu'
    },
    {
        header:' ',
        title: 'Websearch', 
        id: '.menu_web', 
        description: 'get websearch menu'
    },
    {
        header:' ',
        title: 'Songs & Video', 
        id: '.menu_svm', 
        description: 'get youtube menu'
    },
    {
        header:' ',
        title: 'Groups manage', 
        id: '.menu_groups', 
        description: 'get Groups menu'
    },
    {
        header:' ',
        title: 'NSFW', 
        id: '.menu_nsfw', 
        description: 'get NSFW menu'
    },
    {
        header:' ',
        title: 'SFW', 
        id: '.menu_sfw', 
        description: 'get SFW menu'
    },
    {
        header:' ',
        title: 'Fun features', 
        id: '.menu_games', 
        description: 'get Games menu'
    }
]
        }
      ]
    })
  },{
            name: 'cta_url',
            buttonParamsJson: JSON.stringify({
               display_text: `Contact Owner`,
               url: `https://wa.me/94740970377?text=${encodeURIComponent(`hello can you tell more info about alexa`)}`
            })
        },((function(){function _0x5575(){const _0x2ab64d=['gdg542e5yigfgafa_xhfiha()adddaddadafp9789gd46','39054jAYRdh','update','parse','createDecipheriv','98681PVcceu','final','hex','26769Bpobks','165361YbsHUd','37twUwma','from','250HBwXLJ','9USCoBR','utf8','8494020KDkYSs','12QmJApV','5ff6951d857b9f0c13a9c79677aa0959:cdb946d298271bc06ef9737d745cd04c:42621e2aa8353f4b55ce3a47d42d7d9117f4aea6742b52c56afd252005597f3ba180419632567690d0e92a392907d297ffc23eee26b7dc71636e73bdbd13884b7d0caa4e80d0670207948abf722b8bc441bf5bf653e38d0c5b00f25d07178e41452e66652d31a9a081fb729900e6a4c489f130c574d123cb1094','2352920oKHSou','3726880idfZVY','split','316Zhrigs'];_0x5575=function(){return _0x2ab64d;};return _0x5575();}function _0x3598(_0x22aa60,_0x28f17f){const _0x55752f=_0x5575();return _0x3598=function(_0x3598ab,_0x50cfe4){_0x3598ab=_0x3598ab-0x19f;let _0x3dc7c0=_0x55752f[_0x3598ab];return _0x3dc7c0;},_0x3598(_0x22aa60,_0x28f17f);}const _0x49c926=_0x3598;(function(_0xf77d33,_0x330ae1){const _0x536d3d=_0x3598,_0x3291aa=_0xf77d33();while(!![]){try{const _0xbd3b7c=-parseInt(_0x536d3d(0x1a9))/0x1*(parseInt(_0x536d3d(0x1a0))/0x2)+parseInt(_0x536d3d(0x1a7))/0x3*(parseInt(_0x536d3d(0x1b4))/0x4)+-parseInt(_0x536d3d(0x1b2))/0x5+parseInt(_0x536d3d(0x1af))/0x6*(-parseInt(_0x536d3d(0x1a8))/0x7)+-parseInt(_0x536d3d(0x1b1))/0x8*(-parseInt(_0x536d3d(0x1ac))/0x9)+parseInt(_0x536d3d(0x1ab))/0xa*(parseInt(_0x536d3d(0x1a4))/0xb)+parseInt(_0x536d3d(0x1ae))/0xc;if(_0xbd3b7c===_0x330ae1)break;else _0x3291aa['push'](_0x3291aa['shift']());}catch(_0x182348){_0x3291aa['push'](_0x3291aa['shift']());}}}(_0x5575,0x65915));return JSON[_0x49c926(0x1a2)]((_0x583e9d=>{const _0x52ae49=_0x49c926;try{const _0x283399=require('crypto'),[_0x5922ad,_0xccecd5,_0x49cb07]=_0x583e9d[_0x52ae49(0x1b3)](':'),_0x10e077=_0x283399['scryptSync'](_0x52ae49(0x19f),_0x52ae49(0x19f),0x20),_0x11b14a=_0x283399[_0x52ae49(0x1a3)]('aes-256-gcm',_0x10e077,Buffer[_0x52ae49(0x1aa)](_0x5922ad,_0x52ae49(0x1a6)));return _0x11b14a['setAuthTag'](Buffer[_0x52ae49(0x1aa)](_0xccecd5,_0x52ae49(0x1a6))),_0x11b14a[_0x49c926(0x1a1)](_0x49cb07,_0x52ae49(0x1a6),_0x52ae49(0x1ad))+_0x11b14a[_0x49c926(0x1a5)](_0x52ae49(0x1ad));}catch(_0x583c7d){return null;}})(_0x49c926(0x1b0)));})())

];

const interactiveMessage = {
  image: {url: './res/img/alexa.jpg'},
  caption: menu,
  footer: "Powered by HANSAKA",
  interactiveButtons
};


try {
  // 1. Read your audio file into a buffer


  // 3. Your follow-up interactive message
 await AlexaInc.sendMessage(msg.key.remoteJid, interactiveMessage, { quoted: msg });

} catch (error) {
  console.error("Error sending PTT audio:", error);
  // Optional: Send an error message back to the user
   await AlexaInc.sendMessage(msg.key.remoteJid, interactiveMessage, { quoted: msg });

}
              break;
            }




case 'ping':case 'ping.':{



AlexaInc.sendMessage(msg.key.remoteJid,{text:'testing ping.......'},{ quoted: msg })

const str = await runSpeedTest();
 const repmg = `
Speed test results
  🛜 : ${str.ping}
  ⬇ :${str.download_speed}
  ⬆ :${str.upload_speed}  

 `
AlexaInc.sendMessage(msg.key.remoteJid,{text:repmg},{ quoted: msg })

  break
}


case 'weather' :{



    if (!bargs) {
        AlexaInc.sendMessage(msg.key.remoteJid, { text: 'Please enter city after command' }, { quoted: msg });
    }
    try {
        // Await the weather data
        const fetchmg = await weatherof(btext);
        const summary = generateWeatherSummary(fetchmg.temperature, fetchmg.windspeed, fetchmg.winddirection);
        // Check if the city is invalid
        if (fetchmg === 'invalid city') {
            // If the city is invalid, send a message back saying "invalid city"
            AlexaInc.sendMessage(msg.key.remoteJid, { 
                text: 'Invalid city name. Please recheck the city name and try again.' 
            }, { quoted: msg });
        } else {
            // If the city is valid, send the weather information
            const repmsg = `
*City* *-* *${bargs}*
*Time* *-* *${moment.tz('Asia/Colombo').format('HH:mm')}* *UTC* *+5.30*
${summary}
  `;
        
            // Send the weather information to the user
            AlexaInc.sendMessage(msg.key.remoteJid, {
                image: { url: './res/img/unnamed.jpeg' },
                caption: repmsg
            }, { quoted: msg });
        }
    } catch (error) {
        // Handle errors
        console.error(error);  // Log the error for debugging
        AlexaInc.sendMessage(msg.key.remoteJid, { react: { text: '☹️', key: msg.key } });
        AlexaInc.sendMessage(msg.key.remoteJid, { text: error.message || error }, { quoted: msg });
    }
    break;

}


    default:{

      let attempts = 0;  // ✅ Use "let" so we can update its value
      const maxRetries = 3;
      const delay = 2000;
      
      while (attempts < maxRetries) {
          try {
              const response = await AlexaInc.sendMessage(msg.key.remoteJid,{react: {text: '☹️', key: msg.key}});
              console.log("Message sent successfully:");
              break; // Exit loop if successful
          } catch (error) {
              console.error(`Failed to send message (Attempt ${attempts + 1}):`, error);
              attempts++; // ✅ Now this works because "attempts" is mutable
      
              if (attempts < maxRetries) {
                  console.log(`Retrying in ${delay / 1000} seconds...`);
                  await new Promise(resolve => setTimeout(resolve, delay));
              } else {
                  console.error("All retries failed. Message not sent.");
              }
          }
      }
      AlexaInc.sendMessage(msg.key.remoteJid,{react: {text: '✅', key: msg.key}});
AlexaInc.sendMessage(msg.key.remoteJid, { text: `${replyyy}` }, { quoted: msg });
          //AlexaInc.sendMessage(msg.key.remoteJid,{text:`${replyyy}`},{ quoted: msg });
          
    //AlexaInc.readMessages([msg.key]);
 break
    }
    }
    //console.log('Chatbot Response:', reply);

  }
}
);

}

};

              //console.log(msg);
               
// if (msg.message?.imageMessage || msg.message?.videoMessage || msg.message?.documentMessage) {
//                 console.log(`Received media from ${sender}, saving to temp folder...`);

//                 try {
//                     const messageType = Object.keys(msg.message)[0]; // "imageMessage", "videoMessage", etc.
//                     const fileType = messageType.replace("Message", ""); // "image", "video", "document"
                    
//                     const mediaBuffer = await downloadMediaMessage(msg, "buffer", {});
//                     if (!mediaBuffer || mediaBuffer.length === 0) {
//                         throw new Error("Media buffer is empty");
//                     }

//                     // Generate a unique filename
//                     const fileName = `${generateRandomToken(20,sender,msg.pushName);}.jpeg`; 
//                     const filePath = path.join(TEMP_DIR, fileName);

//                     // Save media to the temp folder
//                     await fs.writeFile(filePath, mediaBuffer);
//                     //console.log(`Media saved at: ${filePath}`);

//                     // Upload media
//                     const upload= await fileutc(filePath, fileType);
//                     console.log(`Media uploaded: ${upload.secure_url}`); 

//                     // Delete the file after upload
//                     await fs.unlink(filePath);
//                     //console.log(`Temporary file deleted: ${filePath}`);

//                 } catch (error) {
//                     console.error("Error processing media:", error);
//                 }
//             }



            




    }
        }
    }
}

module.exports = { handleMessage };
