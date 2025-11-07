// ytHelper.js
const youtubedl = require('youtube-dl-exec');
const path = require('path');
const fsp = require('fs').promises;
const fs = require('fs'); // Added for checking/creating the temp dir
const { Cookie } = require('tough-cookie');
const COOKIE_FILE_PATH = path.join(__dirname, 'cookies.txt');
// --- BASE CONFIGURATION ---
const BASE_OPTIONS = {
  cookies:COOKIE_FILE_PATH,
  noWarnings: true,
};

// --- NEW: Hardcoded Temp Directory ---
const TEMP_DIR = path.join(__dirname, 'downloads');

// Ensure the temp directory exists
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

/**
 * Gets all available information for a video.
 */
async function getVideoInfo(url) {
  try {
    const options = {
      ...BASE_OPTIONS,
      dumpSingleJson: true,
    };
    return await youtubedl(url, options);
  } catch (error) {
    console.error(`Error getting info for ${url}:`, error.stderr || error.message);
    throw error;
  }
}

/**
 * Gets a clean list of available formats (qualities).
 */
async function getFormats(url) {
  const info = await getVideoInfo(url);
  if (!info || !info.formats) {
    throw new Error('Could not retrieve formats.');
  }
  // Return a cleaned-up list
  return info.formats.map(f => ({
    format_id: f.format_id,
    ext: f.ext,
    resolution: f.resolution,
    fps: f.fps,
    vcodec: f.vcodec,
    acodec: f.acodec,
    note: `[${f.format_id}] ${f.resolution || f.acodec} (${f.ext})`
  }));
}

/**
 * Finds the best available format IDs for streaming.
 */
async function getBestFormats(url) {
  const info = await getVideoInfo(url);
  if (!info || !info.formats) {
    throw new Error('Could not retrieve formats.');
  }

  const mergedFormat = info.formats
    .filter(f => f.vcodec !== 'none' && f.acodec !== 'none' && f.ext === 'mp4')
    .sort((a, b) => b.height - a.height)[0];
  
  const audioFormat = info.formats
    .filter(f => f.acodec !== 'none' && f.vcodec === 'none' && (f.ext === 'm4a' || f.ext === 'opus'))
    .sort((a, b) => b.abr - a.abr)[0];

  const videoFormat = info.formats
    .filter(f => f.vcodec !== 'none' && f.acodec === 'none' && f.ext === 'mp4')
    .sort((a, b) => b.height - a.height)[0];

  return {
    merged: mergedFormat ? mergedFormat.format_id : null,
    audio: audioFormat ? audioFormat.format_id : null,
    video: videoFormat ? videoFormat.format_id : null
  };
}


/**
 * Returns a readable stream for a specific format.
 * @param {string} url - The YouTube video URL.
 * @param {string} formatId - The format_id (e.g., '22', '140')
 * @returns {ChildProcess} A child process.
 */
function getDownloadStream(url, formatId) {
  if (!formatId) {
    throw new Error('A valid format ID is required.');
  }
  const options = {
    ...BASE_OPTIONS,
    format: formatId,
    output: '-', 
  };
  
  // Return the entire process. We will listen to stdout/stderr
  // in the function that calls this one.
  return youtubedl(url, options); 
}

/**
 * Downloads and merges the best-quality video+audio to a FILE.
 */
async function downloadBestMergedToFile(url, outputDir = TEMP_DIR) {
  console.log(`Starting best-quality FILE download for ${url}...`);
  const info = await getVideoInfo(url);
  const title = info.title.replace(/[<>:"/\\|?*]+/g, '');
  const finalPath = path.join(outputDir, `${title}.mp4`);
  const options = {
    ...BASE_OPTIONS,
    format: 'bv[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/b',
    mergeOutputFormat: 'mp4',
    output: finalPath,
  };
  await youtubedl(url, options);
  console.log(`Download complete: ${finalPath}`);
  return finalPath;
}

/**
 * Downloads a specific single-file format (like 360p or 480p) to a file.
 */
async function downloadSingleFormatToFile(url, formatId, outputDir = TEMP_DIR) {
  console.log(`Starting download for format ${formatId} from ${url}...`);
  const info = await getVideoInfo(url);
  const format = info.formats.find(f => f.format_id === formatId);
  if (!format) throw new Error(`Format ID ${formatId} not found.`);
  if (format.acodec === 'none' || format.vcodec === 'none') {
    console.warn('Warning: This format is audio-only or video-only. Use getDownloadStream for this.');
  }
  const title = info.title.replace(/[<>:"/\\|?*]+/g, '');
  const finalPath = path.join(outputDir, `${title} [${format.resolution}].${format.ext}`);
  const options = {
    ...BASE_OPTIONS,
    format: formatId,
    output: finalPath,
  };
  await youtubedl(url, options);
  console.log(`Download complete: ${finalPath}`);
  return finalPath;
}

/**
 * Downloads the best audio and converts it to MP3.
 */
async function downloadAudioAsMp3(url, outputDir = TEMP_DIR) {
  console.log(`Starting MP3 download for ${url}...`);
  const info = await getVideoInfo(url);
  const title = info.title.replace(/[<>:"/\\|?*]+/g, '');
  const outputPathTemplate = path.join(outputDir, `${title}.%(ext)s`);
  const options = {
    ...BASE_OPTIONS,
    output: outputPathTemplate,
    extractAudio: true,
    audioFormat: 'mp3',
    audioQuality: 0,
  };
  await youtubedl(url, options);
  const finalPath = path.join(outputDir, `${title}.mp3`);
  console.log(`MP3 download complete: ${finalPath}`);
  return finalPath;
}

/**
 * Finds the best single-file MP4 format for a given quality.
 */
async function findVideoFormat(url, quality) {
  const formats = await getFormats(url);
  const targetHeight = parseInt(quality, 10);
  const found = formats
    .filter(f => 
      f.ext === 'mp4' && 
      f.acodec !== 'none' && 
      f.vcodec !== 'none' &&
      f.resolution &&
      parseInt(f.resolution.split('x')[1], 10) === targetHeight
    )
    .sort((a, b) => b.fps - a.fps)[0];
  return found ? found.format_id : null;
}


// ==========================================================
// --- Buffer Functions ---
// ==========================================================

// ytHelper.js

// ytHelper.js

/**
 * [DANGEROUS] Downloads a single format video/audio and returns it as a Buffer.
 * This loads the ENTIRE file into RAM. May crash on large files.
 * @param {string} url - The YouTube video URL.
 * @param {string} formatId - The format_id (e.g., '22', '140')
 * @returns {Promise<Buffer>} A promise that resolves to a Buffer of the file.
 */
function downloadSingleFormatToBuffer(url, formatId) {
  console.log(`Starting stream-to-buffer for format ${formatId}...`);
  
  return new Promise((resolve, reject) => {
    // 1. Set up the options for streaming
    const options = {
      ...BASE_OPTIONS,
      format: formatId,
      output: '-', // Stream to stdout
    };
    
    let process;
    try {
      // 2. Call youtubedl *directly*
      process = youtubedl(url, options);
    } catch (spawnError) {
      return reject(spawnError);
    }
    
    // 3. Check for the process and its stdout
    if (!process || !process.stdout) {
       return reject(new Error('Failed to spawn download process or stdout is null.'));
    }
    
    // 4. Get the stream and set up listeners
    const stream = process.stdout;
    const chunks = [];
    const stderrChunks = [];
    
    // --- Listen to all events ---
    
    stream.on('data', (chunk) => {
      chunks.push(chunk);
    });
    
    stream.on('error', (err) => {
      reject(new Error(`Stream error: ${err.message}`));
    });
    
    stream.on('end', () => {
      // Success
      console.log('Stream finished. Concatenating buffer.');
      resolve(Buffer.concat(chunks));
    });
    
    // Listen for errors from yt-dlp
    process.stderr.on('data', (data) => {
      stderrChunks.push(data);
    });
    
    // Listen for errors in the process itself
    process.on('error', (err) => {
       reject(new Error(`Process spawn error: ${err.message}`));
    });
    
    // Listen for the process exiting
    process.on('close', (code) => {
      // Check if it's an error exit
      if (code !== 0 && chunks.length === 0) {
        // Get the real error message from yt-dlp
        const errorOutput = Buffer.concat(stderrChunks).toString();
        reject(new Error(`Download process failed (code ${code}): ${errorOutput}`));
      }
    });
  });
}



/**
 * [DANGEROUS] Downloads and converts audio to MP3, returning it as a Buffer.
 * This saves a temp file, reads it into RAM, and then deletes it.
 * @param {string} url - The YouTube video URL.
 * @returns {Promise<Buffer>} A promise that resolves to a Buffer of the MP3 file.
 */
async function downloadAudioAsMp3ToBuffer(url) { // <-- PARAMETER REMOVED
  console.log(`Starting MP3 download-to-buffer for ${url}...`);

  const info = await getVideoInfo(url);
  const title = info.title.replace(/[<>:"/\\|?*]+/g, '');
  
  // Create a unique temp file path using the hardcoded TEMP_DIR
  const tempFileName = `${title}-${Date.now()}.mp3`;
  const tempPath = path.join(TEMP_DIR, tempFileName);

  const options = {
    ...BASE_OPTIONS,
    output: tempPath, // Save to temp file
    extractAudio: true,
    audioFormat: 'mp3',
    audioQuality: 0,
  };

  await youtubedl(url, options); // Wait for file to be created
  
  console.log(`Temp file created. Reading to buffer...`);
  let fileBuffer;
  try {
    fileBuffer = await fsp.readFile(tempPath);
  } catch (readError) {
    console.error('Failed to read temp file:', readError);
    await fsp.unlink(tempPath).catch(delError => console.error('Failed to delete temp file:', delError));
    throw readError;
  }
  try {
    await fsp.unlink(tempPath);
    console.log(`Temp file deleted. Returning buffer.`);
  } catch (delError) {
    console.error('Warning: Failed to delete temp file:', delError);
  }
  return fileBuffer;
}

/**
 * [DANGEROUS] Finds a specific video quality (e.g., '360') and returns it as a Buffer.
 */
async function downloadQualityToBuffer(url, quality) {
  console.log(`Finding format for ${quality}p...`);
  
  const formatId = await findVideoFormat(url, quality);
  
  if (!formatId) {
    throw new Error(`Could not find a ${quality}p MP4 format with audio.`);
  }
  
  console.log(`Found format ID: ${formatId}. Downloading to buffer...`);
  
  return await downloadSingleFormatToBuffer(url, formatId);
}

/**
 * Downloads the best audio and converts it to OGG Opus (for voice messages).
 */
async function downloadAudioAsOgg(url, outputDir = TEMP_DIR) {
  console.log(`Starting OGG (voice) download for ${url}...`);
  const info = await getVideoInfo(url);
  const title = info.title.replace(/[<>:"/\\|?*]+/g, '');
  
  // yt-dlp will add the .opus extension automatically
  const outputPathTemplate = path.join(outputDir, `${title}`); 
  // This is the path we expect the file to be at
  const finalPath = path.join(outputDir, `${title}.opus`); 

  const options = {
    ...BASE_OPTIONS,
    output: outputPathTemplate, // e.g., /tmp/SongTitle
    extractAudio: true,
    audioFormat: 'opus', // yt-dlp will save as .opus
    audioQuality: 0,
  };

  await youtubedl(url, options);

  // Verify the file exists
  if (!fs.existsSync(finalPath)) {
    // This is a fallback check in case yt-dlp saves with a different name
    const oggPath = path.join(outputDir, `${title}.ogg`);
     if (fs.existsSync(oggPath)) {
        console.log(`OGG/Opus download complete: ${oggPath}`);
        return oggPath;
     }
    throw new Error(`Downloaded opus file not found at ${finalPath}`);
  }
  
  console.log(`OGG/Opus download complete: ${finalPath}`);
  return finalPath;
}


// ... (rest of your helper file)

// Export all functions
module.exports = {
  getVideoInfo,
  getFormats,
  getBestFormats,
  getDownloadStream,
  downloadBestMergedToFile,
  downloadSingleFormatToFile, 
  downloadAudioAsMp3,
  downloadAudioAsOgg, // <-- ADD THE NEW FUNCTION HERE
  findVideoFormat,
  downloadSingleFormatToBuffer,
  downloadAudioAsMp3ToBuffer,
  downloadQualityToBuffer,
};