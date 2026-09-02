const fetch = require('node-fetch');

const commonHeaders = {
    'accept': '*/*',
    'accept-language': 'en-GB,en-US;q=0.9,en;q=0.8',
    'content-type': 'application/json',
    'priority': 'u=1, i',
    'sec-ch-ua': '"Not=A?Brand";v="24", "Chromium";v="140"',
    'sec-ch-ua-mobile': '?1',
    'sec-ch-ua-platform': '"Android"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-origin',
    'Referer': 'https://hansaka1-ytdl.hf.space/',
    'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
};

const ytIdRegex = /(?:http(?:s|):\/\/|)(?:(?:www\.|)youtube(?:\-nocookie|)\.com\/(?:shorts\/)?(?:watch\?.*(?:|\&)v=|embed\/|v\/)|youtu\.be\/)([-_0-9A-Za-z]{11})/;

/**
 * Get Video Metadata (Returns JSON as requested)
 */
async function getInfo(url) {
    if (!ytIdRegex.test(url)) throw new Error('Invalid YouTube URL');
    
    const response = await fetch("https://hansaka1-ytdl.hf.space/get-info", {
        method: "POST",
        headers: commonHeaders,
        body: JSON.stringify({ url })
    });

    if (!response.ok) throw new Error(`Info API Error: ${response.status}`);
    return await response.json();
}

/**
 * Direct Buffer Downloader
 * Returns the raw binary Buffer instead of an object
 */
async function yt(url, type = 'audio') {
    if (!ytIdRegex.test(url)) throw new Error('Invalid YouTube URL');

    const response = await fetch("https://hansaka1-ytdl.hf.space/download", {
        method: "POST",
        headers: commonHeaders,
        body: JSON.stringify({ url, type })
    });

    if (!response.ok) throw new Error(`Download failed with status: ${response.status}`);

    // Return the raw buffer directly
    return await response.buffer();
}

module.exports = {
    getInfo,
    /**
     * Returns raw MP3 Buffer
     */
    async yta(url) { 
        return await yt(url, 'audio'); 
    },
    /**
     * Returns raw MP4 Buffer
     */
    async ytv(url) { 
        return await yt(url, 'video'); 
    }
};