// test.js
const dl = require('../src/modules/ytHelper2');

(async () => {
    const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
    
    console.log('Fetching Info...');
    const info = await dl.getVideoInfo(url);
    console.log('Info:', info);

    console.log('\nFetching Audio Link...');
    const audio = await dl.getAudio(url);
    console.log('Audio Result:', audio);

    // Uncomment to test Buffer Download (Heavy)
    console.log('\nDownloading Buffer...');
    const buf = await dl.fetchBuffer(audio.download);
    console.log('Buffer Size:', buf.length);
})();