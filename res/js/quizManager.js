// quizManager.js
const axios = require('axios');
const fs = require('fs-extra');
require('dotenv').config()
// Configuration
const QUIZ_URL = 'https://raw.githubusercontent.com/hansaka02/questionjson/main/quiz.json';
const QUESTION_TIMEOUT_SECONDS = 45;
const BOT_PHONE_NUMBER = process.env.bot_nb; // 🚨 IMPORTANT: Replace with your Bot's number (e.g., 12345678901, NO + OR SPACES)
const QUIZ_MAGIC_PREFIX = '.ansq_'; 
const QUIZ_STORAGE_DIR = './quizzes';

// Ensure the directory exists when the bot starts
if (!fs.existsSync(QUIZ_STORAGE_DIR)) {
    fs.mkdirSync(QUIZ_STORAGE_DIR);
}
// State Management
let quizQuestions = [];
let isFetching = false;
let activeQuiz = null; 
let globalLeaderboard = new Map(); // Map<userId, score>

// Helper functions
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const QUIZ_MAGIC_PREFIX_EXPORT = QUIZ_MAGIC_PREFIX; 

// --- ENCRYPTION/DECRYPTION FUNCTIONS ---

function encodeAnswerPayload(sessionId, answerCode) {
    const payload = `${sessionId}|${answerCode}`;
    return Buffer.from(payload).toString('base64');
}

function decodeAnswerPayload(encodedString) {
    try {
        const decoded = Buffer.from(encodedString, 'base64').toString('utf-8');
        const [sessionId, answerCode] = decoded.split('|');
        if (sessionId && answerCode) {
            return { sessionId, answerCode };
        }
    } catch (e) {
        console.error("[QuizManager] Decryption failed:", e.message);
    }
    return null;
}

// --- CORE QUIZ FUNCTIONS ---

async function loadQuestions() {
    if (quizQuestions.length > 0 || isFetching) return quizQuestions;
    isFetching = true;
    try {
        console.log('[QuizManager] Fetching questions...');
        const response = await axios.get(QUIZ_URL);
        quizQuestions = response.data;
        console.log(`[QuizManager] Loaded ${quizQuestions.length} questions.`);
    } catch (error) {
        console.error('[QuizManager] ERROR loading quiz questions:', error.message);
    } finally {
        isFetching = false;
    }
    return quizQuestions;
}

/**
 * Sends the current question to the group using the correct interactive button structure.
 */
// quizManager.js

// ... (Keep all preceding functions the same) ...

/**
 * Sends the current question to the group using the correct interactive button structure.
 */
async function sendNextQuestion(AlexaInc, jid) {
    if (activeQuiz && activeQuiz.timer) {
        clearTimeout(activeQuiz.timer);
    }
    
    if (activeQuiz && activeQuiz.questionIndex >= quizQuestions.length) {
        await sendFinalLeaderboard(AlexaInc, jid);
        activeQuiz = null;
        return;
    }

    const qIndex = activeQuiz ? activeQuiz.questionIndex : 0;
    const questionData = quizQuestions[qIndex];
    const sessionId = `Q${qIndex + 1}_${Date.now()}`; 

    const buttons = questionData.options.map((option, index) => {
        const answerCode = String.fromCharCode(65 + index); // A, B, C...

        const encryptedPayload = encodeAnswerPayload(sessionId, answerCode); 
        const dmPayload = encodeURIComponent(`${QUIZ_MAGIC_PREFIX}${encryptedPayload}`);
        const dmLink = `https://wa.me/${BOT_PHONE_NUMBER}?text=${dmPayload}`;

        return {
            name: 'cta_url',
            buttonParamsJson: JSON.stringify({
               display_text: `${answerCode}. ${option}`,
               url: dmLink
            })
        };
    });

    const questionText = `*Question ${qIndex + 1} / ${quizQuestions.length}:*\n\n${questionData.question}\n\n`;

    const sentMessage = await AlexaInc.sendMessage(jid, {
        text: questionText,
        title: 'Quiz Time!', 
        footer: `Time: ${QUESTION_TIMEOUT_SECONDS}s | Tap a button to send your answer privately.`,
        interactiveButtons: buttons, 
    });

    // 🚨 CRITICAL FIX APPLIED HERE 🚨
    activeQuiz = {
        questionIndex: qIndex,
        groupJid: jid,
        answers: new Map(), 
        // FIX: Changed 64 to 65. 'A' is ASCII 65. 65 + 0 = 'A'.
        correctAnswerCode: String.fromCharCode(65 + questionData.answer), 
        question: questionData.question,
        options: questionData.options,         
        explanation: questionData.explanation, 
        originalKey: sentMessage.key, 
        sessionId: sessionId,
        timer: null
    };
    
    activeQuiz.timer = setTimeout(() => {
        tallyAndSendResults(AlexaInc, jid);
        
        delay(3000).then(() => {
            activeQuiz.questionIndex++;
            sendNextQuestion(AlexaInc, jid);
        });
    }, QUESTION_TIMEOUT_SECONDS * 1000);

    console.log(`[QuizManager] Question ${qIndex + 1} started. Session ID: ${sessionId}. Expected Answer: ${activeQuiz.correctAnswerCode}`);
}

// ... (Keep all subsequent functions the same) ...

async function tallyAndSendResults(AlexaInc, jid) {
    if (!activeQuiz) return;

    // Ensure all necessary properties are destructured (including originalKey)
    const { 
        question, 
        answers, 
        options, 
        correctAnswerCode, 
        explanation, 
        questionIndex, 
        originalKey // Key of the message to delete
    } = activeQuiz;
    
    // Tallying logic
    const answerCounts = options.reduce((acc, option, index) => {
        const answerCode = String.fromCharCode(65 + index);
        acc[answerCode] = { count: 0, option: option };
        return acc;
    }, {});
    
    let totalVotes = 0;
    answers.forEach((submittedCode, userId) => {
        if (answerCounts[submittedCode]) {
            answerCounts[submittedCode].count++;
            totalVotes++;
            
            // LEADERBOARD UPDATE
            if (submittedCode === correctAnswerCode) {
                const currentScore = globalLeaderboard.get(userId) || 0;
                globalLeaderboard.set(userId, currentScore + 1);
            }
        }
    });
    
    // 1. 🚨 FIX: DELETE THE ORIGINAL GROUP MESSAGE
    try {
        await AlexaInc.sendMessage(jid, {
            delete: originalKey, 
        });
        console.log(`[QuizManager] Deleted original message for Q${questionIndex + 1}.`);
    } catch (e) {
        console.warn(`[QuizManager] Could not delete original message for Q${questionIndex + 1}. It may be too old or due to API restriction.`);
    }

    // 2. 🚨 FIX: Add question text to the top of the result message
    let resultSummary = `*Question:* ${question}\n\n`; // ADDED QUESTION HERE
    resultSummary += `*✅ Results for Question ${questionIndex + 1}*\n\n`;
    
    resultSummary += `*Total Submissions:* ${totalVotes}\n\n`;
    options.forEach((option, index) => {
        const answerCode = String.fromCharCode(65 + index);
        const count = answerCounts[answerCode].count;
        const emoji = answerCode === correctAnswerCode ? '✅' : '❌';
        resultSummary += `${emoji} ${answerCode}. ${option} - *${count}* votes\n`;
    });
    resultSummary += `\n*Correct Answer:* ${correctAnswerCode}. ${options[correctAnswerCode.charCodeAt(0) - 65]}\n`;
    resultSummary += `\n*Explanation:* ${explanation}\n`;
    
    await AlexaInc.sendMessage(jid, { text: resultSummary });
}

function handleDMAnswer(AlexaInc, jid, text) {
    if (!text.startsWith(QUIZ_MAGIC_PREFIX)) return;

    const encodedPayload = text.substring(QUIZ_MAGIC_PREFIX.length).trim();
    const payload = decodeAnswerPayload(encodedPayload);

    if (!payload) {
        AlexaInc.sendMessage(jid, { text: `❗️ Could not read your answer. Please tap the button again.` });
        return;
    }

    const { sessionId, answerCode } = payload;
    
    if (activeQuiz && sessionId === activeQuiz.sessionId) {
        const userId = jid; 

        if (!activeQuiz.answers.has(userId)) {
            activeQuiz.answers.set(userId, answerCode);
            AlexaInc.sendMessage(userId, { text: `✅ Answer *${answerCode}* recorded. Thank you!` });
        } else {
            AlexaInc.sendMessage(userId, { text: `❗️ You have already answered this question.` });
        }
    } else {
        AlexaInc.sendMessage(jid, { text: `Sorry, the time limit for this question has expired.` });
    }
}

async function sendFinalLeaderboard(AlexaInc, jid) {
    if (globalLeaderboard.size === 0) {
        await AlexaInc.sendMessage(jid, { text: "*🏆 Final Leaderboard*\n\nNo scores were recorded." });
        return;
    }
    
    const sortedScores = Array.from(globalLeaderboard.entries())
        .sort(([, scoreA], [, scoreB]) => scoreB - scoreA);

    let leaderboardText = "*🏆 Final Leaderboard*\n\n";

    for (let i = 0; i < sortedScores.length; i++) {
        const [userId, score] = sortedScores[i];
        // Display JID as identifier
        leaderboardText += `${i + 1}. @${userId.split('@')[0]} - *Score ${score}*\n`;
    }

    globalLeaderboard.clear();

    await AlexaInc.sendMessage(jid, { 
        text: leaderboardText,
        mentions: sortedScores.map(([userId]) => userId) 
    });
}

async function startQuiz(AlexaInc, jid) {
    if (activeQuiz) {
        await AlexaInc.sendMessage(jid, { text: "⚠️ A quiz is already active." });
        return;
    }
    
    const questions = await loadQuestions();
    
    if (questions.length === 0) {
        await AlexaInc.sendMessage(jid, { text: "Could not load questions. Please try again later." });
        return;
    }
    
    globalLeaderboard.clear();
    
    activeQuiz = { questionIndex: -1 }; 
    await AlexaInc.sendMessage(jid, { text: "*Quiz Starting!* The first question will appear shortly." });
    
    delay(2000).then(() => {
        activeQuiz.questionIndex = 0;
        sendNextQuestion(AlexaInc, jid);
    });
}

function setQuestions(newQuestions) {
    quizQuestions = newQuestions;
}


// quizManager.js

// ... (Your existing functions: loadQuestions, sendNextQuestion, tallyAndSendResults, etc.) ...

/**
 * Immediately stops the active quiz session, tallies the current question, 
 * and displays the final leaderboard.
 */
async function stopQuiz(AlexaInc, jid) {
    if (!activeQuiz) {
        await AlexaInc.sendMessage(jid, { text: "⚠️ No quiz is currently running to stop." });
        return;
    }

    const { question, answers, options, correctAnswerCode, explanation, originalKey, questionIndex } = activeQuiz;
    const qIndex = questionIndex;

    // 1. Stop the active timer
    clearTimeout(activeQuiz.timer);

    // 2. Delete the current question message (if possible)
    try {
        await AlexaInc.sendMessage(jid, { delete: originalKey });
    } catch (e) {
        console.warn(`[QuizManager] Could not delete message during stop: ${e.message}`);
    }

    // 3. Tally results for the question that was cut short (logic copied from tallyAndSendResults)
    const answerCounts = options.reduce((acc, option, index) => {
        const answerCode = String.fromCharCode(65 + index);
        acc[answerCode] = { count: 0, option: option };
        return acc;
    }, {});
    
    let totalVotes = 0;
    answers.forEach((submittedCode, userId) => {
        if (answerCounts[submittedCode]) {
            answerCounts[submittedCode].count++;
            totalVotes++;
            
            // NOTE: Leaderboard is updated here for answers submitted before the stop
            if (submittedCode === correctAnswerCode) {
                const currentScore = globalLeaderboard.get(userId) || 0;
                globalLeaderboard.set(userId, currentScore + 1);
            }
        }
    });

    // 4. Send results for the final question
    let resultSummary = `*🚨 QUIZ STOPPED EARLY by Admin 🚨*\n\n`;
    resultSummary += `*Question:* ${question}\n\n`;
    resultSummary += `*Results for Question ${qIndex + 1} (Final Tally)*\n\n`;
    resultSummary += `*Total Submissions:* ${totalVotes}\n`;
    options.forEach((option, index) => {
        const answerCode = String.fromCharCode(65 + index);
        const count = answerCounts[answerCode].count;
        const emoji = answerCode === correctAnswerCode ? '✅' : '❌';
        resultSummary += `${emoji} ${answerCode}. ${option} - *${count}* votes\n`;
    });
    resultSummary += `\n*Correct Answer:* ${correctAnswerCode}. ${options[correctAnswerCode.charCodeAt(0) - 65]}\n`;
    resultSummary += `\n*Explanation:* ${explanation}\n`;

    await AlexaInc.sendMessage(jid, { text: resultSummary });

    // 5. Send the overall final leaderboard
    await sendFinalLeaderboard(AlexaInc, jid);

    // 6. Reset state
    activeQuiz = null;
    console.log(`[QuizManager] Quiz stopped by admin after Q${qIndex + 1}.`);
}

// ... (End of quizManager.js file) ...

module.exports = {
    startQuiz,
    handleDMAnswer,
    loadQuestions,
    stopQuiz,
    setQuestions,
    QUIZ_MAGIC_PREFIX: QUIZ_MAGIC_PREFIX_EXPORT
};