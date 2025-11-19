const axios = require('axios');

// --- Configuration ---
const AXIOS_DEFAULTS = {
    timeout: 60000,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*'
    }
};

// --- 1. Retry Helper ---
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

// --- 2. API Wrappers (Internal) ---

// Okatsu API - MP4 (Video)
async function _okatsuMp4(url) {
    const apiUrl = `https://okatsu-rolezapiiz.vercel.app/downloader/ytmp4?url=${encodeURIComponent(url)}`;
    const res = await tryRequest(() => axios.get(apiUrl, AXIOS_DEFAULTS));
    if (res?.data?.result?.mp4) {
        return { download: res.data.result.mp4, title: res.data.result.title, source: 'Okatsu' };
    }
    throw new Error('Okatsu MP4 failed');
}

// Okatsu API - MP3 (Audio)
async function _okatsuMp3(url) {
    const apiUrl = `https://okatsu-rolezapiiz.vercel.app/downloader/ytmp3?url=${encodeURIComponent(url)}`;
    const res = await tryRequest(() => axios.get(apiUrl, AXIOS_DEFAULTS));
    if (res?.data?.dl) {
        return { download: res.data.dl, title: res.data.title, source: 'Okatsu' };
    }
    throw new Error('Okatsu MP3 failed');
}

// Izumi API - MP4 (Video)
async function _izumiMp4(url) {
    const apiUrl = `https://izumiiiiiiii.dpdns.org/downloader/youtube?url=${encodeURIComponent(url)}&format=720`;
    const res = await tryRequest(() => axios.get(apiUrl, AXIOS_DEFAULTS));
    if (res?.data?.result?.download) {
        return { download: res.data.result.download, title: res.data.result.title, source: 'Izumi' };
    }
    throw new Error('Izumi MP4 failed');
}

// Izumi API - MP3 (Audio)
async function _izumiMp3(url) {
    const apiUrl = `https://izumiiiiiiii.dpdns.org/downloader/youtube?url=${encodeURIComponent(url)}&format=mp3`;
    const res = await tryRequest(() => axios.get(apiUrl, AXIOS_DEFAULTS));
    if (res?.data?.result?.download) {
        return { download: res.data.result.download, title: res.data.result.title, source: 'Izumi' };
    }
    throw new Error('Izumi MP3 failed');
}

// --- Info Extractors (Internal) ---

async function _okatsuInfo(url) {
    const apiUrl = `https://okatsu-rolezapiiz.vercel.app/downloader/ytmp3?url=${encodeURIComponent(url)}`;
    const res = await tryRequest(() => axios.get(apiUrl, AXIOS_DEFAULTS));
    
    if (res?.data && res.data.title) {
        return {
            title: res.data.title,
            thumbnail: res.data.thumb,
            duration: res.data.duration,
            author: res.data.creator || 'Unknown',
            source: 'Okatsu'
        };
    }
    throw new Error('Okatsu Info failed');
}

async function _izumiInfo(url) {
    const apiUrl = `https://izumiiiiiiii.dpdns.org/downloader/youtube?url=${encodeURIComponent(url)}&format=720`;
    const res = await tryRequest(() => axios.get(apiUrl, AXIOS_DEFAULTS));
    
    if (res?.data?.result) {
        const r = res.data.result;
        return {
            title: r.title,
            thumbnail: r.thumb || r.thumbnail || null,
            duration: r.duration || null,
            source: 'Izumi'
        };
    }
    throw new Error('Izumi Info failed');
}

// --- 3. Main Logic Functions (Public) ---

async function getVideoInfo(youtubeUrl) {
    try {
        return await _okatsuInfo(youtubeUrl);
    } catch (e) {
        return await _izumiInfo(youtubeUrl);
    }
}

async function getVideo(youtubeUrl) {
    try {
        return await _okatsuMp4(youtubeUrl);
    } catch (e) {
        console.warn('   ⚠️ Okatsu Video failed, trying Izumi fallback...');
        return await _izumiMp4(youtubeUrl);
    }
}

async function getAudio(youtubeUrl) {
    try {
        return await _okatsuMp3(youtubeUrl);
    } catch (e) {
        console.warn('   ⚠️ Okatsu Audio failed, trying Izumi fallback...');
        return await _izumiMp3(youtubeUrl);
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