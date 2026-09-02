const axios = require('axios');
const cheerio = require('cheerio');

const mediafireDl = async (url) => {
    try {
        // Request the URL with a User-Agent header
        const res = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        
        // Load the HTML data into cheerio
        const $ = cheerio.load(res.data);
        
        // Create an array to hold the results
        const hasil = [];
        
        // Get the download link and size from the page
        const link = $('a#downloadButton').attr('href');
        const size = $('a#downloadButton').text()
            .replace('Download', '')    // Remove the 'Download' text
            .replace('(', '')          // Remove '('
            .replace(')', '')          // Remove ')'
            .replace(/\s+/g, ' ')      // Replace multiple spaces with a single space
            .trim();                   // Remove leading and trailing spaces
        
        if (link) {
            const seplit = link.split('/');
            const nama = seplit[5];  // Assuming the name is at index 5
            const mime = nama.split('.').pop(); // Extract file extension as MIME type
            
            // Push the result into the array
            hasil.push({ nama, mime, size, link });
        } else {
            console.error('Download link not found!');
        }
        
        return hasil;
    } catch (error) {
        console.error('Error fetching data:', error.message);
        return [];
    }
};

module.exports = { mediafireDl };
