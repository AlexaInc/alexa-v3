const axios = require('axios');
const https = require('https');

// Create an agent that forces IPv4
const httpsAgent = new https.Agent({
  family: 4 // 4 = IPv4
});

const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast';

// --- 👇 1. PASTE THE WMO_CODES MAP HERE 👇 ---
const WMO_CODES = {
  // 00-09: No Precipitation, Fog, or Storms
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  4: "Visibility reduced by smoke",
  5: "Haze",
  6: "Widespread dust in suspension",
  7: "Dust or sand raised by wind",
  8: "Well-developed dust devils or sand whirls",
  9: "Duststorm or sandstorm within sight",

  // 10-19: Precipitation/Storms Nearby
  10: "Mist",
  11: "Patches of shallow fog",
  12: "More or less continuous shallow fog",
  13: "Lightning visible, no thunder heard",
  14: "Precipitation within sight, not reaching the ground",
  15: "Precipitation within sight, reaching ground, > 5km away",
  16: "Precipitation within sight, reaching ground, < 5km away",
  17: "Thunderstorm, but no precipitation at the station",
  18: "Squalls within sight",
  19: "Funnel cloud(s) (Tornado or Waterspout)",

  // 20-29: Precipitation/Storms in Past Hour
  20: "Drizzle (not freezing) ended in past hour",
  21: "Rain (not freezing) ended in past hour",
  22: "Snow ended in past hour",
  23: "Rain and snow (mixed) ended in past hour",
  24: "Freezing drizzle or rain ended in past hour",
  25: "Rain shower(s) ended in past hour",
  26: "Snow shower(s) ended in past hour",
  27: "Hail shower(s) ended in past hour",
  28: "Fog or ice fog ended in past hour",
  29: "Thunderstorm ended in past hour",

  // 30-39: Duststorms or Sandstorms
  30: "Slight or moderate duststorm, decreasing",
  31: "Slight or moderate duststorm, no change",
  32: "Slight or moderate duststorm, increasing",
  33: "Severe duststorm, decreasing",
  34: "Severe duststorm, no change",
  35: "Severe duststorm, increasing",
  36: "Slight or moderate drifting snow",
  37: "Heavy drifting snow",
  38: "Slight or moderate blowing snow",
  39: "Heavy blowing snow",

  // 40-49: Fog or Ice Fog
  40: "Fog at a distance",
  41: "Patches of fog",
  42: "Fog, sky visible, thinning",
  43: "Fog, sky obscured, thinning",
  44: "Fog, sky visible, no change",
  45: "Fog, sky obscured, no change",
  46: "Fog, sky visible, thickening",
  47: "Fog, sky obscured, thickening",
  48: "Fog, depositing rime, sky visible",
  49: "Fog, depositing rime, sky obscured",

  // 50-59: Drizzle
  50: "Drizzle, intermittent, slight",
  51: "Drizzle, continuous, slight",
  52: "Drizzle, intermittent, moderate",
  53: "Drizzle, continuous, moderate",
  54: "Drizzle, intermittent, heavy",
  55: "Drizzle, continuous, heavy",
  56: "Freezing drizzle, slight",
  57: "Freezing drizzle, moderate or heavy",
  58: "Drizzle and rain, slight",
  59: "Drizzle and rain, moderate or heavy",

  // 60-69: Rain
  60: "Rain, intermittent, slight",
  61: "Rain, continuous, slight",
  62: "Rain, intermittent, moderate",
  63: "Rain, continuous, moderate",
  64: "Rain, intermittent, heavy",
  65: "Rain, continuous, heavy",
  66: "Freezing rain, slight",
  67: "Freezing rain, moderate or heavy",
  68: "Rain or drizzle and snow, slight",
  69: "Rain or drizzle and snow, moderate or heavy",

  // 70-79: Solid Precipitation (Snow)
  70: "Snow, intermittent, slight",
  71: "Snow, continuous, slight",
  72: "Snow, intermittent, moderate",
  73: "Snow, continuous, moderate",
  74: "Snow, intermittent, heavy",
  75: "Snow, continuous, heavy",
  76: "Diamond dust (ice crystals)",
  77: "Snow grains",
  78: "Isolated star-like snow crystals",
  79: "Ice pellets",

  // 80-89: Showers
  80: "Rain shower(s), slight",
  81: "Rain shower(s), moderate or heavy",
  82: "Rain shower(s), violent",
  83: "Showers of rain and snow mixed, slight",
  84: "Showers of rain and snow mixed, moderate or heavy",
  85: "Snow shower(s), slight",
  86: "Snow shower(s), moderate or heavy",
  87: "Showers of soft or small hail, slight",
  88: "Showers of soft or small hail, moderate or heavy",
  89: "Showers of hail, slight",

  // 90-99: Thunderstorms
  90: "Showers of hail, moderate or heavy",
  91: "Thunderstorm in past hour, now slight rain",
  92: "Thunderstorm in past hour, now moderate or heavy rain",
  93: "Thunderstorm in past hour, now slight snow or rain/snow mix",
  94: "Thunderstorm in past hour, now moderate or heavy snow or rain/snow mix",
  95: "Thunderstorm, slight or moderate, without hail",
  96: "Thunderstorm, slight or moderate, with hail",
  97: "Thunderstorm, heavy, without hail",
  98: "Thunderstorm combined with duststorm or sandstorm",
  99: "Thunderstorm, heavy, with hail"
};
// --- --------------------------------- ---

/**
 * Fetches the current weather for a given city using Open-Meteo.
 */
async function getWeatherByCity(cityName) {
    // --- 👇 THIS IS THE FIX 👇 ---
  // Add validation to the input
  if (!cityName || typeof cityName !== 'string' || cityName.trim().length === 0) {
    // Throw a specific error *before* making an API call
    throw new Error("Invalid city name: Must be a non-empty string.");
  }
  try {
    // --- Step 1: Geocoding ---
    const geoResponse = await axios.get(GEOCODING_URL, {
      params: { name: cityName, count: 1 },
      httpsAgent: httpsAgent
    });

    if (!geoResponse.data.results || geoResponse.data.results.length === 0) {
      throw new Error(`City not found: ${cityName}`);
    }

    const cityData = geoResponse.data.results[0];
    const latitude = cityData.latitude;
    const longitude = cityData.longitude;

    // --- Step 2: Get Weather ---
    const weatherResponse = await axios.get(WEATHER_URL, {
      params: {
        latitude: latitude,
        longitude: longitude,
        current_weather: true,
      },
      httpsAgent: httpsAgent
    });

    // --- 👇 2. USE THE MAP TO GET THE DESCRIPTION 👇 ---
    const weatherData = weatherResponse.data.current_weather;
    
    // Look up the code. If not found, use a default message.
    const weatherCode = weatherData.weathercode;
    const description = WMO_CODES[weatherCode] || `Unknown weather code: ${weatherCode}`;

    const simplifiedWeather = {
      city: cityData.name,
      country: cityData.country_code,
      main: "Weather",
      description: description, // <-- Use the human-readable description
      temperature: weatherData.temperature,
      feels_like: null,
      humidity: null,
      wind_speed: weatherData.windspeed,
    };

    return simplifiedWeather;

  } catch (error) {
    if (error.response) {
      throw new Error(`API error: ${error.message}`);
    }
    throw error;
  }
}


module.exports =  getWeatherByCity ;