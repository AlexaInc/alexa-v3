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
 * Get Video Metadata
 * @param {string} url - YouTube URL
 */
async function getInfo(url) {
    if (!ytIdRegex.test(url)) throw new Error('Invalid YouTube URL');
    
    try {
        const response = await fetch("https://hansaka1-ytdl.hf.space/get-info", {
            method: "POST",
            headers: commonHeaders,
            body: JSON.stringify({ url })
        });

        if (!response.ok) throw new Error(`Info API Error: ${response.status}`);
        
        const data = await response.json();
        return data; // Returns { status, title, thumbnail, video_id }
    } catch (error) {
        throw new Error(`Failed to fetch video info: ${error.message}`);
    }
}

/**
 * Universal Downloader
 * @param {string} url - YouTube URL
 * @param {string} type - "audio" or "video"
 */
async function yt(url, type = 'audio') {
    if (!ytIdRegex.test(url)) throw new Error('Invalid YouTube URL');

    try {
        const response = await fetch("https://hansaka1-ytdl.hf.space/download", {
            method: "POST",
            headers: commonHeaders,
            body: JSON.stringify({
                url: url,
                type: type
            })
        });

        if (!response.ok) throw new Error(`Download API Error: ${response.status}`);

        const result = await response.json();

        // The API returns a download link in the response
        return {
            status: result.status || 'success',
            title: result.title || 'YouTube Video',
            dl_link: result.downloadUrl || result.url || result.link,
            type: type,
            thumb: result.thumbnail || `https://i.ytimg.com/vi/${ytIdRegex.exec(url)[1]}/hqdefault.jpg`
        };

    } catch (error) {
        throw new Error(`Download failed: ${error.message}`);
    }
}

module.exports = {
    getInfo,
    yt,
    /**
     * Download Audio (MP3)
     * @param {String} url 
     */
    yta(url) { 
        return yt(url, 'audio'); 
    },
    /**
     * Download Video (MP4)
     * @param {String} url 
     */
    ytv(url) { 
        return yt(url, 'video'); 
    }
};