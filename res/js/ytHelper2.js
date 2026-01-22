const axios = require('axios');
const AXIOS_DEFAULTS = {
    timeout: 60000,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Origin': 'https://frame.y2meta-uk.com',
        'Referer': 'https://frame.y2meta-uk.com/',
        'Accept': 'application/json, text/plain, */*'
    }
};

async function tryRequest(getter, attempts = 3) {
    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
            return await getter();
        } catch (err) {
            lastError = err;
            if (attempt < attempts) {
                await new Promise(r => setTimeout(r, 1000 * attempt));
            }
        }
    }
    throw lastError;
}



async function _cnvConverter(url, format, quality) {
    const keyRes = await tryRequest(() => axios.get('https://cnv.cx/v2/sanity/key', AXIOS_DEFAULTS));
    const apiKey = keyRes.data.key;
    if (!apiKey) throw new Error('CNV: Could not fetch API Key');


    const params = new URLSearchParams();
    params.append('link', url);
    params.append('format', format); // 'mp3' or 'mp4'
    params.append('audioBitrate', format === 'mp4' ? '128' : quality); 
    params.append('videoQuality', format === 'mp3' ? '720' : quality); 
    params.append('filenameStyle', 'pretty');
    params.append('vCodec', 'h264');

    const convertRes = await tryRequest(() => axios.post('https://cnv.cx/v2/converter', params, {
        headers: { 
            ...AXIOS_DEFAULTS.headers,
            'Content-Type': 'application/x-www-form-urlencoded',
            'key': apiKey 
        }
    }));

    if (convertRes?.data?.url) {
        return { 
            download: convertRes.data.url, 
            title: `YouTube Download (${format})`, 
            source: 'CNV.cx' 
        };
    }
    throw new Error('CNV: Conversion returned no URL');
}


async function _oembedInfo(url) {
    const apiUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
    const res = await tryRequest(() => axios.get(apiUrl, AXIOS_DEFAULTS));
    
    if (res?.data) {
        return {
            title: res.data.title,
            thumbnail: res.data.thumbnail_url,
            duration: null,
            author: res.data.author_name,
            source: 'YouTube OEmbed'
        };
    }
    throw new Error('OEmbed Info failed');
}



async function getVideoInfo(youtubeUrl) {
    try {
        return await _oembedInfo(youtubeUrl);
    } catch (e) {
        console.error('⚠️ Info fetch failed:', e.message);
        return { title: 'Unknown Video', source: 'Error' };
    }
}

async function getVideo(youtubeUrl) {
    try {
        const info = await getVideoInfo(youtubeUrl);
        const result = await _cnvConverter(youtubeUrl, 'mp4', '480');
        return { ...result, title: info.title };
    } catch (e) {
        console.error('⚠️ Video download failed:', e.message);
        throw e;
    }
}

async function getAudio(youtubeUrl) {
    try {
        const info = await getVideoInfo(youtubeUrl);
        const result = await _cnvConverter(youtubeUrl, 'mp3', '128');
        return { ...result, title: info.title }; // Merge correct title
    } catch (e) {
        console.error('⚠️ Audio download failed:', e.message);
        throw e;
    }
}

// --- 4. Buffer Fetcher (Public) ---
/**
 * Downloads the content of a URL and returns it as a Buffer.
 * @param {string} url 
 * @returns {Promise<Buffer>}
 */
async function fetchBuffer(url) {
    const response = await axios.get(url, {
        ...AXIOS_DEFAULTS,
        responseType: 'arraybuffer'
    });
    return Buffer.from(response.data);
}

// --- Exports ---
module.exports = {
    getVideoInfo,
    getVideo,
    getAudio,
    fetchBuffer
};