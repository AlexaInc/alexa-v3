const axios = require("axios");

/**
 * WhatsApp style formatting (*bold*, _italic_, ~strike~, `code`, ```pre```)
 * Telegram Entities බවට පරිවර්තනය කරන Helper Function එක.
 */
function parseWhatsAppFormatting(text) {
  if (!text) return { cleanText: "", entities: [] };

  // Format Regex Map
  const rules = [
    { type: "pre", regex: /```([\s\S]+?)```/g },
    { type: "code", regex: /`([^`\n]+?)`/g },
    { type: "bold", regex: /(?<=^|[^\w*])\*([^\n*]+?)\*(?=$|[^\w*])/g },
    { type: "italic", regex: /(?<=^|[^\w_])_([^\n_]+?)_(?=$|[^\w_])/g },
    { type: "strikethrough", regex: /(?<=^|[^\w~])~([^\n~]+?)~(?=$|[^\w~])/g },
  ];

  const matches = [];

  // formating matches
  for (const rule of rules) {
    let match;
    while ((match = rule.regex.exec(text)) !== null) {
      matches.push({
        type: rule.type,
        start: match.index,
        end: match.index + match[0].length,
        innerStart: match.index + (rule.type === "pre" ? 3 : 1),
        innerEnd: match.index + match[0].length - (rule.type === "pre" ? 3 : 1),
        rawText: match[0],
        innerText: match[1],
      });
    }
  }

  // Overlappingprevent
  matches.sort((a, b) => a.start - b.start);

  let cleanText = "";
  const entities = [];
  let lastIndex = 0;

  for (const m of matches) {
    // Overlapping tags මගහැරීම
    if (m.start < lastIndex) continue;

    // Formatting st
    cleanText += text.slice(lastIndex, m.start);

    const entityOffset = cleanText.length;
    const entityLength = m.innerText.length;

    cleanText += m.innerText;

    entities.push({
      type: m.type,
      offset: entityOffset,
      length: entityLength,
    });

    lastIndex = m.end;
  }

  cleanText += text.slice(lastIndex);

  return { cleanText, entities };
}

const generatequote = async (
  firstname,
  lastname,
  costomemokjiid,
  msgText,
  senderColorid,
  ppbuffer,
  media,
  fmsgsender,
  fmessage,
  fmgscolorid,
) => {
  const API_URL = "https://quotlytga-quotecpp.hf.space/api/generate";

  let avatarBase64 = "";
  if (ppbuffer && Buffer.isBuffer(ppbuffer)) {
    avatarBase64 = `data:image/png;base64,${ppbuffer.toString("base64")}`;
  }

  // 1. WhatsApp Markups to entitiiiie
  const { cleanText: parsedMainText, entities: mainEntities } =
    parseWhatsAppFormatting(msgText);

  const messageObj = {
    id: 1,
    text: parsedMainText,
    entities: mainEntities,
    from: {
      id: 123456789,
      first_name: firstname || "User",
      last_name: lastname || "",
      emoji_status_custom_emoji_id: costomemokjiid || null,
    },
    avatarBase64: avatarBase64,
    nameColorId: parseInt(senderColorid) || 0,
  };

  // Media (Image / Sticker) processing
  if (media && media.mediabuf && Buffer.isBuffer(media.mediabuf)) {
    messageObj.mediaBase64 = `data:image/png;base64,${media.mediabuf.toString("base64")}`;
    messageObj.mediaType = media.issticker ? "sticker" : "photo";
  }

  // 2. Reply Message markup to entitiie
  if (fmessage) {
    const { cleanText: parsedReplyText, entities: replyEntities } =
      parseWhatsAppFormatting(fmessage);

    messageObj.reply_to = {
      text: parsedReplyText,
      from: {
        id: 0,
        first_name: fmsgsender || "User",
        last_name: "",
      },
      entities: replyEntities,
    };
    messageObj.replySender = fmsgsender || null;
    messageObj.replyMessage = parsedReplyText;
    messageObj.replySenderColor = parseInt(fmgscolorid) || 0;
  }

  const payload = {
    _info: {
      api: "QuotlyNative",
      endpoint: "POST /api/generate",
      telegram_user_id: 123456789,
      emoji_ids: costomemokjiid ? [costomemokjiid] : [],
    },
    transparent: true,
    webp: true,
    messages: [messageObj],
  };

  try {
    const response = await axios.post(API_URL, payload, {
      responseType: "arraybuffer",
      headers: {
        "Content-Type": "application/json",
      },
      timeout: 30000,
      proxy: false,
    });

    return Buffer.from(response.data);
  } catch (error) {
    const errorMsg = error.response
      ? error.response.data.toString()
      : error.message;
    console.error("❌ [QuoteAPI] Error:", errorMsg);
    throw new Error(`Quote generation failed: ${errorMsg}`);
  }
};

module.exports = generatequote;
