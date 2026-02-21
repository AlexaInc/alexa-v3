const fetch = require('node-fetch');

const commonHeaders = {
    'accept': '*/*',
    'accept-language': 'en-GB,en-US;q=0.9,en;q=0.8',
    'content-type': 'application/json',
    'priority': 'u=1, i',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'origin': 'https://hansaka1-ytdl.hf.space',
    'referer': 'https://hansaka1-ytdl.hf.space/',
    'sec-ch-ua': '"Not=A?Brand";v="24", "Chromium";v="140"',
    'sec-ch-ua-mobile': '?1',
    'sec-ch-ua-platform': '"Android"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-origin'
};

const ytIdRegex = /(?:http(?:s|):\/\/|)(?:(?:www\.|)youtube(?:\-nocookie|)\.com\/(?:shorts\/)?(?:watch\?.*(?:|\&)v=|embed\/|v\/)|youtu\.be\/)([-_0-9A-Za-z]{11})/;

/**
 * Universal Downloader for Hansaka1 API
 * @param {string} url - YouTube URL
 * @param {string} type - "audio" or "video"
 */
async function yt(url, type = 'audio') {
    // 1. Validate URL
    const match = url.match(ytIdRegex);
    if (!match) throw new Error('Invalid YouTube URL');
    const ytId = match[1];

    // 2. Request conversion from the new API
    try {
        const response = await fetch("https://hansaka1-ytdl.hf.space/download", {
            method: "POST",
            headers: commonHeaders,
            body: JSON.stringify({
                url: url,
                type: type // "audio" or "video"
            })
        });

        if (!response.ok) {
            throw new Error(`API Error: ${response.status} ${response.statusText}`);
        }

        const result = await response.json();


        return {
            success: true,
            title: result.title || `YouTube_${ytId}`,
            dl_link: result.downloadUrl || result.link || result.url,
            thumb: `https://i.ytimg.com/vi/${ytId}/0.jpg`,
            type: type,
            metadata: result 
        };

    } catch (error) {
        throw new Error(`Download failed: ${error.message}`);
    }
}

module.exports = {
    yt,
    ytIdRegex,
    /**
     * Download Audio
     * @param {String} url 
     */
    yta(url) { 
        return yt(url, 'audio'); 
    },
    /**
     * Download Video
     * @param {String} url 
     */
    ytv(url) { 
        return yt(url, 'video'); 
    }
};
