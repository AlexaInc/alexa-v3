"use strict";

const groupAnalytics = require("../services/groupAnalytics");

function warnedUser(message, mentionedJids) {
  if (mentionedJids?.length) return mentionedJids[0];
  return message.message?.extendedTextMessage?.contextInfo?.participant || null;
}

async function warnUser(AlexaInc, chatId, senderId, mentionedJids, message) {
  try {
    const userToWarn = warnedUser(message, mentionedJids);
    if (!userToWarn) {
      await AlexaInc.sendMessage(chatId, {
        text: "Please mention the user or reply to their message to warn baby!",
      });
      return;
    }

    const count = await groupAnalytics.incrementWarning(chatId, userToWarn);
    await groupAnalytics.recordModeration({
      groupId: chatId,
      adminId: senderId,
      targetId: userToWarn,
      eventType: "warn",
      metadata: { warningCount: count },
    });

    const interactiveButtons = [
      {
        name: "quick_reply",
        buttonParamsJson: JSON.stringify({
          display_text: "Remove warn",
          id: `.rmw_fbc ${userToWarn}`,
        }),
      },
    ];
    await AlexaInc.sendMessage(chatId, {
      text:
        `*『 WARNING ALERT 』*\n\n` +
        `👤 *Warned User:* @${userToWarn.split("@")[0]}\n` +
        `⚠️ *Warning Count:* ${count}/3\n` +
        `👑 *Warned By:* @${senderId.split("@")[0]}\n\n` +
        `📅 *Date:* ${new Date().toLocaleString()}`,
      mentions: [userToWarn, senderId],
      footer: "Powered by HANSAKA",
      interactiveButtons,
    });

    if (count >= 3) {
      await AlexaInc.groupParticipantsUpdate(chatId, [userToWarn], "remove");
      await groupAnalytics.clearWarning(chatId, userToWarn);
      await groupAnalytics.recordModeration({
        groupId: chatId,
        adminId: senderId,
        targetId: userToWarn,
        eventType: "member_removed",
        reason: "Automatic removal after three warnings",
        metadata: { automatic: true },
      });
      await AlexaInc.sendMessage(chatId, {
        text: `*『 AUTO-KICK 』*\n\n@${userToWarn.split("@")[0]} has been removed from the group after receiving 3 warnings! ⚠️`,
        mentions: [userToWarn],
      });
    }
  } catch (error) {
    console.error("Error in warn command:", error);
    await AlexaInc.sendMessage(chatId, {
      text:
        error?.data === 429
          ? "❌ Rate limit reached. Please try again in a few seconds."
          : "❌ Failed to warn user. Make sure the database is online and the bot has sufficient permissions.",
    });
  }
}

async function checkWarns(AlexaInc, chatId, mentionedJidList) {
  try {
    if (!mentionedJidList?.length) {
      await AlexaInc.sendMessage(chatId, {
        text: "Please mention a user to check warnings.",
      });
      return;
    }
    const count = await groupAnalytics.warningCount(
      chatId,
      mentionedJidList[0],
    );
    await AlexaInc.sendMessage(chatId, {
      text: `User has ${count} warning(s).`,
    });
  } catch (error) {
    await AlexaInc.sendMessage(chatId, { text: error.message });
  }
}

async function removeWarn(AlexaInc, chatId, mentionedJidList, adminId = null) {
  const userJid = mentionedJidList?.[0];
  try {
    if (!userJid) throw new Error("Please mention a user.");
    const removed = await groupAnalytics.clearWarning(chatId, userJid);
    if (removed) {
      await groupAnalytics.recordModeration({
        groupId: chatId,
        adminId,
        targetId: userJid,
        eventType: "warn_removed",
      });
    }
    await AlexaInc.sendMessage(chatId, {
      text: removed
        ? "✅ Success: User warnings removed."
        : "User has no warnings.",
    });
  } catch (error) {
    await AlexaInc.sendMessage(chatId, {
      text: `Failed to remove warning: ${error.message}`,
    });
  }
}

module.exports = { warnUser, checkWarns, removeWarn };
