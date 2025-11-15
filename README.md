
<h1 align="center">Alexa V3 WhatsApp Bot</h1>

<p align="center"><img src="./res/img/alexa.png" alt="Alexa V3" width="300" ></p>



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

### First Query (Conversation History)
```sql
CREATE TABLE `conversation_history` (
    id VARCHAR(100) NOT NULL PRIMARY KEY,
    conventions JSON DEFAULT NULL
);
```

### Second Query (Group Settings)

```sql
CREATE TABLE `groups` (
    group_id VARCHAR(255) NOT NULL PRIMARY KEY,
    is_welcome BOOLEAN NOT NULL DEFAULT FALSE,
    wc_m TEXT DEFAULT NULL,
    isleft_w BOOLEAN NOT NULL DEFAULT FALSE,
    left_m TEXT DEFAULT NULL,
    antilink BOOLEAN NOT NULL DEFAULT FALSE,
    link_a VARCHAR(50) DEFAULT 'delete',
    antinsfw BOOLEAN NOT NULL DEFAULT FALSE,
    nsfw_a VARCHAR(50) DEFAULT 'delete'
);
```

-----

## 🔧 Environment Variables

If you are using a local deployment (VPS or Replit), create a `.env` file in the root directory. If you are using a PaaS (like Koyeb or Railway), set these as environment variables in your service configuration.

```env
# Deployment URL (your public link)
WEBSOCKET_URL=<your deployement publick link>
# AI Model (from OpenRouter)
CHAT_MODEL=<get it from OpenRouter>
OPENROUTER_TOKEN1=<your openrouter token>
# Hugging Face (auto-taken)
HUGING_FACE=<hugging face auto taken>
# Bot & Owner Numbers
BOT_NB=<your bot's WhatsApp number>
Owner_nb=<your WhatsApp number>
# Database Connection
DB_HOST=<your database host>
DB_UNAME=<your database username>
DB_NAME=<your database name>
DB_PASS=<your database password>
DB_PORT=<your database port>
# Web Interface (Optional)
ADMIN_USERNAME=<username for web interface>
ADMIN_PASSWORD=<password for web interface>
SESSION_SECRET=<use a strong random text without spaces>
# Other API Keys
NIGHTAPI_AUTH=<nightapi token>
```

-----

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
    "@cacheable/node-cache": "^1.5.2",
    "@distube/ytdl-core": "^4.16.12",
    "@googleapis/customsearch": "^6.0.0",
    "@huggingface/inference": "^3.5.1",
    "@ookla/speedtest-js-sdk": "^1.1.1",
    "@whiskeysockets/baileys": "github:hansaka02/Baileys",
    "ascii-art": "^2.8.5",
    "axios": "^1.13.1",
    "bad-words-next": "^3.1.1",
    "canvas": "^3.2.0",
    "chalk": "^5.4.1",
    "cheerio": "^1.1.2",
    "child_process": "^1.0.2",
    "chrome-cookies-secure": "^3.0.0",
    "chromedriver": "^133.0.2",
    "cloudinary": "^2.5.1",
    "cors": "^2.8.5",
    "crypto": "^1.0.1",
    "dotenv": "^16.4.7",
    "express": "^4.21.2",
    "express-session": "^1.18.1",
    "filtermatics": "^1.0.1",
    "form-data": "^4.0.2",
    "form-data-encoder": "^4.0.2",
    "formdata-node": "^6.0.3",
    "fs-extra": "^11.3.0",
    "google-sr": "^6.0.0",
    "http": "^0.0.1-security",
    "jimp": "^0.22.12",
    "kleur": "^4.1.5",
    "link-preview-js": "^3.0.14",
    "moment-timezone": "^0.5.47",
    "mysql2": "^3.12.0",
    "node-cache": "^5.1.2",
    "node-fetch": "^2.7.0",
    "node-nlp": "^5.0.0-alpha.5",
    "open": "^10.1.0",
    "openai": "^4.85.4",
    "performance-now": "^2.1.0",
    "pm2": "^5.4.3",
    "progress-estimator": "^0.3.1",
    "puppeteer": "^24.26.0",
    "python-shell": "^5.0.0",
    "qrcode-terminal": "^0.12.0",
    "selenium-webdriver": "^4.29.0",
    "sharp": "^0.34.1",
    "ts-node": "^10.9.2",
    "typescript": "^5.6.3",
    "undici": "^7.3.0",
    "util": "^0.12.5",
    "uuid": "^9.0.1",
    "validator": "^13.15.23",
    "wa-sticker-formatter": "^4.4.4",
    "ws": "^8.18.1",
    "youtube-dl-exec": "^3.0.26",
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

  * `.hangman` - Start hangman
  * `.guess` - Guess a letter
  * `.endhangman` - End game
  * `.hangmanlb` - Get leaderboard

**DailyGiveaway**

  * `.dailyqa` - Start Q\&A
  * `.answer` - Send answer number

-----

## 📜 License

Copyright © Hansaka Rasanjana. All Rights Reserved.

-----

*Enjoy using Alexa V3 WhatsApp Bot\! 🚀*

