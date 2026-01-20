const { Client } = require("@gradio/client");

/**
 * @param {Buffer} imageBuffer
 * @returns {Promise<Object>}
 */
async function validStrengerss(imageBuffer) {
    try {
        const client = await Client.connect("hansaka1/ibdetect");

    
        const imageBlob = new Blob([imageBuffer], { type: "image/jpeg" });

 
        const result = await client.predict("/validate_chat_origin", [ imageBlob ]);
        

        return result.data[0];

    } catch (error) {
        console.error("Validation Error:", error);
        return { valid: false, error: error.message, reason: "API Connection Failed" };
    }
}

module.exports = { validStrengerss };