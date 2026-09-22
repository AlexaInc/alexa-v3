const groupAnalytics = require("../services/groupAnalytics");

async function muteCommand(
  AlexaInc,
  chatId,
  senderId,
  message,
  durationInMinutes,
) {
  try {
    await AlexaInc.groupSettingUpdate(chatId, "announcement");
    await groupAnalytics.recordModeration({
      groupId: chatId,
      adminId: senderId,
      eventType: "group_muted",
      metadata: { durationMinutes: durationInMinutes || null },
    });

    if (durationInMinutes !== undefined && durationInMinutes > 0) {
      const durationInMilliseconds = durationInMinutes * 60 * 1000;
      await AlexaInc.sendMessage(
        chatId,
        { text: `The group has been muted for ${durationInMinutes} minutes.` },
        { quoted: message },
      );

      setTimeout(async () => {
        try {
          await AlexaInc.groupSettingUpdate(chatId, "not_announcement");
          await groupAnalytics.recordModeration({
            groupId: chatId,
            adminId: senderId,
            eventType: "group_unmuted",
            reason: "Timed mute expired",
            metadata: { automatic: true },
          });
          await AlexaInc.sendMessage(chatId, {
            text: "The group has been unmuted.",
          });
        } catch (unmuteError) {
          console.error("Error unmuting group:", unmuteError);
        }
      }, durationInMilliseconds);
    } else {
      await AlexaInc.sendMessage(
        chatId,
        { text: "The group has been muted." },
        { quoted: message },
      );
    }
  } catch (error) {
    console.error("Error muting/unmuting the group:", error);
    await AlexaInc.sendMessage(
      chatId,
      {
        text: "An error occurred while muting/unmuting the group. Please try again.",
      },
      { quoted: message },
    );
  }
}

async function unmuteCommand(AlexaInc, chatId, senderId = null) {
  await AlexaInc.groupSettingUpdate(chatId, "not_announcement");
  await groupAnalytics.recordModeration({
    groupId: chatId,
    adminId: senderId,
    eventType: "group_unmuted",
  });
  await AlexaInc.sendMessage(chatId, { text: "The group has been unmuted." });
}
module.exports = { muteCommand, unmuteCommand };
