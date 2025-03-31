// --- Global variable to track when AQI data was last received ---
let lastAqiTimestamp = null;

// --- Email Validation Helper ---
function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// --- Air Quality & Chart Variables ---
const fieldUnits = {
  '1': '°C',
  '2': '%',
  '3': 'hPa',
  '4': 'Ω',
  '5': 'µg/m³',
  '6': 'µg/m³',
  '7': 'µg/m³',
  '8': 'Particles/L'
};

function ensureDate(val) {
  return (typeof val === 'number') ? new Date(val) : val;
}

const devices = [
  { id: 'device1', name: '245 Beacon St Room 311', channelId: '2873817', readApiKey: 'U0KE7VEERCQLOSE6', lat: 42.334136, lng: -71.168963 },
  { id: 'device2', name: '245 Beacon St Room 302', channelId: '2720604', readApiKey: 'LY5PUX26SYQJGFVE', lat: 42.334129, lng: -71.169167 },
  { id: 'device3', name: '2000 Commonwealth Ave Room 602', channelId: '2881437', readApiKey: 'PHJDULIAK7W03WIU', lat: 42.3396, lng: -71.1586 }
];

const fieldLabels = {
  '1': 'Temperature',
  '2': 'Humidity',
  '3': 'Pressure',
  '4': 'Gas Resistance',
  '5': 'PM 1.0',
  '6': 'PM 2.5',
  '7': 'PM 10.0',
  '8': 'Particle Count'
};

let selectedDevice = devices[0];
let selectedField = document.getElementById('fieldSelect').value;
document.getElementById('deviceSelect').value = selectedDevice.id;

function updateSelectedDeviceDisplay() {
  document.getElementById('selectedDeviceName').innerText = selectedDevice.name;
}

function getCurrentValueUrl() {
  return `https://api.thingspeak.com/channels/${selectedDevice.channelId}/fields/${selectedField}/last.json?api_key=${selectedDevice.readApiKey}`;
}

function getFeedHistoryUrl() {
  let url = `https://api.thingspeak.com/channels/${selectedDevice.channelId}/feeds.json?api_key=${selectedDevice.readApiKey}`;
  const startTime = document.getElementById('startTime').value;
  const endTime = document.getElementById('endTime').value;
  if (!startTime && !endTime) {
    url += '&results=500';
  } else {
    if (startTime) {
      const formattedStart = startTime.replace('T', ' ') + ':00';
      url += `&start=${encodeURIComponent(formattedStart)}`;
    }
    if (endTime) {
      const formattedEnd = endTime.replace('T', ' ') + ':00';
      url += `&end=${encodeURIComponent(formattedEnd)}`;
    }
  }
  return url;
}

function fetchFeedHistory() {
  fetch(getFeedHistoryUrl())
    .then(response => response.json())
    .then(data => {
      let feeds = data.feeds || [];
      const aggInterval = parseInt(document.getElementById('aggregationInterval').value, 10);
      const aggregated = aggregateFeeds(feeds, aggInterval);
      updateChart(aggregated.labels, aggregated.values);
    })
    .catch(error => { console.error('Error fetching feed history:', error); });
}

function aggregateFeeds(feeds, interval) {
  if (!feeds || feeds.length === 0) return { labels: [], values: [] };
  feeds.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const buckets = [];
  let bucketStart = Math.floor(new Date(feeds[0].created_at).getTime() / interval) * interval;
  let bucketEnd = bucketStart + interval;
  let bucketValues = [];
  for (let feed of feeds) {
    let t = new Date(feed.created_at).getTime();
    let value = parseFloat(feed['field' + selectedField]);
    if (isNaN(value)) continue;
    if (t < bucketEnd) {
      bucketValues.push(value);
    } else {
      if (bucketValues.length > 0) {
        buckets.push({ label: new Date(bucketStart).toISOString(), value: bucketValues.reduce((sum, v) => sum + v, 0) / bucketValues.length });
      }
      while (t >= bucketEnd) { 
        bucketStart = bucketEnd; 
        bucketEnd += interval; 
      }
      bucketValues = [value];
    }
  }
  if (bucketValues.length > 0) {
    buckets.push({ label: new Date(bucketStart).toISOString(), value: bucketValues.reduce((sum, v) => sum + v, 0) / bucketValues.length });
  }
  const labels = buckets.map(b => b.label);
  const values = buckets.map(b => b.value);
  return { labels, values };
}

function fetchCurrentValue() {
  fetch(getCurrentValueUrl())
    .then(response => response.json())
    .then(data => {
      const currentReading = data['field' + selectedField];
      let unit = fieldUnits[selectedField] || '';
      if (currentReading) {
        document.getElementById('currentValue').innerText = currentReading + ' ' + unit;
      } else {
        document.getElementById('currentValue').innerText = "No data";
      }
      document.getElementById('currentTitle').innerText = 'Current ' + fieldLabels[selectedField] + (unit ? ' (' + unit + ')' : '');
    })
    .catch(error => {
      console.error('Error fetching current value:', error);
      document.getElementById('currentValue').innerText = "Error fetching data";
    });
}

let chart;
function updateChart(labels, dataValues) {
  if (labels.length === 0) {
    const now = new Date();
    labels = []; 
    dataValues = [];
    for (let i = 10; i >= 0; i--) {
      let dt = new Date(now.getTime() - i * 60000);
      labels.push(dt.toISOString());
      dataValues.push(Math.random() * 100);
    }
  }
  const dateTimes = labels.map(l => new Date(l).getTime());
  const computedMin = new Date(Math.min(...dateTimes));
  const computedMax = new Date(Math.max(...dateTimes));
  const zoomLimits = { x: { min: computedMin, max: computedMax, minRange: 1000 * 60 * 5 } };
  if (chart) {
    chart.data.labels = labels;
    chart.data.datasets[0].data = dataValues;
    chart.data.datasets[0].label = fieldLabels[selectedField] || ('Field ' + selectedField);
    chart.options.scales.x.min = computedMin;
    chart.options.scales.x.max = computedMax;
    chart.options.plugins.zoom.limits = zoomLimits;
    chart.update();
  } else {
    const ctx = document.getElementById('airQualityChart').getContext('2d');
    chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: fieldLabels[selectedField] || ('Field ' + selectedField),
          data: dataValues,
          borderWidth: 2,
          tension: 0.3,
          fill: false,
          borderColor: 'rgba(75, 192, 192, 1)',
          backgroundColor: 'rgba(75, 192, 192, 0.2)'
        }]
      },
      options: {
        responsive: true,
        animation: { duration: 500, easing: 'easeOutQuart' },
        scales: {
          y: { beginAtZero: true, title: { display: true, text: 'Value' } },
          x: {
            type: 'time',
            time: {
              tooltipFormat: 'MMM d, yyyy, h:mm a',
              displayFormats: {
                millisecond: 'MMM d, yyyy, h:mm a',
                second: 'MMM d, yyyy, h:mm a',
                minute: 'MMM d, yyyy, h:mm a',
                hour: 'MMM d, yyyy, h:mm a',
                day: 'MMM d, yyyy, h:mm a',
                week: 'MMM d, yyyy, h:mm a',
                month: 'MMM d, yyyy, h:mm a',
                quarter: 'MMM d, yyyy, h:mm a',
                year: 'MMM d, yyyy, h:mm a'
              }
            },
            title: { display: true, text: 'Date & Time' },
            min: computedMin,
            max: computedMax
          }
        },
        plugins: {
          zoom: {
            pan: { enabled: true, mode: 'x', speed: 5, threshold: 10 },
            zoom: { wheel: { enabled: false }, pinch: { enabled: false }, mode: 'x' },
            limits: zoomLimits
          }
        }
      }
    });
  }
}

function computeAQI(pm25) {
  let aqi, description;
  if (pm25 >= 0 && pm25 <= 12.0) { 
    aqi = (50 / 12.0) * pm25; 
    description = "Good air quality. Minimal impact on health."; 
  }
  else if (pm25 > 12.0 && pm25 <= 35.4) { 
    aqi = ((100 - 51) / (35.4 - 12.1)) * (pm25 - 12.1) + 51; 
    description = "Moderate air quality. Acceptable for most but sensitive individuals may experience minor effects."; 
  }
  else if (pm25 > 35.4 && pm25 <= 55.4) { 
    aqi = ((150 - 101) / (55.4 - 35.5)) * (pm25 - 35.5) + 101; 
    description = "Unhealthy for sensitive groups. Individuals with respiratory issues may be affected."; 
  }
  else if (pm25 > 55.4 && pm25 <= 150.4) { 
    aqi = ((200 - 151) / (150.4 - 55.5)) * (pm25 - 55.5) + 151; 
    description = "Unhealthy. Everyone may begin to experience health effects."; 
  }
  else if (pm25 > 150.4 && pm25 <= 250.4) { 
    aqi = ((300 - 201) / (250.4 - 150.5)) * (pm25 - 150.5) + 201; 
    description = "Very unhealthy. Health warnings of emergency conditions."; 
  }
  else if (pm25 > 250.4 && pm25 <= 500) { 
    aqi = ((500 - 301) / (500 - 250.5)) * (pm25 - 250.5) + 301; 
    description = "Hazardous. Emergency conditions. The entire population is likely to be affected."; 
  }
  else { 
    aqi = null; 
    description = "PM2.5 value out of range."; 
  }
  return { value: aqi, description: description };
}

function fetchPM25ForAQI() {
  const url = `https://api.thingspeak.com/channels/${selectedDevice.channelId}/fields/${selectedField}/last.json?api_key=${selectedDevice.readApiKey}`;
  fetch(url)
    .then(response => response.json())
    .then(data => {
      const pm25Reading = parseFloat(data.field6);
      if (!isNaN(pm25Reading)) {
        // Update the timestamp since we received fresh AQI data.
        lastAqiTimestamp = new Date();
        console.log("Fresh AQI data received at:", lastAqiTimestamp);
        const aqiData = computeAQI(pm25Reading);
        if (aqiData.value !== null) {
          document.getElementById('aqiValue').innerText = aqiData.value.toFixed(0);
          document.getElementById('aqiDescription').innerText = aqiData.description;
          document.getElementById('aqiCard').style.backgroundColor = getAQIColor(aqiData.value);
          const alertThreshold = 100;
          if (aqiData.value > alertThreshold) {
            triggerEmailNotification(
              "user@example.com",
              `Air Quality Alert for ${selectedDevice.name}`,
              `Alert! The current AQI is ${aqiData.value.toFixed(0)}, which exceeds your threshold of ${alertThreshold}.`
            );
          }
        } else {
          document.getElementById('aqiValue').innerText = "No data";
          document.getElementById('aqiDescription').innerText = "";
          document.getElementById('aqiCard').style.backgroundColor = "";
        }
      } else {
        document.getElementById('aqiValue').innerText = "No data";
        document.getElementById('aqiDescription').innerText = "";
        document.getElementById('aqiCard').style.backgroundColor = "";
      }
    })
    .catch(error => {
      console.error('Error fetching PM2.5 for AQI:', error);
      document.getElementById('aqiValue').innerText = "Error fetching data";
      document.getElementById('aqiDescription').innerText = "";
      document.getElementById('aqiCard').style.backgroundColor = "";
    });
}

function getAQIColorByCategory(category) {
  switch(category) {
    case "Good": return "#00e400";
    case "Moderate": return "#ffff00";
    case "Unhealthy for Sensitive Groups": return "#ff7e00";
    case "Unhealthy": return "#ff0000";
    case "Very Unhealthy": return "#8f3f97";
    case "Hazardous": return "#7e0023";
    default: return "#ffffff";
  }
}

// --- Updated: Fetch Outdoor AQI using CSV data from AirNow ---
async function fetchOutdoorAQIAirNow() {
  try {
    const url = "https://www.airnowapi.org/aq/observation/zipCode/current/?format=text/csv&zipCode=02135&distance=25&API_KEY=94ED928A-40D0-4D35-841F-F14F36CCE79D";
    const response = await fetch(url);
    if (!response.ok) { throw new Error(`HTTP error! Status: ${response.status}`); }
    const csvText = await response.text();
    const lines = csvText.trim().split('\n');
    const header = lines[0].split(',').map(s => s.replace(/"/g, ''));
    let pm25Row = null;
    for (let i = 1; i < lines.length; i++) {
      const row = lines[i].split(',').map(s => s.replace(/"/g, ''));
      if (row[header.indexOf('ParameterName')] === 'PM2.5') {
        pm25Row = row;
        break;
      }
    }
    if (pm25Row) {
      const aqi = pm25Row[header.indexOf('AQI')];
      const category = pm25Row[header.indexOf('CategoryName')];
      if (aqi === "-1") {
        document.getElementById("outdoorAqiValue").innerText = "AQI: Exact Level Not Reported";
        document.getElementById("outdoorAqiCard").style.backgroundColor = getAQIColorByCategory(category);
      } else {
        document.getElementById("outdoorAqiValue").innerText = "AQI: " + aqi;
        document.getElementById("outdoorAqiCard").style.backgroundColor = getAQIColor(aqi);
      }
      document.getElementById("outdoorAqiDescription").innerText = "Category: " + category;
    } else {
      document.getElementById("outdoorAqiValue").innerText = "AQI data not found";
    }
  } catch (error) {
    console.error("Error fetching AirNow observations:", error);
    document.getElementById("outdoorAqiValue").innerText = "Error loading data";
  }
}

function getAQIColor(aqi) {
  if (aqi <= 50) return "#00e400";
  else if (aqi <= 100) return "#ffff00";
  else if (aqi <= 150) return "#ff7e00";
  else if (aqi <= 200) return "#ff0000";
  else if (aqi <= 300) return "#8f3f97";
  else return "#7e0023";
}

// --- Initialize Map ---
const map = L.map('map').setView([42.335, -71.168], 16);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
devices.forEach(device => {
  const marker = L.marker([device.lat, device.lng]).addTo(map);
  marker.bindPopup(device.name);
  marker.on('click', function () {
    selectedDevice = device;
    updateSelectedDeviceDisplay();
    document.getElementById('deviceSelect').value = device.id;
    fetchCurrentValue();
    fetchFeedHistory();
    fetchPM25ForAQI();
  });
});

document.getElementById('deviceSelect').addEventListener('change', function () {
  const deviceId = this.value;
  const device = devices.find(d => d.id === deviceId);
  if (device) {
    selectedDevice = device;
    updateSelectedDeviceDisplay();
    fetchCurrentValue();
    fetchFeedHistory();
    fetchPM25ForAQI();
  }
});

document.getElementById('fieldSelect').addEventListener('change', function () {
  selectedField = this.value;
  fetchCurrentValue();
  fetchFeedHistory();
});

document.getElementById('aggregationInterval').addEventListener('change', fetchFeedHistory);
document.getElementById('startTime').addEventListener('change', fetchFeedHistory);
document.getElementById('endTime').addEventListener('change', fetchFeedHistory);
document.getElementById('updateTimeFrame').addEventListener('click', fetchFeedHistory);

// --- Fetch Subscribers from ThingSpeak Channel ---
async function getSubscribers() {
  const channelId = "2890719";
  const readApiKey = "KAD4U0BS2GKBFI";
  const url = `https://api.thingspeak.com/channels/${channelId}/feeds.json?api_key=${readApiKey}&results=10`;
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    if (!data.feeds) return [];
    return data.feeds.map(feed => ({
      email: feed.field1,
      device: feed.field2,
      threshold: parseFloat(feed.field3)
    }));
  } catch (error) {
    console.error("Error fetching subscribers:", error);
    return [];
  }
}

// --- Check AQI Against Subscriber Thresholds and Trigger Alerts ---
async function checkAirQuality() {
  const aqi = await (async function getCurrentAQI() {
    try {
      const response = await fetch(getCurrentValueUrl());
      const data = await response.json();
      const reading = parseFloat(data['field' + selectedField]);
      return isNaN(reading) ? 0 : reading;
    } catch (error) {
      console.error("Error getting current AQI:", error);
      return 0;
    }
  })();
  
  const subscribers = await getSubscribers();
  subscribers.forEach(subscriber => {
    if (aqi > subscriber.threshold) {
      console.log(`Sending alert to ${subscriber.email}`);
      triggerEmailNotification(
        subscriber.email,
        `Air Quality Alert for ${subscriber.device}`,
        `Alert! The current AQI is ${aqi} which exceeds your threshold of ${subscriber.threshold}.`
      );
    }
  });
}

// --- Trigger Email Alert via ThingHTTP (Using JSON Payload) ---
function triggerEmailNotification(recipientEmail, subject, message) {
  if (!validateEmail(recipientEmail)) {
    console.error("Invalid email format:", recipientEmail);
    return;
  }
  
  const thingHTTPApiKey = 'KJY2FL9I0RR22LNO';
  const url = `https://api.thingspeak.com/apps/thinghttp/send_request?api_key=${thingHTTPApiKey}`;
  
  const payload = {
    api_key: thingHTTPApiKey,
    personalizations: [{
      to: [{ email: recipientEmail }],
      subject: subject
    }],
    from: { email: "bcaqiq@gmail.com" },
    content: [{
      type: "text/plain",
      value: message
    }]
  };

  console.log("Triggering email with JSON payload:", JSON.stringify(payload));

  fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  })
  .then(response => response.json())
  .then(data => {
    if (data.errors) {
      console.error("Failed to trigger email alert via ThingHTTP. Response:", data);
    } else {
      console.log("Email alert triggered successfully via ThingHTTP.");
    }
  })
  .catch(error => {
    console.error("Error triggering email alert via ThingHTTP:", error);
  });
}

// --- Subscription Management (Commented Out) ---
/*
document.getElementById('subscriptionForm').addEventListener('submit', function(e) {
  e.preventDefault();
  let email = document.getElementById('subscriberEmail').value;
  let deviceId = document.getElementById('deviceSubscription').value;
  let threshold = document.getElementById('thresholdValue').value;
  let url = `https://api.thingspeak.com/update?api_key=POZVWXEZE9BHUIU4&field1=${encodeURIComponent(email)}&field2=${encodeURIComponent(deviceId)}&field3=${encodeURIComponent(threshold)}&field4=1`;
  fetch(url)
    .then(response => response.text())
    .then(data => {
      if (data > 0) {
        document.getElementById('subscriptionMessage').innerText = 'Subscribed successfully!';
      } else {
        document.getElementById('subscriptionMessage').innerText = 'Subscription failed. Please try again.';
      }
    })
    .catch(error => {
      console.error('Subscription error:', error);
      document.getElementById('subscriptionMessage').innerText = 'Subscription error. Please try again.';
    });
});

document.getElementById('unsubscribeButton').addEventListener('click', function() {
  let email = document.getElementById('subscriberEmail').value;
  let deviceId = document.getElementById('deviceSubscription').value;
  let url = `https://api.thingspeak.com/update?api_key=POZVWXEZE9BHUIU4&field1=${encodeURIComponent(email)}&field2=${encodeURIComponent(deviceId)}&field3=0&field4=0`;
  fetch(url)
    .then(response => response.text())
    .then(data => {
      if (data > 0) {
        document.getElementById('subscriptionMessage').innerText = 'Unsubscribed successfully!';
      } else {
        document.getElementById('subscriptionMessage').innerText = 'Unsubscription failed. Please try again.';
      }
    })
    .catch(error => {
      console.error('Unsubscription error:', error);
      document.getElementById('subscriptionMessage').innerText = 'Unsubscription error. Please try again.';
    });
});
*/

// --- New: Check AQI Data Freshness ---
// This function checks if fresh AQI data has been received within the last 3 minutes.
// If not, it displays "Device Down" in the AQI display area.
function checkAqiFreshness() {
  const now = new Date();
  if (!lastAqiTimestamp) {
    console.log("No AQI timestamp yet; waiting for first data.");
    return;
  }
  const diff = now - lastAqiTimestamp;
  console.log("Time since last AQI update (ms):", diff);
  if (diff > 60000) { // 3 minutes = 180,000 ms
    document.getElementById('aqiValue').innerText = "Device Down";
    document.getElementById('aqiDescription').innerText = "";
    document.getElementById('aqiCard').style.backgroundColor = "#ffcccc"; // Warning color
  }
}
setInterval(checkAqiFreshness, 30000); // check every 30 seconds

// --- Periodic AQI Check ---
setInterval(checkAirQuality, 60000);

// --- Initial Data Fetch & Periodic Refresh ---
updateSelectedDeviceDisplay();
fetchCurrentValue();
fetchFeedHistory();
fetchPM25ForAQI();
fetchOutdoorAQIAirNow();
setInterval(() => { 
  fetchCurrentValue(); 
  fetchFeedHistory(); 
  fetchPM25ForAQI(); 
}, 60000);
setInterval(fetchOutdoorAQIAirNow, 300000);
