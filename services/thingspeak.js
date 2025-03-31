const axios = require('axios');

// Gets the latest value from ThingSpeak for a given channel + field
async function fetchLatestAQI(channelId, fieldNum) {
  const url = `https://api.thingspeak.com/channels/${channelId}/fields/${fieldNum}.json?results=1`;

  try {
    const res = await axios.get(url);
    const value = res.data.feeds[0][`field${fieldNum}`];
    return parseFloat(value);
  } catch (error) {
    console.error(`Error fetching data from ThingSpeak:`, error);
    return null;
  }
}

module.exports = { fetchLatestAQI };
