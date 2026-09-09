const axios = require("axios");

/**
 * WhatsApp style formatting (*bold*, _italic_, ~strike~, `code`, ```pre```)
 * Telegram Entities බවට පරිවර්තනය කරන Helper Function එක.
 */

const generatequote = async (messageObj, costomemokjiids) => {
  const API_URL = "https://quotlytga-quotecpp.hf.space/api/generate";

  const payload = {
    _info: {
      api: "QuotlyNative",
      endpoint: "POST /api/generate",
      telegram_user_id: 123456789,
      emoji_ids: costomemokjiids ? costomemokjiids : [],
    },
    transparent: true,
    webp: true,
    messages: messageObj,
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
