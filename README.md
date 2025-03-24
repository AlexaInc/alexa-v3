# Alexa V3 WhatsApp Bot

<p align="center"><img src="./res/img/alexa.jpeg" alt="Alexa V3" width="300" ></p>

Alexa V3 is a feature-rich WhatsApp bot developed by Hansaka Rasanjana with ❤️ for the WhatsApp community. This bot provides utilities, search functionalities, YouTube downloads, group management, NSFW content, SFW content, and even fun games!

## 🚀 Features
- 🛠 Utility Commands
- 🖼 Sticker & Image Conversion
- 🌐 Web & Search Functionalities
- 🎥 YouTube search & Audio Downloading
- 👥 Group Management
- 🪀 Games



## 🔧 Database configering
choose a sql database provider
aiven.io free (recomended)
first install mysql client on your pc or mobile and connect remotely
after connect exicute followning quaries

# First quary
```sql
CREATE TABLE `conversation_history` (
    id VARCHAR(100) NOT NULL PRIMARY KEY,
    conventions JSON DEFAULT NULL
);
```
# Second quary
```sql
CREATE TABLE `groups` (
    group_id VARCHAR(255) NOT NULL PRIMARY KEY,
    is_welcome BOOLEAN NOT NULL DEFAULT FALSE,
    wc_m TEXT DEFAULT NULL,
    isleft_w BOOLEAN NOT NULL DEFAULT FALSE,
    left_m TEXT DEFAULT NULL,
    antilink BOOLEAN NOT NULL DEFAULT FALSE,
    antinsfw BOOLEAN NOT NULL DEFAULT FALSE
);

```


## 🔧 Environment Variables
If you are using local deployement or vps or replit create a `.env` file in the root directory else you using paas(platform as a service) set Environment varible before deploying and configure the following variables:

```env
WEBSOCKET_URL=<your deployement publick link>
CHAT_MODEL=<get it from OpenRouter>
HUGING_FACE=<hugging face auto taken>
BOT_NB=<your deployed bot number>
OPENROUTER_TOKEN1=<your openrouter token>
DB_HOST=<your database host>
DB_UNAME=<your database username>
DB_NAME=<your database name>
DB_PASS=<your database password>
DB_PORT=<your database port>
Owner_nb=<your number>
ADMIN_USERNAME=<username for web interface>
ADMIN_PASSWORD=<password for web interface>
SESSION_SECRET=<use a strong text without spaces>
NIGHTAPI_AUTH=<nightapi token>
```

## 📥 Installation
Run the following commands to install the required dependencies and set up the bot:

```sh
apt update \
    && apt install -y software-properties-common speedtest-cli \
    && apt install -y ffmpeg \
    && apt clean \
    && rm -rf /var/lib/apt/lists/*
npm install
```

## ▶️ Start the Bot
```sh
npm start
```

## 📦 Dependencies
```json
{
  "@cacheable/node-cache": "^1.5.2",
  "@huggingface/inference": "^3.5.1",
  "@ookla/speedtest-js-sdk": "^1.1.1",
  "@sl-code-lords/esana-news": "^1.1.0",
  "@whiskeysockets/baileys": "^6.7.13",
  "ascii-art": "^2.8.5",
  "axios": "^1.7.9",
  "baileys": "^6.7.13",
  "chalk": "^5.4.1",
  "cheerio": "^1.0.0",
  "child_process": "^1.0.2",
  "chromedriver": "^133.0.2",
  "cloudinary": "^2.5.1",
  "cors": "^2.8.5",
  "dotenv": "^16.4.7",
  "express": "^4.21.2",
  "express-session": "^1.18.1",
  "fluent-ffmpeg": "^2.1.3",
  "fs-extra": "^11.3.0",
  "mysql2": "^3.12.0",
  "puppeteer": "^24.4.0",
  "ws": "^8.18.1"
}
```

## 🚀 Deploy on Koyeb, Replit, and Railway
Click the buttons below to deploy the bot easily:

[![Deploy on Koyeb](https://www.koyeb.com/static/images/deploy/button.svg)](https://app.koyeb.com/deploy)

[![Run on Replit](https://replit.com/badge/github/hansaka02/alexa-v3)](https://replit.com/github/hansaka02/alexa-v3)

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new/template?repository=https://github.com/hansaka02/alexa-v3)

## 📜 Commands List
```
🛠 Utility Commands:
.menu - Get this menu
.ping - Check bot status
.weather <city> - Get weather info
.news - Get latest news
.owner - Chat with Owner

🖼 Sticker & Image Commands:
.sticker - Convert image to sticker

🌐 Web & Search Commands:
.web - Search on the web
.browse - Browse the web
.search - Search online

🎥 YouTube Commands:
.yts - Search YouTube
.ytdl - Download MP3 from YouTube

👥 Group Management Commands:
.add <number> - Add user to group
.remove <number> - Remove user from group
.promote <number> - Promote user to admin
.demote <number> - Demote admin to user
.antilink on/off - Enable/Disable link restriction
.antinsfw on/off - Enable/Disable NSFW filter
.welcomeon/off - Enable/Disable welcome messages

🔞 NSFW Commands:
.anal, .ass, .boobs, .gonewild, .hentai, etc.

🌸 SFW Commands:
.coffee, .food, .holo, .kanna

🪀 Games:
.hangman - Start hangman
.guess - Guess a letter
.endhangman - End hangman game
.hangmanlb - Get hangman leaderboard
.dailyqa - Start daily Q&A
.answer <number> - Send an answer
```

## 📜 License
Copyright Reserved. Developed by Hansaka Rasanjana.

---
_Enjoy using Alexa V3 WhatsApp Bot! 🚀_

