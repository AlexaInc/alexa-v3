const { customsearch } = require('@googleapis/customsearch');
const axios = require('axios');
const cheerio = require('cheerio');
require('dotenv').config();

// --- CONFIGURATION ---
const API_KEY = process.env.GOOGLE_API_KEY;
const SEARCH_ENGINE_ID = process.env.GOOGLESEARCH_ENGINE_ID;

// --- Pre-flight check for environment variables ---
if (!API_KEY || !SEARCH_ENGINE_ID) {
  throw new Error('Missing GOOGLE_API_KEY or GOOGLESEARCH_ENGINE_ID from .env file. Please check your .env configuration.');
}

const googleSearch = customsearch({
  version: 'v1',
  auth: API_KEY,
});

/**
 * Scrapes a single website using Axios and Cheerio.
 * (This is a private helper function)
 */
async function scrapeSite(url) {
  try {
    const { data: html } = await axios.get(url, {
      timeout: 7000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36'
      }
    });

    const $ = cheerio.load(html);
    let firstParagraph = '';
    $('p').each((_i, el) => {
      const text = $(el).text().trim();
      if (text.length > 75) {
        firstParagraph = text;
        return false; // Break loop
      }
    });

    if (!firstParagraph) {
      firstParagraph = 'Could not find a suitable paragraph on this page.';
    }

    return { url: url, paragraph: firstParagraph };

  } catch (error) {
    // Return the error so it can be filtered out
    return {
      url: url,
      paragraph: `Error: Could not access or scrape this site.`
    };
  }
}

/**
 * Searches Google and scrapes for up to 5 good results.
 * @param {string} searchQuery - The query to search for.
 * @returns {Promise<Array<object>>} - A promise that resolves to an array of result objects.
 */
async function searchAndScrape(searchQuery) {
  try {
    // 1. Search Google
    const response = await googleSearch.cse.list({
      cx: SEARCH_ENGINE_ID,
      q: searchQuery,
      num: 10,
    });

    const searchResults = response.data.items;
    if (!searchResults || searchResults.length === 0) {
      return []; // Return an empty array
    }

    // 2. Filter out known bad sites
    const candidateLinks = searchResults
      .map(result => result.link)
      .filter(link => !link.includes('reddit.com'));
      
    // 3. Loop and scrape until we have 5 good results
    const finalResults = [];
    for (const link of candidateLinks) {
      const result = await scrapeSite(link);

      // Check if the result is valid (not an error)
      const isError = result.paragraph.startsWith('Error: Could not access') ||
                      result.paragraph.startsWith('Could not find a suitable');

      if (!isError) {
        finalResults.push(result);
      }

      // 4. Stop when we have 5 results
      if (finalResults.length >= 5) {
        break; // Exit the loop
      }
    }

    // 5. Return the final data
    return finalResults;

  } catch (error) {
    // If the API itself fails, throw the error
    throw error;
  }
}

// Export the main function
module.exports = searchAndScrape

