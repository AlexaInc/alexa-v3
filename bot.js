const fs = require('fs-extra');
const  YtDl  = require('./res/ytdl');  // Import downloadVideo from ytdl file
const USER_DATA_FILE = './users.json';
const fetchnews = require('./res/news');
const yts = require('yt-search');
const{weatherof} = require('./res/js/weather.js')
const hangmanFile = "./hangman.json";
const questionsFile = './dailyQuestions.json';
const QresponsesFile = './dailyqresp.json';
const path = require('path');
const si = require('os');
const axios = require('axios');
const sharp = require('sharp');
const { downloadMediaMessage, proto, prepareWAMessageMedia , getGroupMetadata , generateWAMessageFromContent} = require('@whiskeysockets/baileys');
const { generateLinkPreview } = require("link-preview-js");
//const {generateWAMessageFromContent} = require('@adiwajshing/baileys')
//const { Button, ButtonMessage } = require('@whiskeysockets/baileys').WA_MESSAGE_TYPE;
const { fileutc } = require('./res/js/fu.js');
const {runSpeedTest} = require('./res/js/speed_test.js')
const FormData = require('form-data');
const {websearch_query} = require('./res/web/web')

const chalk = require('kleur');
const TEMP_DIR = path.join(__dirname, 'temp');
//const {ai} = require('./ai')
const { OpenAI } = require("openai");
require('dotenv').config();
const mysql = require("mysql2");

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






















async function handleMessage(AlexaInc, { messages, type }) {

        const botNumber = await AlexaInc.user.id.split(':')[0];
                  
      
    if (type === 'notify') {
      const msg = messages[0];
      // console.log(msg)






        //console.log(botNumber) // console.warn(messages[0])
let sender = msg.key.remoteJid; // Default sender
let senderabfff = msg.key.remoteJid;
const senderdef = msg.key.remoteJid;
// Check if the message is from a group or a broadcast list
if (sender.endsWith('@g.us') || sender.endsWith('@broadcast')) {
    senderabfff = msg.participant || msg.key.participant;
    sender = `${msg.participant || msg.key.participant}@${senderdef}`; // Assign participant ID instead
}
addXP(senderabfff);

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

const isGroup = msg.key.remoteJid.endsWith('@g.us');
const groupMetadata = isGroup ? await AlexaInc.groupMetadata(msg.key.remoteJid).catch(e => {}) : '';
const participants = isGroup ? groupMetadata?.participants || [] : [];
const groupAdmins = participants.filter(p => p.admin === 'admin' || p.admin === 'superadmin');

const isAdmins = isGroup
    ? groupAdmins.some(admin => admin.jid === senderabfff || admin.lid === senderabfff)
    : false;
const groupOwner = isGroup ? groupMetadata.owner : ''
//console.log(botNumber)
const ottffsse = msg.participant || msg.key.participant 
const isBotAdmins = isGroup
    ? groupAdmins.some(admin => admin.jid === (process.env['bot_nb'] + '@s.whatsapp.net') || admin.lid === '279967795560628@lid')
    : false;



function formatUptime(uptime) {
  const seconds = Math.floor(uptime % 60);
  const minutes = Math.floor(uptime / 60) % 60;
  const hours = Math.floor(uptime / 3600) % 24;
  const days = Math.floor(uptime / 86400);
  return `${days} d, ${hours} h, ${minutes} m, ${seconds} s`;
};

const uptimepc = await formatUptime(si.uptime());
const cpuData = await si.cpus()[0].model;
const memTotal = Math.round(await si.totalmem()/1e+9) +' GB' ;
const memUsed = Math.round(((await si.totalmem()- await si.freemem())/1e+9)*100)/100; 
const roleuser = isOwner ? 'Owner' : 'User';
let menu = `╭━━━━━━━━━━━━━━━━━━━━━━━━━━━━╮
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
┃ ✧ ʟᴇᴠᴇʟ: *${getLevel(senderabfff)}*
┃ ✧ ᴅᴀʏ: *${moment.tz('Asia/Colombo').format('dddd')}*,  
┃ ✧ ᴅᴀᴛᴇ: *${moment.tz('Asia/Colombo').format('MMMM Do YYYY')}*  
┃ ✧ ᴛɪᴍᴇ: *${moment.tz('Asia/Colombo').format('HH:mm:ss')}*
┃
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃                     📜  𝗖𝗢𝗠𝗠𝗔𝗡𝗗𝗦 𝗟𝗜𝗦𝗧                       ┃
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃
┃ 🛠 *Utility Commands:*  
┃ ➥ \`.menu\` - Get this menu  
┃ ➥ \`.ping\` - Check bot status  
┃ ➥ \`.weather\` <city> - Get weather info  
┃ ➥ \`.news\` - Get last news info  
┃ ➥ \`.owner\`  - Chat with Owner  
┃
┃ 🖼 *Sticker & Image Commands:*  
┃ ➥ \`.sticker\` - Convert image to sticker  
┃
┃ 🌐 *Web & Search Commands:*  
┃ ➥ \`.web\` - Search on the web  
┃ ➥ \`.browse\` - Search on the web  
┃ ➥ \`.search\` - Search on the web  
┃
┃ 🎥 *YouTube Commands:*  
┃ ➥ .yts - Search YouTube  
┃ ➥ .ytdl - Download MP3 from YouTube   
┃
┃ 👥 *Groups Commands:*   
┃ ➥ \`.add\` - .add 94702368937 97897847134 
┃ ➥ \`.remove\` - .remove also like add  
┃ ➥ \`.promote\` - also like add 
┃ ➥ \`.demote\` - also like add  
┃ ➥ \`.antilink\` - .antilink on/off  
┃ ➥ \`.hidetag\` - .hidetag msg 
┃        this will mention all member of group    
┃ ➥ \`.antinsfw\` - Similer to antilink     
┃ ➥ \`.chatbot\` - Similer to antilink  
┃ ➥ \`.welcomeon\` - to turn on wc msg 
┃ ➥ \`.welcomeoff\` - to turn off wc msg
┃
┃ 🔞 *NSFW Commands:*  
┃ ➥ \`.anal\`                ➥ \`.ass\`  
┃ ➥ \`.boobs\`            ➥ \`.gonewild\`  
┃ ➥ \`.hanal\`              ➥ \`.hass\`  
┃ ➥ \`.hboobs\`          ➥ \`.hentai\`  
┃ ➥ \`.hkitsune\`        ➥ \`.hmidriff\`  
┃ ➥ \`.hneko\`             ➥ \`.hthigh\`  
┃ ➥ \`.neko\`               ➥ \`.paizuri\`  
┃ ➥ \`.pgif\`                 ➥ \`.pussy\`  
┃ ➥ \`.tentacle\`          ➥ \`.thigh\`  
┃ ➥ \`.yaoi\`  
┃
┃ 🌸 *SFW Commands:*  
┃ ➥ \`.coffee\`  
┃ ➥ \`.food\`  
┃ ➥ \`.holo\`  
┃ ➥ \`.kanna\`  
┃ 
┃ 🪀 *Games*     
┃
┃             _*Hangman*_
┃
┃        ➥ \`.hangman\` - to start hangman
┃        ➥ \`.guess\` - to guess letter
┃        ➥ \`.endhangman\` - to end game
┃        ➥ \`.hangmanlb\` - get hangman leaderboard   
┃
┃             _*DailyGiveaway*_
┃
┃        ➥ \`.dailyqa\` - to start Q&A
┃        ➥ \`.answer\` - send answer number
┃
┃
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃                         🎀  𝒜𝐿𝐸𝒳𝒜 - 𝓥3 🎀                         ┃
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃                © 2025 Hansaka @ AlexaInc                   ┃
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯
`;






















        if (!msg.key.fromMe) {

                AlexaInc.readMessages([msg.key]);


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
                ).id ||
                null;

  const messageonlyText = msg.message?.conversation ||
              msg.message?.extendedTextMessage?.text




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



async function checkBadWord(msg, messageText) {
  // Check if it's a group
  if (!isGroup) return false;

  try {
    const query = `SELECT * FROM \`groups\` WHERE group_id = ? AND antinsfw = TRUE`;
    const [results] = await db.promise().query(query, [msg.key.remoteJid]);

    // If the 'antinsfw' setting is enabled for the group
    if (results.length > 0) {
      const messageContent = messageText.toLowerCase(); // Ensure to use the message text for checking

      // Check if any NSFW word exists in the message
      for (let word of nsfwWords) {
        if (messageContent.includes(word)) {
          console.log('NSFW content detected!');
          return true; // NSFW content detected
        }
      }

      // No NSFW content detected
      return false;
    } else {
      // 'antinsfw' setting is not enabled for this group
      return false;
    }
  } catch (err) {
    console.error('Error querying the database:', err);
    return false; // Return false if there's an error
  }
}
async function checkAntiLink(msg,messageText) {
  if (!isGroup) return false;

  try {
    const query = `SELECT * FROM \`groups\` WHERE group_id = ? AND antilink = TRUE`;
    const [results] = await db.promise().query(query, [msg.key.remoteJid]);

    if (results.length > 0) {
      const messageContent = messageText.toLowerCase();

      // Improved regex for detecting real links/domains
      const linkPattern = /\b((https?:\/\/|www\.)[^\s]+|[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(\/[^\s]*)?)\b/gi;

      // Check if message contains a valid link or domain
      if (linkPattern.test(messageContent)) {
        console.log('Link detected!');
        return true;
      }
    }
    return false;
  } catch (err) {
    console.error('Error querying the database:', err);
    return false;
  }
}




// Usage:


if (await checkBadWord(msg, messageText)) {
  if (isAdmins) return AlexaInc.sendMessage(msg.key.remoteJid, { text: 'You are an admin. Lucky You' });
  if (isOwner) return AlexaInc.sendMessage(msg.key.remoteJid, { text: 'You are the Owner. Lucky You' });
  AlexaInc.sendMessage(msg.key.remoteJid, { text: '🚫 NSFW content is not allowed in this group!' });

  AlexaInc.sendMessage(msg.key.remoteJid, { delete: msg.key }).then(response=>{
    AlexaInc.groupParticipantsUpdate(msg.key.remoteJid, [msg.key.participant], 'remove');
  });
  return;
}

// Check for any link (http or https)
if (await checkAntiLink(msg, messageText)) {
  if (isAdmins) return AlexaInc.sendMessage(msg.key.remoteJid, { text: 'You are an admin. Lucky You' });
  if (isOwner) return AlexaInc.sendMessage(msg.key.remoteJid, { text: 'You are the Owner. Lucky You' });
  AlexaInc.sendMessage(msg.key.remoteJid, { text: '🚫 Links are not allowed in this group!' });
  AlexaInc.groupParticipantsUpdate(msg.key.remoteJid, [msg.key.participant], 'remove');
  AlexaInc.sendMessage(msg.key.remoteJid, { delete: msg.key }).then(response=>{
    AlexaInc.groupParticipantsUpdate(msg.key.remoteJid, [msg.key.participant], 'remove');
  });
  return;
}


















              if (msg.key.remoteJid == 'status@broadcast') {

    } else if (firstWord.startsWith(".") || firstWord.startsWith("/") || firstWord.startsWith("\\")) {
        let command = firstWord.slice(1);; // Assign as command



            // command handle
            switch (command){
            case"menu":{




                AlexaInc.sendMessage(msg.key.remoteJid,{ image: {url: './res/img/alexa.jpeg'},caption: menu},{ quoted: msg });

            break}



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

case"sticker":{
              AlexaInc.sendMessage(msg.key.remoteJid,{text:'preparing your sticker'}, {quoted:msg});
              AlexaInc.sendMessage(msg.key.remoteJid,{react: {text: '🔄', key: msg.key}})
                try {
                    const messageType = Object.keys(msg.message)[0]; // "imageMessage", "videoMessage", etc.
                    const fileType = messageType.replace("Message", ""); // "image", "video", "document"
                    
                    const mediaBuffer = await downloadMediaMessage(msg, "buffer", {});
                    if (!mediaBuffer || mediaBuffer.length === 0) {
                        throw new Error("Media buffer is empty");
                    }

                    // Generate a unique filename
                    const fileName = `${generateRandomToken(20,sender,msg.pushName)}`; 
                    const filePath = path.join(TEMP_DIR, `${fileName}.jpeg`);
                    console.log(`image saved${filePath}`)
                    // Save media to the temp folder
                    await fs.writeFile(filePath, mediaBuffer);
                    //console.log(`Media saved at: ${filePath}`);

                    // Upload media
    const imagePath = path.join(TEMP_DIR, `${fileName}.jpeg`); // Path to the image you want to send as a sticker
    const stickerPath = path.join(TEMP_DIR, `${fileName}.webp`); // Path for the output sticker
await convertToSticker(imagePath, stickerPath);
const stickerBuffer = await fs.readFileSync(stickerPath);

    const stickermessage = {
        sticker: {
            url: stickerPath,
        },
    };
    await AlexaInc.sendMessage(msg.key.remoteJid, stickermessage);
    AlexaInc.sendMessage(msg.key.remoteJid,{react: {text: '✅', key: msg.key}})
                    // Delete the file after upload
                    await fs.unlink(imagePath);
                    await fs.unlink(stickerPath);
                    //console.log(`Temporary file deleted: ${filePath}`);

                } catch (error) {
                  AlexaInc.sendMessage(msg.key.remoteJid, {text:'sorry sticker image fail'});
    AlexaInc.sendMessage(msg.key.remoteJid,{react: {text: '☹️', key: msg.key}})
                    console.error("Error processing media:", error);
                }

  break
}


 case 'search': case 'browse':case 'web':{

websearch_query(text).then(async (response) =>{
    //console.log(response)
    const resultweb = await response.join('\n\n\n\t\t');
  AlexaInc.sendMessage(msg.key.remoteJid , {text:resultweb,  },{quoted:msg})
})
  break
 }

case 'weather': {
    if (!text) {
        AlexaInc.sendMessage(msg.key.remoteJid, { text: 'Please enter city after command' }, { quoted: msg });
    }
    try {
        // Await the weather data
        const fetchmg = await weatherof(args);
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
*City* *-* *${args}*
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
            id: `.ytdl ${video.url}`
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

case 'ytdl': case 'dlyt':{

if (!text) { AlexaInc.sendMessage(msg.key.remoteJid,{text:'url not provided here is ex:- .ytdl https://www.youtube.com/watch?v=abc4jso0A3k '},{quoted:msg})} else {handleDownload(text)}

function extractVideoId(url) {
    // Improved regex to capture video ID from YouTube URLs
    const regex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/[^\n\s]+\/|(?:[^\/\n\s]+\/|(?:v|e(?:mbed)?)\/|(?:watch\?v=|(?:e(?:mbed)?\/)?)|(?:\?v%3D|v%3D))([a-zA-Z0-9_-]{11}))|(?:youtu\.be\/([a-zA-Z0-9_-]{11})))/;

    const match = url.match(regex);

    if (match && (match[1] || match[2])) {
        return match[1] || match[2]; // Return the video ID
    } else {
       //console.error('Invalid YouTube URL');
        return null; // Invalid URL
    }
}
async function handleDownload(url) {
    const videoId = extractVideoId(url); // Extract the video ID from the URL
    
    if (!videoId) {
        AlexaInc.sendMessage(msg.key.remoteJid, { text: 'Invalid URL Provided. Here is an example: https://www.youtube.com/watch?v=abc4jso0A3k' }, { quoted: msg });
        return;
    }

    try {
        const result = await YtDl(videoId); // Call downloadVideo function

        if (result[0].downloaded) {
            const { caption, videoPath, data } = result[0];
            //console.log(caption)
            // Ensure the file path is correct
            const videoFilePath = `./temp/${videoId}.mp3`;

            // Check if the file exists using fs-extra
            const fileExists = await fs.pathExists(videoFilePath);
            if (!fileExists) {
                AlexaInc.sendMessage(msg.key.remoteJid, { text: 'Downloaded video file not found.' }, { quoted: msg });
                return;
            }

            // Read the file as a Buffer using fs-extra
            const videoBuffer = await fs.readFile(videoFilePath);

            // Prepare the media object using bailey's API format
            const mediaMessage = {
                document: data,
                fileName:`${caption.Title}.mp3`,
                caption: `\nRes:  ${text}\n\n\n\n~~~Hansaka@AlexxaInc © Reserved~~~`,
                mimetype:'audio/mpeg'
                //gifPlayback: false
            };

            // Send the video using sendMessage
            AlexaInc.sendMessage(msg.key.remoteJid, mediaMessage, { quoted: msg });
            //console.log('Video sent:', videoPath);

            //await fs.remove(videoFilePath);  // Deletes the file
            //console.log('Video file deleted:', videoFilePath);

        } else {
            AlexaInc.sendMessage(msg.key.remoteJid, { text: 'Failed to download video. Check if the URL is correct.' }, { quoted: msg });
            console.error('Failed to download video');
        }
    } catch (error) {
        console.error('Error downloading video:', error);
        AlexaInc.sendMessage(msg.key.remoteJid, { text: 'Error downloading video. Please try again later.' }, { quoted: msg });
    }finally {
        // Delete the file regardless of success or failure
        const videoFilePath = `./temp/${videoId}.mp3`;
        await fs.remove(videoFilePath);
        //console.log('Video file deleted:', videoFilePath);
    }
}

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
  case "hangman": {
    // Starting a new Hangman game
    if (hangmanData[sender]) {
      if (hangmanData[sender].word) {
        AlexaInc.sendMessage(msg.key.remoteJid,{ image: {url: './res/img/hangman.jpeg'},caption: "⚠️ You already have an active game! Use `.guess <letter>` to continue."},{ quoted: msg });


        
      }else{
        let word = hngmnwrds[Math.floor(Math.random() * hngmnwrds.length)];
        hangmanData[sender] = {
            word: word,
            name: msg.pushName,
            guessed: [],
            incorrect: 0,
            maxIncorrect: 6,
            wins: hangmanData[sender]?.wins || 0 // Ensure wins persist
        };
    
        saveHangmanData(hangmanData);
    
        let hiddenWord = "_ ".repeat(word.length).trim();
        AlexaInc.sendMessage(msg.key.remoteJid,{ image: {url: './res/img/hangman.jpeg'},caption: `🎮 *Hangman Started!*\n🔹 Word: ${hiddenWord}\n🔹 Lives: 6\nUse: .guess <letter>` },{ quoted: msg });


       
      }
        break;
    }

    let word = hngmnwrds[Math.floor(Math.random() * hngmnwrds.length)];
    hangmanData[sender] = {
        word: word,
        name: msg.pushName,
        guessed: [],
        incorrect: 0,
        maxIncorrect: 6,
        wins: hangmanData[sender]?.wins || 0 // Ensure wins persist
    };

    saveHangmanData(hangmanData);

    let hiddenWord = "_ ".repeat(word.length).trim();
    AlexaInc.sendMessage(msg.key.remoteJid,{ image: {url: './res/img/hangman.jpeg'},caption: `🎮 *Hangman Started!*\n🔹 Word: ${hiddenWord}\n🔹 Lives: 6\nUse: .guess <letter>` },{ quoted: msg });

    break;
}

case "guess": {
    // Check if the user has an active game
    if (!hangmanData[sender].word) {
      AlexaInc.sendMessage(msg.key.remoteJid,{ image: {url: './res/img/hangman.jpeg'},caption:  "❌ You don't have an active game! Start a new game with `.hangman`" },{ quoted: msg });


        break;
    }

    let game = hangmanData[sender];
    let guess = args[0]?.toLowerCase();

    if (!guess || guess.length !== 1) {
      AlexaInc.sendMessage(msg.key.remoteJid,{ image: {url: './res/img/hangman.jpeg'},caption:  "⚠️ Send a single letter!" },{ quoted: msg });


        break;
    }

    if (game.guessed.includes(guess)) {
      AlexaInc.sendMessage(msg.key.remoteJid,{ image: {url: './res/img/hangman.jpeg'},caption:  "🔄 You already guessed that!" },{ quoted: msg });

        break;
    }

    game.guessed.push(guess);

    if (game.word.includes(guess)) {
        let revealed = game.word.split("").map(letter => game.guessed.includes(letter) ? letter : "_").join(" ");
        saveHangmanData(hangmanData);

        if (!revealed.includes("_")) {
            // Player wins, increase their win count
            hangmanData[sender].wins++; // Increment win count
            saveHangmanData(hangmanData); // Save the updated data with win count
            AlexaInc.sendMessage(msg.key.remoteJid,{ image: {url: './res/img/hangman.jpeg'},caption:  `🎉 You won! The word was: *${game.word}*` },{ quoted: msg });
            // Log game data before deletion
            console.log("Game Data Before Deletion:", hangmanData[sender]);

            // Allow the player to start a new game after winning
            AlexaInc.sendMessage(msg.key.remoteJid, { text: "🎮 You can start a new game by typing .hangman" }, { quoted: msg });

            // Explicitly delete only the game-related data (NOT the win count)
            delete hangmanData[sender].guessed;
            delete hangmanData[sender].incorrect;
            delete hangmanData[sender].word;  // Delete word to start a new game
            saveHangmanData(hangmanData);
        } else {
          AlexaInc.sendMessage(msg.key.remoteJid,{ image: {url: './res/img/hangman.jpeg'},caption:  `✅ Correct!\n🔹 Word: ${revealed}` },{ quoted: msg });
            
           
        }
    } else {
        game.incorrect++;
        saveHangmanData(hangmanData);

        if (game.incorrect >= game.maxIncorrect) {
          AlexaInc.sendMessage(msg.key.remoteJid,{ image: {url: './res/img/hangman.jpeg'},caption:   `💀 Game Over now you death! The word was: *${game.word}*` },{ quoted: msg });
            
      
            // Log game data before deletion
            console.log("Game Data Before Deletion:", hangmanData[sender]);

            // Allow the player to start a new game after losing
            AlexaInc.sendMessage(msg.key.remoteJid, { text: "🎮 You can revive by typing .hangman" }, { quoted: msg });

            // Explicitly delete only the game-related data (NOT the win count)
            delete hangmanData[sender].guessed;
            delete hangmanData[sender].incorrect;
            delete hangmanData[sender].word;  // Delete word to start a new game
            saveHangmanData(hangmanData);
        } else {
          AlexaInc.sendMessage(msg.key.remoteJid,{ image: {url: './res/img/hangman.jpeg'},caption:   `❌ Wrong! Lives left: ${game.maxIncorrect - game.incorrect}`  },{ quoted: msg });
            
        }
    }
    break;
}

case "endhangman": {
    // End an active Hangman game
    if (!hangmanData[sender]) {
      
        AlexaInc.sendMessage(msg.key.remoteJid, { text: "❌ No active game to end!" }, { quoted: msg });
        break;
    }

    // Reset game data but keep win count
    delete hangmanData[sender].guessed;
    delete hangmanData[sender].incorrect;
    delete hangmanData[sender].word;  // Delete word to start a new game
    saveHangmanData(hangmanData);
    AlexaInc.sendMessage(msg.key.remoteJid,{ image: {url: './res/img/hangman.jpeg'},caption:   "🛑 Hangman game ended."  },{ quoted: msg });
           
    break;
}

case "hangmanlb": {
    // Display the leaderboard
    let leaderboardText = getLeaderboard(hangmanData);
    AlexaInc.sendMessage(msg.key.remoteJid,{ image: {url: './res/img/hangman.jpeg'},caption:   leaderboardText  },{ quoted: msg });
     
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
case 'add': 
case 'remove': 
case 'promote': 
case 'demote': {
    if (!isGroup) 
        return AlexaInc.sendMessage(msg.key.remoteJid, { text: 'This is not a group!' });

    if (!isAdmins && !isOwner) 
        return AlexaInc.sendMessage(msg.key.remoteJid, { text: 'You are not an admin or owner!' });

    if (!isBotAdmins) 
        return AlexaInc.sendMessage(msg.key.remoteJid, { text: 'I am not an admin!' });

    console.log({ isGroup, isAdmins, isBotAdmins });

    // Get mentioned users if any
    let users = [];
    if (msg.message.extendedTextMessage?.contextInfo?.mentionedJid) {
        users = msg.message.extendedTextMessage.contextInfo.mentionedJid;
    } else if (args.length) {
        // fallback: use numbers from args
        users = args.map(arg => arg.replace(/^\+/, '') + '@s.whatsapp.net');
    } else {
        return AlexaInc.sendMessage(msg.key.remoteJid, { text: `Please mention someone or provide a number to ${command}!` });
    }

    AlexaInc.groupParticipantsUpdate(
        msg.key.remoteJid, 
        users, 
        command // 'add', 'remove', 'promote', 'demote'
    ).then(() => {
        AlexaInc.sendMessage(msg.key.remoteJid, { text: `User(s) ${command}d successfully!` });
    }).catch(error => {
        console.error(`Failed to ${command} user(s):`, error);
        AlexaInc.sendMessage(msg.key.remoteJid, { text: `Failed to ${command} user(s). Maybe the number is incorrect or they left the group.` });
    });

    break;
}


// set group welcome
case 'welcomeon': {
  if (!isGroup) return AlexaInc.sendMessage(msg.key.remoteJid, { text: 'This is not a group!' });
  if (!isAdmins) return AlexaInc.sendMessage(msg.key.remoteJid, { text: 'You are not an admin!' });
  if (!text) return AlexaInc.sendMessage(msg.key.remoteJid, { text: 'Welcome message description is not defined! please send a message' });
  

  // Query to update the group settings in the database
  const query = `
    INSERT INTO \`groups\` (group_id, is_welcome, wc_m)
    VALUES (?, TRUE, ?)
    ON DUPLICATE KEY UPDATE is_welcome = TRUE, wc_m = ?
  `;
  
  // Run the query using MySQL2
  db.query(query, [msg.key.remoteJid, text, text], (err, result) => {
    if (err) {
      console.error('Error updating welcome message:', err);
      return AlexaInc.sendMessage(msg.key.remoteJid, { text: 'Failed to set welcome message.' });
    }

    AlexaInc.sendMessage(msg.key.remoteJid, { text: 'Welcome message has been set successfully!' });
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
  if (!isGroup) return AlexaInc.sendMessage(msg.key.remoteJid, { text: 'This is not a group!' });
  if (!isAdmins) return AlexaInc.sendMessage(msg.key.remoteJid, { text: 'You are not an admin!' });

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


case 'chatbot': {
  if (!isGroup) return AlexaInc.sendMessage(msg.key.remoteJid, { text: 'This is not a group!' });
  if (!isAdmins) return AlexaInc.sendMessage(msg.key.remoteJid, { text: 'You are not an admin!' });
  if (!isBotAdmins) return AlexaInc.sendMessage(msg.key.remoteJid, { text: 'I am not an admin' });
  if (!args[0] || (args[0] !== 'on' && args[0] !== 'off')) 
      return AlexaInc.sendMessage(msg.key.remoteJid, { text: 'Please send .antilink on/off' });

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
  if (!isGroup) return AlexaInc.sendMessage(msg.key.remoteJid, { text: 'This is not a group!' });
  if (!isAdmins) return AlexaInc.sendMessage(msg.key.remoteJid, { text: 'You are not an admin!' });
  if (!isBotAdmins) return AlexaInc.sendMessage(msg.key.remoteJid, { text: 'I am not an admin' });
  if (!args[0] || (args[0] !== 'on' && args[0] !== 'off')) 
      return AlexaInc.sendMessage(msg.key.remoteJid, { text: 'Please send .antilink on/off' });

  const value1 = args[0] === 'on';
  
  // Corrected SQL query
  const query = `
    INSERT INTO \`groups\` (group_id, antilink)
    VALUES (?, ?)
    ON DUPLICATE KEY UPDATE antilink = ?;
  `;

  // Run the query using MySQL2
  db.query(query, [msg.key.remoteJid, value1, value1], (err, result) => {
    if (err) {
      console.error('Error updating antilink:', err);
      return AlexaInc.sendMessage(msg.key.remoteJid, { text: 'Failed to ' + args[0] + ' antilink' });
    }

    AlexaInc.sendMessage(msg.key.remoteJid, { text: 'Antilink ' + args[0] + ' successfully!' });
  });

  break;
}

case 'antinsfw': {
  if (!isGroup) return AlexaInc.sendMessage(msg.key.remoteJid, { text: 'This is not a group!' });
  if (!isAdmins) return AlexaInc.sendMessage(msg.key.remoteJid, { text: 'You are not an admin!' });
  if (!isBotAdmins) return AlexaInc.sendMessage(msg.key.remoteJid, { text: 'I am not an admin' });
  if (!args[0] || (args[0] !== 'on' && args[0] !== 'off')) 
      return AlexaInc.sendMessage(msg.key.remoteJid, { text: 'Please send .antilink on/off' });

  const value1 = args[0] === 'on';
  
  // Corrected SQL query
  const query = `
    INSERT INTO \`groups\` (group_id, antinsfw)
    VALUES (?, ?)
    ON DUPLICATE KEY UPDATE antinsfw = ?;
  `;

  // Run the query using MySQL2
  db.query(query, [msg.key.remoteJid, value1, value1], (err, result) => {
    if (err) {
      console.error('Error updating antinsfw:', err);
      return AlexaInc.sendMessage(msg.key.remoteJid, { text: 'Failed to ' + args[0] + ' antinsfw' });
    }

    AlexaInc.sendMessage(msg.key.remoteJid, { text: 'Antinsfw ' + args[0] + ' successfully!' });
  });

  break;
}


case 'hidetag':{

  if (!isGroup) return AlexaInc.sendMessage(msg.key.remoteJid, { text: 'This is not a group!' });
  if (!isAdmins) return AlexaInc.sendMessage(msg.key.remoteJid, { text: 'You are not an admin!' });
  if (!isBotAdmins) return AlexaInc.sendMessage(msg.key.remoteJid, { text: 'I am not an admin' });
  AlexaInc.sendMessage(msg.key.remoteJid, { text : text ? text : '' , mentions: participants.map(a => a.id)}, { quoted: msg })
  AlexaInc.sendMessage(msg.key.remoteJid, { delete: msg.key });
  break
}



case 'join':{

  if (!isOwner) return AlexaInc.sendMessage(msg.key.remoteJid, { text: 'this command for owner only' });
  if (isGroup) return AlexaInc.sendMessage(msg.key.remoteJid, { text: 'this cmd cannot be use in Group' });


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
  if (!isGroup) return await AlexaInc.sendMessage(msg.key.remoteJid,{ text:'this command only gor groups'});
  if(!isOwner) return await AlexaInc.sendMessage(msg.key.remoteJid,{text:'this command for owner only'});
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
    

  if (!msg.message?.imageMessage) {
    mesafesfb = messageText;
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





                AlexaInc.sendMessage(msg.key.remoteJid,{ image: {url: './res/img/alexa.jpeg'},caption: menu},{ quoted: msg });

  break
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
