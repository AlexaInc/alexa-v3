const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Function to get video info and download video
async function downloadVideo(vidid) {
    const url = `https://www.youtube.com/watch?v=${vidid}`;
    const resultArr = [];

    try {
        // Step 1: Fetch video information
        const infoResponse = await axios.post('https://hansaka1-ytdl2.hf.space/get-info', { url });

        // Extract video details from the response
        const { title, duration } = infoResponse.data;

        // Step 2: Fetch video and audio (in mp4 format) for download
        const videoResponse = await axios.post('https://hansaka1-ytdl2.hf.space/download', { url }, {
            responseType: 'arraybuffer',  // Specify the response type as binary data
        });

        // Define the video path where we want to save it
        const videoFileName = `${vidid}.mp3`;
        const videoFilePath = path.join(__dirname, '../temp', videoFileName);

        // Save the video file to the filesystem
        fs.writeFileSync(videoFilePath, videoResponse.data);

        //console.log(`Video downloaded successfully: ${videoFilePath}`);

        // Create the caption string for the response
        const playTime = formatDuration(duration); // Format duration into "MM:SS"
        const caption = {Title: `${title}`,Playtime: `${playTime}`};

        // Add the result to the result array
        resultArr.push({
            downloaded: true,
            caption: caption,
            videoPath: videoFilePath,
        });

        return resultArr;

    } catch (error) {
        console.error('Error downloading video or fetching info:', error);
        resultArr.push({ downloaded: false });
        return resultArr;
    }
}

// Helper function to format the video duration (in seconds) to MM:SS format
function formatDuration(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

// Example usage

module.exports = downloadVideo;
