let fetch = require('node-fetch');

const commonHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Origin': 'https://frame.y2meta-uk.com',
    'Referer': 'https://frame.y2meta-uk.com/',
    'Accept': 'application/json, text/javascript, */*; q=0.01'
};

const ytIdRegex = /(?:http(?:s|):\/\/|)(?:(?:www\.|)youtube(?:\-nocookie|)\.com\/(?:shorts\/)?(?:watch\?.*(?:|\&)v=|embed\/|v\/)|youtu\.be\/)([-_0-9A-Za-z]{11})/;

/**
 * Direct API Downloader (Reverse engineered from frame.y2meta-uk.com)
 */
async function yt(url, quality, type, bitrate, server = 'en68') {
    if (!ytIdRegex.test(url)) throw new Error('Invalid URL');
    let ytId = ytIdRegex.exec(url)[1];
    let videoUrl = 'https://youtu.be/' + ytId;

    // 1. Get the Validation Key
    // The site fetches this from https://cnv.cx/v2/sanity/key
    let keyRes = await fetch('https://cnv.cx/v2/sanity/key', {
        method: 'GET',
        headers: commonHeaders
    });
    
    if (!keyRes.ok) throw new Error(`Failed to get API key (Status: ${keyRes.status})`);
    let keyData = await keyRes.json();
    let apiKey = keyData.key;

    if (!apiKey) throw new Error("API Key not found in server response.");

    // 2. Prepare Data for Conversion
    // Logic extracted from: getdownulrfromc() in the HTML source
    // aqual = (vtype === 'mp4') ? 128 : vqual;
    // vqual = (vtype === 'mp3') ? 720 : vqual;
    
    // Normalize inputs based on site logic
    let format = type; // 'mp3' or 'mp4'
    let audioBitrate = (format === 'mp4') ? '128' : bitrate; // mp4 always uses 128k audio param
    let videoQuality = (format === 'mp3') ? '720' : quality.replace('p', ''); // mp3 sends '720' as dummy video quality
    
    let params = new URLSearchParams();
    params.append('link', videoUrl);
    params.append('format', format);
    params.append('audioBitrate', audioBitrate);
    params.append('videoQuality', videoQuality);
    params.append('filenameStyle', 'pretty');
    params.append('vCodec', 'h264');

    // 3. Send Conversion Request
    let convertRes = await fetch('https://cnv.cx/v2/converter', {
        method: 'POST',
        headers: {
            ...commonHeaders,
            'Content-Type': 'application/x-www-form-urlencoded',
            'key': apiKey // Header required by API
        },
        body: params
    });

    if (!convertRes.ok) throw new Error(`Conversion API failed (Status: ${convertRes.status})`);
    
    let result = await convertRes.json();

    // 4. Handle Result
    if (result && result.url) {
        return {
            dl_link: result.url,
            thumb: `https://i.ytimg.com/vi/${ytId}/0.jpg`,
            title: `YouTube_${ytId}`, // The API doesn't always return title in JSON, but the file link has it
            filesizeF: "Unknown", // API doesn't return size immediately for this method
            filesize: 0
        };
    } else {
        // Fallback logic mentioned in their script
        // dwn_url = 'https://conv.mp3youtube.cc/download/' + videoId;
        // We throw error for now as the main API usually works
        throw new Error("API returned success but no URL. Valid inputs?");
    }
}

module.exports = {
    yt,
    ytIdRegex,
    /**
     * Download Audio (MP3)
     * @param {String} url YouTube URL
     * @param {String} bitrate 128 or 320
     */
    yta(url, bitrate = '128') { 
        return yt(url, '0', 'mp3', bitrate); 
    },
    /**
     * Download Video (MP4)
     * @param {String} url YouTube URL
     * @param {String} quality 360, 480, 720, 1080
     */
    ytv(url, quality = '360') { 
        return yt(url, quality, 'mp4', '128'); 
    },
    servers: ['en68'] 
};