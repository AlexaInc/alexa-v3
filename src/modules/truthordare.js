const economy = require("./economy.js");

const PLAY_REWARD = 20; // small AlexaCash reward per round, optional

const TRUTHS = [
  "What's the most embarrassing thing that's happened to you at school/work?",
  "Who was your first crush?",
  "What's a lie you told your parents and never got caught?",
  "What's the weirdest dream you've ever had?",
  "If you could swap lives with someone in this group for a day, who would it be and why?",
  "What's your biggest fear that you've never told anyone?",
  "What's the most childish thing you still do?",
  "Have you ever pretended to like a gift you hated?",
  "What's a secret talent no one in this group knows about?",
  "What's the last thing you searched on your phone?",
  "Who in this group would you want to be stuck on an island with?",
  "What's the most trouble you've ever gotten into?",
  "Have you ever had a crush on someone in this group?",
  "What's your most used emoji and why?",
  "What's something you're embarrassed you enjoy?",
  "What's the weirdest food combo you actually like?",
  "Have you ever stalked someone's social media for hours?",
  "What's a rumor about you that was actually true?",
  "What's the pettiest thing you've ever done?",
  "If everyone in this group read your texts right now, what would you be most worried about?",
];

const DARES = [
  "Send the 5th photo in your gallery to the group.",
  "Text your crush/ex 'I miss the WiFi at your place' right now.",
  "Do 10 push-ups and send a video/voice note as proof.",
  "Change your profile picture to something silly for 1 hour.",
  "Speak in an accent for the next 3 messages.",
  "Post your most recent search history (blur anything too personal).",
  "Send a voice note singing the chorus of your favorite song.",
  "Let the group pick your WhatsApp status for the next hour.",
  "Text 'I lost a bet' to the 3rd contact in your phonebook.",
  "Reply to the next 5 messages using only emojis.",
  "Do your best impression of another group member (audio message).",
  "Send a screenshot of your recent call log.",
  "Type your next message using only your nose/elbow (describe the typos!).",
  "Compliment every single person in this group, one by one.",
  "Tell the group your phone's battery percentage and screen time today.",
  "Send the last photo you took, no matter what it is.",
  "Write a 4-line poem about the group and send it now.",
  "Let someone else in the group send a message from your phone (or roleplay it here).",
  "Confess one thing you've been too shy to say to the group.",
  "Use only capital letters for your next 5 messages.",
];

const WYR = [
  "Would you rather have unlimited money but no friends, or unlimited friends but no money?",
  "Would you rather be able to fly or be invisible?",
  "Would you rather always be 10 minutes late or always 20 minutes early?",
  "Would you rather lose all your memories or never be able to make new ones?",
  "Would you rather fight one horse-sized duck or 100 duck-sized horses?",
  "Would you rather never use WhatsApp again or never use YouTube again?",
  "Would you rather be famous but broke, or rich but unknown?",
  "Would you rather always speak your mind or never speak again?",
  "Would you rather live without music or without movies?",
  "Would you rather have the ability to time travel or read minds?",
  "Would you rather be the funniest or the smartest person in the room?",
  "Would you rather lose your phone for a month or lose your wallet for a month?",
  "Would you rather always have to sing instead of speak or dance everywhere you walk?",
  "Would you rather live in the past or the future?",
  "Would you rather have a rewind button or a pause button for your life?",
];

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getTruth(targetMention) {
  const q = pickRandom(TRUTHS);
  const target = targetMention ? `@${targetMention.split("@")[0]} ` : "";
  return `🤍 *TRUTH* ${target}\n\n"${q}"`;
}

function getDare(targetMention) {
  const q = pickRandom(DARES);
  const target = targetMention ? `@${targetMention.split("@")[0]} ` : "";
  return `🔥 *DARE* ${target}\n\n"${q}"`;
}

function getTruthOrDare(targetMention) {
  return Math.random() < 0.5 ? getTruth(targetMention) : getDare(targetMention);
}

function getWouldYouRather() {
  const q = pickRandom(WYR);
  return `🤔 *WOULD YOU RATHER*\n\n${q}`;
}

async function rewardPlay(userId) {
  await economy.addBalance(userId, PLAY_REWARD);
  return PLAY_REWARD;
}

module.exports = {
  getTruth,
  getDare,
  getTruthOrDare,
  getWouldYouRather,
  rewardPlay,
};
