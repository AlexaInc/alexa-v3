const axios = require('axios');
const {jidNormalizedUser} = require('@hansaka02/baileys')
// Configuration
const QUIZ_URL = 'https://raw.githubusercontent.com/hansaka02/questionjson/main/quiz.json';
const QUESTION_TIMEOUT_SECONDS = 40;
const BOT_PHONE_NUMBER = 'YOUR_BOTS_PHONE_NUMBER'; // 🚨 Replace with your bot's number
const QUIZ_MAGIC_PREFIX = '.ansq_';

// State Management
let quizQuestions = [];
let isFetching = false;
const activeQuizzes = new Map(); // Key: Group JID, Value: Quiz Object
let globalLeaderboard = new Map(); // Global scores across all groups

// Helper functions
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// --- ENCRYPTION/DECRYPTION ---
function encodeAnswerPayload(sessionId, answerCode) {
    const payload = `${sessionId}|${answerCode}`;
    return Buffer.from(payload).toString('base64');
}

function decodeAnswerPayload(encodedString) {
    try {
        const decoded = Buffer.from(encodedString, 'base64').toString('utf-8');
        const [sessionId, answerCode] = decoded.split('|');
        if (sessionId && answerCode) return { sessionId, answerCode };
    } catch (e) {
        console.error("[QuizManager] Decryption failed:", e.message);
    }
    return null;
}

// --- CORE LOGIC ---

async function loadQuestions() {
    if (quizQuestions.length > 0 || isFetching) return quizQuestions;
    isFetching = true;
    try {
        const response = await axios.get(QUIZ_URL);
        quizQuestions = response.data;
    } catch (error) {
        console.error('[QuizManager] ERROR loading questions:', error.message);
    } finally {
        isFetching = false;
    }
    return quizQuestions;
}

function setQuestions(newQuestions) {
    quizQuestions = newQuestions;
}

async function sendNextQuestion(Alexainc, jid) {
            const botJid = jidNormalizedUser(AlexaInc.user.id);
            const botNumber = botJid.replace(/@.*/, "")
    const currentQuiz = activeQuizzes.get(jid);
    if (!currentQuiz) return;

    if (currentQuiz.timer) clearTimeout(currentQuiz.timer);

    if (currentQuiz.questionIndex >= quizQuestions.length) {
        await sendFinalLeaderboard(Alexainc, jid);
        activeQuizzes.delete(jid);
        return;
    }

    const qIndex = currentQuiz.questionIndex;
    const questionData = quizQuestions[qIndex];
    const sessionId = `Q${qIndex + 1}_${Date.now()}`;

    const buttons = questionData.options.map((option, index) => {
        const answerCode = String.fromCharCode(65 + index);
        const encryptedPayload = encodeAnswerPayload(sessionId, answerCode);
        const dmPayload = encodeURIComponent(`${QUIZ_MAGIC_PREFIX}${encryptedPayload}`);
        const dmLink = `https://wa.me/${botNumber}?text=${dmPayload}`;

        return {
            name: 'cta_url',
            buttonParamsJson: JSON.stringify({
                display_text: `${answerCode}. ${option}`,
                url: dmLink
            })
        };
    });

    const questionText = `*Question ${qIndex + 1} / ${quizQuestions.length}:*\n\n${questionData.question}\n\n`;

    const sentMessage = await Alexainc.sendMessage(jid, {
        text: questionText,
        title: 'Quiz Time!',
        footer: `Time: ${QUESTION_TIMEOUT_SECONDS}s | Tap to send answer privately.`,
        interactiveButtons: buttons,
    });

    // Update state for this specific group
    currentQuiz.answers = new Map();
    currentQuiz.correctAnswerCode = String.fromCharCode(65 + questionData.answer);
    currentQuiz.question = questionData.question;
    currentQuiz.options = questionData.options;
    currentQuiz.explanation = questionData.explanation;
    currentQuiz.originalKey = sentMessage.key;
    currentQuiz.sessionId = sessionId;
    
    currentQuiz.timer = setTimeout(() => {
        tallyAndSendResults(Alexainc, jid);
        delay(3000).then(() => {
            if (activeQuizzes.has(jid)) {
                currentQuiz.questionIndex++;
                sendNextQuestion(Alexainc, jid);
            }
        });
    }, QUESTION_TIMEOUT_SECONDS * 1000);
}

async function tallyAndSendResults(Alexainc, jid) {
    const currentQuiz = activeQuizzes.get(jid);
    if (!currentQuiz) return;

    const { question, answers, options, correctAnswerCode, explanation, questionIndex, originalKey } = currentQuiz;

    const answerCounts = options.reduce((acc, opt, idx) => {
        acc[String.fromCharCode(65 + idx)] = { count: 0, option: opt };
        return acc;
    }, {});

    let totalVotes = 0;
    answers.forEach((submittedCode, userId) => {
        if (answerCounts[submittedCode]) {
            answerCounts[submittedCode].count++;
            totalVotes++;
            if (submittedCode === correctAnswerCode) {
                globalLeaderboard.set(userId, (globalLeaderboard.get(userId) || 0) + 1);
            }
        }
    });

    try { await Alexainc.sendMessage(jid, { delete: originalKey }); } catch (e) {}

    let resultSummary = `*Question:* ${question}\n\n`;
    resultSummary += `*✅ Results for Question ${questionIndex + 1}*\n\n`;
    resultSummary += `*Total Submissions:* ${totalVotes}\n\n`;
    options.forEach((opt, idx) => {
        const code = String.fromCharCode(65 + idx);
        const emoji = code === correctAnswerCode ? '✅' : '❌';
        resultSummary += `${emoji} ${code}. ${opt} - *${answerCounts[code].count}* votes\n`;
    });
    resultSummary += `\n*Correct Answer:* ${correctAnswerCode}. ${options[correctAnswerCode.charCodeAt(0) - 65]}\n`;
    resultSummary += `\n*Explanation:* ${explanation}\n`;

    await Alexainc.sendMessage(jid, { text: resultSummary });
}

function handleDMAnswer(Alexainc, jid, text) {
    const encodedPayload = text.substring(QUIZ_MAGIC_PREFIX.length).trim();
    const payload = decodeAnswerPayload(encodedPayload);
    if (!payload) return;

    const { sessionId, answerCode } = payload;

    // Logic: Look through all active group quizzes to find the one matching this sessionId
    for (let [groupJid, quiz] of activeQuizzes.entries()) {
        if (quiz.sessionId === sessionId) {
            if (!quiz.answers.has(jid)) {
                quiz.answers.set(jid, answerCode);
                Alexainc.sendMessage(jid, { text: `✅ Answer *${answerCode}* recorded for this session.` });
            } else {
                Alexainc.sendMessage(jid, { text: `❗️ You already answered this question.` });
            }
            return;
        }
    }
    Alexainc.sendMessage(jid, { text: `Sorry, this question session is no longer active.` });
    return;
}

async function startQuiz(Alexainc, jid) {
    if (activeQuizzes.has(jid)) {
        return Alexainc.sendMessage(jid, { text: "⚠️ A quiz is already running in this group." });
    }
    const questions = await loadQuestions();
    if (questions.length === 0) return;

    activeQuizzes.set(jid, { questionIndex: 0 });
    await Alexainc.sendMessage(jid, { text: "*Quiz Starting!*" });
    delay(2000).then(() => sendNextQuestion(Alexainc, jid));
}

async function stopQuiz(Alexainc, jid) {
    const currentQuiz = activeQuizzes.get(jid);
    if (!currentQuiz) return Alexainc.sendMessage(jid, { text: "⚠️ No active quiz." });

    if (currentQuiz.timer) clearTimeout(currentQuiz.timer);
    await tallyAndSendResults(Alexainc, jid);
    await sendFinalLeaderboard(Alexainc, jid);
    activeQuizzes.delete(jid);
}

async function sendFinalLeaderboard(Alexainc, jid) {
    if (globalLeaderboard.size === 0) {
        return Alexainc.sendMessage(jid, { text: "*🏆 Final Leaderboard*\n\nNo scores recorded." });
    }
    const sorted = Array.from(globalLeaderboard.entries()).sort((a, b) => b[1] - a[1]);
    let text = "*🏆 Final Leaderboard*\n\n";
    sorted.forEach(([user, score], i) => {
        text += `${i + 1}. @${user.split('@')[0]} - *Score ${score}*\n`;
    });
    globalLeaderboard.clear();
    await Alexainc.sendMessage(jid, { text, mentions: sorted.map(s => s[0]) });
}

module.exports = {
    startQuiz,
    stopQuiz,
    handleDMAnswer,
    loadQuestions,
    setQuestions,
    QUIZ_MAGIC_PREFIX
};