// File: emoji-kitchen.js
const axios = require('axios');

// --- 1. Get the API key from process.env ---

// -------------------------------------------
require('dotenv').config();
const clientKey = 'emoji_kitchen_funbox';
const collection = 'emoji_kitchen_v6';
const baseURL = 'https://tenor.googleapis.com/v2/featured';
const apiKey = process.env.TENOR_API_KEY;
async function getEmojicook(emoji1, emoji2) {
    // --- 2. Check if the key was loaded ---
    if (!apiKey) {
        throw new Error('TENOR_API_KEY not found in .env file');
    }
    // --------------------------------------

    const query = `${emoji1}_${emoji2}`;
    // The apiKey variable is now used here
    const apiUrl = `${baseURL}?key=${apiKey}&client_key=${clientKey}&q=${encodeURIComponent(query)}&collection=${collection}&contentfilter=high`;

    try {
        const apiResponse = await axios.get(apiUrl);

        let imageUrl;
        if (apiResponse.data && apiResponse.data.results && apiResponse.data.results.length > 0) {
            imageUrl = apiResponse.data.results[0].media_formats.png_transparent.url;
        } else {
            throw new Error('Emoji combination not found.');
        }

        const imageResponse = await axios.get(imageUrl, {
            responseType: 'arraybuffer'
        });

        return Buffer.from(imageResponse.data);

    } catch (error) {
        if (error.response) {
            throw new Error(`API request failed with status ${error.response.status}`);
        }
        throw error;
    }
}

module.exports = { getEmojicook };