// filters.js
const fs = require('fs');
const path = require('path');

// 1. Create the directory path
const dbDirectory = path.join(__dirname, 'filters');

// 2. Set the full path to the file
const dbPath = path.join(dbDirectory, 'filters.json');

/**
 * Ensures the database directory and file exist
 */
function initializeDB() {
  try {
    // Create the directory if it doesn't exist
    if (!fs.existsSync(dbDirectory)) {
      fs.mkdirSync(dbDirectory);
      console.log('Created filters directory.');
    }
    
    // Create the file if it doesn't exist
    if (!fs.existsSync(dbPath)) {
      fs.writeFileSync(dbPath, '{}', 'utf8');
      console.log('Created filters.json file.');
    }
  } catch (err) {
    console.error('Error initializing database:', err);
  }
}

/**
 * Loads the filters database from filters.json
 * @returns {object} The filters object
 */
function loadFilters() {
  initializeDB(); // Ensure file exists before reading
  try {
    const data = fs.readFileSync(dbPath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error reading filters.json:', err);
    return {}; // Return empty object on error
  }
}

/**
 * Saves the filters database to filters.json
 * @param {object} filters The filters object to save
 */
function saveFilters(filters) {
  initializeDB(); // Ensure directory exists before writing
  try {
    const data = JSON.stringify(filters, null, 2); // Pretty-print JSON
    fs.writeFileSync(dbPath, data, 'utf8');
  } catch (err) {
    console.error('Error writing to filters.json:', err);
  }
}

/**
 * Adds a new filter for a specific group
 * @param {string} groupId The JID of the group
 * @param {object} filter The filter object to add (e.g., {trigger, type, reply, mimetype})
 */
function addFilter(groupId, filter) {
  const filters = loadFilters();
  
  if (!filters[groupId]) {
    filters[groupId] = [];
  }
  
  // Check if trigger already exists and remove it to avoid duplicates
  filters[groupId] = filters[groupId].filter(f => f.trigger.toLowerCase() !== filter.trigger.toLowerCase());
  
  // Add the new filter
  filters[groupId].push(filter);
  saveFilters(filters);
  console.log(`[Filter] Added filter for ${groupId}: ${filter.trigger}`);
}

/**
 * Removes a filter for a specific group
 * @param {string} groupId The JID of the group
 * @param {string} trigger The trigger keyword to remove
 * @returns {boolean} True if a filter was removed, false otherwise
 */
function removeFilter(groupId, trigger) {
  const filters = loadFilters();
  
  if (!filters[groupId] || filters[groupId].length === 0) {
    return false; // No filters for this group
  }
  
  const initialLength = filters[groupId].length;
  filters[groupId] = filters[groupId].filter(f => f.trigger.toLowerCase() !== trigger.toLowerCase());
  
  if (filters[groupId].length < initialLength) {
    saveFilters(filters);
    console.log(`[Filter] Removed filter for ${groupId}: ${trigger}`);
    return true; // Filter was removed
  }
  
  return false; // Filter was not found
}

/**
 * Gets all filters for a specific group
 * @param {string} groupId The JID of the group
 * @returns {Array} An array of filter objects or an empty array
 */
function getFilters(groupId) {
  const filters = loadFilters();
  return filters[groupId] || [];
}

/**
 * Checks a message against all filters for a group
 * @param {string} groupId The JID of the group
 * @param {string} text The message text to check
 * @returns {object|null} The matched filter object or null
 */
function checkFilters(groupId, text) {
  const groupFilters = getFilters(groupId);
  if (groupFilters.length === 0) {
    return null;
  }

  // Find the first filter that matches the text exactly
  // Use toLowerCase() for case-insensitive matching
  const matchedFilter = groupFilters.find(f => f.trigger.toLowerCase() === text.toLowerCase());
  
  return matchedFilter || null;
}

// Export the functions
module.exports = {
  addFilter,
  removeFilter,
  getFilters,
  checkFilters,
};