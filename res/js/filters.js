// filters.js
const fs = require('fs');
const path = require('path');

// 1. Create the *base* directory path
// This goes up two levels (out of 'src', out of 'bot'), then into 'filters'
const dbDirectory = path.join(__dirname, '..', '..', 'filters');

/**
 * Gets the specific JSON file path for a group
 * @param {string} groupId 
 * @returns {string}
 */
function getDBPath(groupId) {
  // Sanitize groupId to be a safe filename (e.g., replace @ and . with _)
  const safeFileName = groupId.replace(/[@.]/g, '_') + '.filters.json';
  return path.join(dbDirectory, safeFileName);
}

/**
 * Ensures the database *directory* exists
 */
function initializeDBDirectory() {
  try {
    // Create the base directory if it doesn't exist
    if (!fs.existsSync(dbDirectory)) {
      // recursive: true ensures all parent dirs are created
      fs.mkdirSync(dbDirectory, { recursive: true });
      console.log('Created base filters directory.');
    }
  } catch (err) {
    console.error('Error initializing database directory:', err);
  }
}

/**
 * Loads the filters for a specific group from its file
 * @param {string} groupId
 * @returns {Array} Array of filter objects
 */
function loadGroupFilters(groupId) {
  initializeDBDirectory(); // Ensure base dir exists
  const dbPath = getDBPath(groupId);
  
  try {
    // If the file doesn't exist, return an empty array
    if (!fs.existsSync(dbPath)) {
      return [];
    }
    const data = fs.readFileSync(dbPath, 'utf8');
    return JSON.parse(data); // The file contains an array of filters
  } catch (err) {
    console.error(`Error reading ${dbPath}:`, err);
    return []; // Return empty array on error
  }
}

/**
 * Saves the filters for a specific group to its file
 * @param {string} groupId
 * @param {Array} filters Array of filter objects
 */
function saveGroupFilters(groupId, filters) {
  initializeDBDirectory(); // Ensure base dir exists
  const dbPath = getDBPath(groupId);
  
  try {
    const data = JSON.stringify(filters, null, 2); // Pretty-print JSON
    fs.writeFileSync(dbPath, data, 'utf8');
  } catch (err) {
    console.error(`Error writing to ${dbPath}:`, err);
  }
}

/**
 * Adds a new filter for a specific group
 * @param {string} groupId The JID of the group
 * @param {object} filter The filter object to add (e.g., {triggers: ['hi', 'hello'], type, reply})
 */
function addFilter(groupId, filter) {
  let groupFilters = loadGroupFilters(groupId); // Loads the array for this group
  
  // Get new triggers, lowercased
  const newTriggers = filter.triggers.map(t => t.toLowerCase());

  // Remove any *old* filter that uses *any* of the new triggers
  // This ensures the new triggers are "claimed" by the new filter
  groupFilters = groupFilters.filter(oldFilter => {
    const oldTriggers = oldFilter.triggers.map(t => t.toLowerCase());
    // Check for any overlap
    const hasOverlap = oldTriggers.some(t => newTriggers.includes(t));
    return !hasOverlap; // Keep only if there is NO overlap
  });
  
  // Add the new filter
  groupFilters.push(filter);
  saveGroupFilters(groupId, groupFilters); // Saves the array for this group
  
  console.log(`[Filter] Added filter for ${groupId}: ${filter.triggers.join(', ')}`);
}

/**
 * Removes a filter for a specific group based on a single trigger
 * @param {string} groupId The JID of the group
 * @param {string} trigger The trigger keyword to remove
 * @returns {boolean} True if a filter was removed, false otherwise
 */
function removeFilter(groupId, trigger) {
  let groupFilters = loadGroupFilters(groupId);
  if (groupFilters.length === 0) {
    return false;
  }
  
  const initialLength = groupFilters.length;
  const triggerLower = trigger.toLowerCase();

  // Keep filters that *do not* contain the trigger
  groupFilters = groupFilters.filter(f => {
    // Get all triggers for this filter, lowercased
    const triggers = f.triggers.map(t => t.toLowerCase());
    // Keep the filter if its triggers array does NOT include the one we want to remove
    return !triggers.includes(triggerLower);
  });

  if (groupFilters.length < initialLength) {
    saveGroupFilters(groupId, groupFilters); // Save the modified array
    console.log(`[Filter] Removed filter associated with trigger for ${groupId}: ${trigger}`);
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
  // This function now just loads the specific group file
  return loadGroupFilters(groupId);
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

  // Find the first filter that has a matching trigger
  const matchedFilter = groupFilters.find(f => {
    // Check *every* trigger in this filter's 'triggers' array
    return f.triggers.some(trigger => {
      // 1. Escape any special regex characters in the trigger
      const escapedTrigger = trigger.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      
      // 2. Create a regular expression to find the trigger as a whole word
      const regex = new RegExp(`\\b${escapedTrigger}\\b`, 'i'); // 'i' = case-insensitive
      
      // 3. Test the regex against the message text
      return regex.test(text);
    });
  });
  
  return matchedFilter || null;
}

// Export the functions
module.exports = {
  addFilter,
  removeFilter,
  getFilters,
  checkFilters,
};