

<h1 align="center">Alexa V3 WhatsApp Bot</h1>

<p align="center"><img src="./assets/img/alexa.png" alt="Alexa V3" width="300" ></p>



<p align="center">
  Alexa V3 is a feature-rich WhatsApp bot developed by Hansaka Rasanjana with ❤️ for the WhatsApp community. This bot provides utilities, search functionalities, media downloads, group management, SFW/NSFW content, and fun games!
</p>

## 🚀 Features

* 🛠 Utility Commands
* 🖼 Sticker & Image Conversion
* 🌐 Web & Search Functionalities
* 🎥 YouTube Search & Audio/Video Downloading
* 👥 Advanced Group Management
* 🤖 AI Chatbot Features
* 🌸 SFW & 🔞 NSFW Content
* 🪀 Fun Games

---

## 🔧 Database Configuration

1.  **Choose a SQL database provider.** We recommend the free tier from [aiven.io](https://aiven.io/).
2.  First, install a MySQL client on your PC or mobile device and connect to your database remotely.
3.  After connecting, execute the following queries to set up the required tables:

### SQL Query (Conversation History)
####     not compulsory it will auto create when first startup

```sql
CREATE TABLE IF NOT EXISTS `groups` (
    `group_id` VARCHAR(255) PRIMARY KEY,
    `chatbot` TINYINT(1) DEFAULT 0,
    `antilink` TINYINT(1) DEFAULT 0,
    `link_a` VARCHAR(50) DEFAULT 'delete',
    `antinsfw` TINYINT(1) DEFAULT 0,
    `nsfw_a` VARCHAR(50) DEFAULT 'delete',
    `is_allow_bots` TINYINT(1) DEFAULT 0,
    `is_welcome` TINYINT(1) DEFAULT 0,
    `wc_m` TEXT DEFAULT NULL,
    `isleft_w` TINYINT(1) DEFAULT 0,
    `left_m` TEXT DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS `conversation_history` (
    `id` VARCHAR(255) PRIMARY KEY,
    `conventions` LONGTEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS `tasks` (
    `user_id` VARCHAR(255) PRIMARY KEY,
    `tasks` TEXT NOT NULL
);
```


## 📁 Project Structure

```
alexa-v3/
├── app.js                  # entry: spawns & supervises src/server.js + src/index.js
├── env_dummy               # .env template — copy to .env and fill in
├── src/
│   ├── config.js           # loads .env ONCE, FIRST (single source of truth)
│   ├── index.js            # WhatsApp (Baileys) connection
│   ├── bot.js              # command handlers
│   ├── server.js           # web control panel (express)
│   ├── state/              # shared runtime state
│   ├── games/              # hangman
│   ├── services/           # proxy, websearch, ytdl, mediafire, news, quotes
│   └── modules/            # feature modules (games, filters, downloads, ...)
├── tools/                  # standalone scripts (ai.js, xray generator, tests)
├── data/                   # JSON state stores (users, hangman, battles, ...)
├── assets/                 # images, audio, static content
└── public/                 # control panel frontend
```

## 🔧 Environment Variables

`src/config.js` loads the environment in one place, in order — every entry
point requires it first.

If you are using a local deployment (VPS or Replit), create a `.env` file in the root directory. If you are using a PaaS (like Koyeb or Railway), set these as environment variables in your service configuration.

```editorconfig
# ==============================================================================
# ENVIRONMENT CONFIGURATION FILE (.env)
# ==============================================================================
# GUIDELINES:
# 1. SECURITY: Never commit this file with populated secrets to public version control (Git).
# 2. FORMATTING: Do not add spaces around the '=' sign (e.g., KEY=value).
# 3. QUOTES: Wrap values in double quotes if they contain spaces or special characters.
# 4. DEFAULTS: Optional variables can be left blank unless specific behavior is needed.
# ==============================================================================

# ------------------------------------------------------------------------------
# 1. SECURITY CREDENTIALS
# ------------------------------------------------------------------------------
# The web panel uses each account's bot-issued WhatsApp LID/password.
# Bot owners are recognised from Owner_nb / Owner_id below; no separate web-owner credential is needed.

# Secret key used for signing session cookies. Generate a long random value; never reuse a public/default string.
SESSION_SECRET=your_long_random_session_secret_key
# The panel automatically uses secure cookies on HTTPS. For an HTTPS production deployment you may force it:
# COOKIE_SECURE=true

# Dedicated 32-byte secret for encrypted bot-user credential recovery.
# Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
CREDENTIAL_ENCRYPTION_KEY=replace_with_a_random_base64_32_byte_key

# Webhook signature validation secret
WEBHOOK_SECRET=your_webhook_validation_secret

# ------------------------------------------------------------------------------
# 2. DATABASE CONFIGURATION
# ------------------------------------------------------------------------------
# Standard Relational Database (MySQL / PostgreSQL)
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=app_db
DB_UNAME=db_user
DB_PASS=db_password

# MongoDB Connection (Local file path or full mongodb:// / mongodb+srv:// URI)
MONGO_URL=mongodb://localhost:27017/bot_data or just /filters

# MongoDB URI specifically allocated for quiz data
QUIZ_MONGO_URI=mongodb://localhost:27017/quiz_data

# PostgreSQL direct connection string (e.g., Supabase, Neon, or local)
POSTGRES_URL=postgres://user:password@localhost:5432/dbname

# ------------------------------------------------------------------------------
# 3. BOT & USER IDENTIFIERS
# ------------------------------------------------------------------------------
# Primary owner details
Owner_nb=1234567890          # Primary owner's phone number with country code
Owner_id=1234567890          # Primary owner's platform ID (omit @lid / domain parts)

# Bot operational details
bot_nb=0987654321            # Bot's phone number or ID
spc_nb=1234567890            # Special/SUDO phone number with elevated permissions
ocid=1234567890@g.us         # Official channel/group ID where the bot is an admin

# ------------------------------------------------------------------------------
# 4. SERVER & NETWORK CONFIGURATION
# ------------------------------------------------------------------------------
# Optional HTTP/HTTPS proxy URL for outbound requests (e.g., http://proxy.example.com:8080)
# PROXY_URL=

# ------------------------------------------------------------------------------
# 5. AI & MODEL CONFIGURATIONS
# ------------------------------------------------------------------------------
# Active LLM/Chat model identifier (e.g., gpt-4o, gemini-1.5-pro, claude-3-5-sonnet)
CHAT_MODEL=gemini-1.5-pro

# Google AI Platform API key
GOOGLE_API_KEY=your_google_api_key

# DeepAI Platform API key
DEEPAI_API_KEY=your_deepai_api_key

# Hugging Face Access Token (used for model inference or API access)
HF_TOKEN=your_huggingface_access_token

# Hugging Face Storage Bucket / Dataset path
HF_BUCKET=your_hf_bucket_name

# NightAPI authentication token
NIGHTAPI_AUTH=your_nightapi_key

# ------------------------------------------------------------------------------
# 6. EXTERNAL SERVICES & MEDIA APIS
# ------------------------------------------------------------------------------
# Google Custom Search Engine ID (Programmable Search Engine)
GOOGLESEARCH_ENGINE_ID=your_search_engine_id

# Tenor GIF API key
TENOR_API_KEY=your_tenor_api_key

# YouTube Downloader (YTDL) configuration
YTDL_RELAYS=                 # Relay servers or proxies for YouTube requests
COOKIES_URLS=                # URL(s) to remote cookies files to bypass YTDL bot detection

# Optional: Audio output format preference (e.g., mp3, m4a, wav, opus)
YTDL_AUDIO_FORMAT=mp3
```

-----

## 🔐 User accounts and web panel

On startup, Alexa automatically creates all required MySQL tables, including
legacy bot settings plus `bot_users`, `user_profiles`, `group_directory`, and
`group_admin_memberships`. No manual SQL import is required.

- The first time WhatsApp provides a user's **LID**, Alexa creates their account and matching Economy, RPG, and Shop records.
- In a **private** chat, `.profile` shows the LID username, encrypted-at-rest password, private-AI preference, and connected game progress.
- `.changpw <new password>` changes the panel password (10–128 characters; private chat only).
- The website has one AJAX login modal. Every account signs in with its bot-issued LID and password. An authenticated account matching `Owner_nb` or `Owner_id` is automatically given the owner dashboard; other users can manage settings only for groups where their LID is currently a WhatsApp admin. That membership is re-synced on bot reconnect and admin/member updates.

-----

## 📊 Advanced group analytics

The authenticated dashboard stores group activity in MySQL and provides responsive, Telegram-style charts for message volume and types, member growth, join/leave sources, moderation actions, top members, and top admins. Group admins only see groups they currently manage.

On the first startup after upgrading, Alexa imports existing local ranking, invitation, warning, and contact JSON into MySQL exactly once. New ranking and warning data uses MySQL as the primary store. Keep the old files until the startup log confirms `Local JSON imported`; they may then be archived.

Analytics tables are created automatically by `src/services/database.js`. No manual SQL import is required.

## 📥 Installation

Run the following commands in your terminal to clone the repository and install dependencies.

```sh
# Update package lists and install required tools
apt update && \
apt install -y software-properties-common speedtest-cli ffmpeg && \

# Clone the repository and enter the directory
git clone [https://github.com/AlexaInc/alexa-v3.git](https://github.com/AlexaInc/alexa-v3.git) && \
cd alexa-v3 && \

# Install Node.js dependencies
npm install && \

# Clean up apt cache
apt clean && \
rm -rf /var/lib/apt/lists/*
```

-----

## ▶️ Start the Bot

Once installation is complete, start the bot using:

```sh
npm start
```

-----

## 📦 Dependencies



```json
{
  "@googleapis/customsearch": "^6.0.0",
  "@gradio/client": "^2.5.1",
  "@hansaka02/baileys": "github:alexainc/baileys-mod",
  "alexa-ai": "^2.4.0",
  "ascii-art": "^2.8.5",
  "axios": "^1.13.1",
  "bad-words-next": "^3.1.1",
  "body-parser": "^2.2.1",
  "canvas": "npm:@napi-rs/canvas@^0.1.6",
  "cheerio": "^1.1.2",
  "cloudinary": "^2.5.1",
  "compression": "^1.8.1",
  "cors": "^2.8.5",
  "dotenv": "^16.4.7",
  "express": "^4.21.2",
  "express-session": "^1.18.1",
  "filtermatics": "^1.0.3",
  "form-data": "^4.0.2",
  "fs-extra": "^11.3.0",
  "https-proxy-agent": "^7.0.6",
  "jimp": "^0.22.12",
  "jsdom": "^27.4.0",
  "kleur": "^4.1.5",
  "libphonenumber-js": "^1.12.34",
  "link-preview-js": "^3.0.14",
  "moment-timezone": "^0.5.47",
  "mongoose": "^9.9.5",
  "mumaker": "^2.0.0",
  "mysql2": "^3.12.0",
  "node-cache": "^5.1.2",
  "node-fetch": "^2.7.0",
  "npm": "^11.7.0",
  "openai": "^4.85.4",
  "pino": "^10.1.0",
  "pm2": "^5.4.3",
  "puppeteer": "^24.26.0",
  "qrcode-terminal": "^0.12.0",
  "scrape-primbon": "^1.1.0",
  "sharp": "^0.34.5",
  "socks-proxy-agent": "^8.0.5",
  "systeminformation": "^5.28.3",
  "tough-cookie": "^6.0.0",
  "typescript": "^5.6.3",
  "uuid": "^9.0.1",
  "validator": "^13.15.23",
  "waconnection": "npm:@whiskeysockets/baileys@^7.0.0-rc.9",
  "ws": "^8.18.1",
  "yt-search": "^2.12.1"
}
```



-----

## 🚀 Deploy on PaaS

Click the buttons below to deploy the bot easily on your preferred platform:

[![Deploy on Koyeb](https://www.koyeb.com/static/images/deploy/button.svg)](https://app.koyeb.com/deploy)

[![Run on Replit](https://replit.com/badge/github/hansaka02/alexa-v3)](https://replit.com/github/hansaka02/alexa-v3)

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new/template?repository=https://github.com/hansaka02/alexa-v3)
-----

## 📜 Commands List

Here are the available commands, grouped by category:

### 🛠 Utility Commands

  * `.menu` - Get this menu
  * `.ping` - Check bot status
  * `.weather <city>` - Get weather info
  * `.news` - Get latest news
  * `.owner` - Chat with Owner

### 🖼 Sticker & Image Commands

  * `.sticker` - Convert image/video to sticker
  * `.q` - Convert quoted message to sticker

### 🌐 Web & Search Commands

  * `.web` - Search on the web
  * `.browse` - Browse a URL
  * `.search` - Search online

###  Quiz

  * `.setquiz` - create new quizes after command send quiz list as json format bot will give you example format
  * `.quiz` - start a quize set `/quiz <quiz pack id>`
  * `.search` - stop quiz

### 🎥 Music/Video Commands

  * `.yts` - Search YouTube
  * `.ytdl` - Download MP3 from YouTube
  * `.song` - Download a Song by name

### 👥 Groups Commands

  * `.add <number>` - e.g., `.add 947... 978...`
  * `.remove <number>` - Remove user (reply or number)
  * `.promote <number>` - Promote user (reply or number)
  * `.demote <number>` - Demote admin (reply or number)
  * `.antilink on/off/remove` - Manage link filter
  * `.antinsfw on/off/remove` - Manage NSFW filter
  * `.chatbot on/off/remove` - Enable/disable AI chatbot
  * `.hidetag <msg>` - Mention all group members hiddenly
  * `.filter <trigger>` - Add a filter (reply to set response)
  * `.stop <trigger>` - Remove a filter
  * `.filters` - Get list of all filters in the group
  * `.welcomeon [msg]` - Turn on welcome (optional custom msg)
  * `.welcomeoff` - Turn off welcome message

### 🔞 NSFW Commands

  * `.anal`, `.ass`, `.boobs`, `.gonewild`
  * `.hanal`, `.hass`, `.hboobs`, `.hentai`
  * `.hkitsune`, `.hmidriff`, `.hneko`, `.hthigh`
  * `.neko`, `.paizuri`, `.pgif`, `.pussy`
  * `.tentacle`, `.thigh`, `.yaoi`

### 🌸 SFW Commands

  * `.coffee`
  * `.food`
  * `.holo`
  * `.kanna`

### 🪀 Games Menu

**Hangman**


  * `.newhang` - create hangman game
  * `.joinhang` - join a hangman game 
  * `.endhang` - End hangman game  
  * `.starthang` - Start hangman game 
  * `.hanglead` - Get leaderboard  


**DailyGiveaway**

  * `.dailyqa` - Start Q\&A
  * `.answer` - Send answer number

-----

## 📜 License

Copyright © Hansaka Rasanjana. All Rights Reserved.

-----

*Enjoy using Alexa V3 WhatsApp Bot\! 🚀*

