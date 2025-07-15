// cloudflare-workers/api-gateway/index.js

// Global variable to store parsed APOD data (in-memory cache for this Worker instance)
let apodDataCache = null;
let apodDataPromise = null; // To prevent multiple concurrent fetches

// Helper function to parse CSV data
async function parseCsv(csvText) {
  const lines = csvText.split('\n');
  if (lines.length === 0) return {};

  const headers = lines[0].split(',').map(h => h.trim());
  const data = {};

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = line.split(',').map(v => v.trim());
    const entry = {};
    headers.forEach((header, index) => {
      entry[header] = values[index] || ''; // Assign value or empty string if missing
    });

    if (entry.date) {
      data[entry.date] = entry; // Store by date for quick lookup
    }
  }
  return data;
}

// Function to load APOD data from R2, with caching
async function loadApodData(env) {
  if (apodDataCache) {
    return apodDataCache; // Return from in-memory cache if available
  }

  // If a fetch is already in progress, wait for it
  if (apodDataPromise) {
    return apodDataPromise;
  }

  apodDataPromise = (async () => {
    const cacheKey = new Request('https://your-worker-domain.com/apod-data-cache-key'); // Unique key for CDN cache
    const cache = caches.default;
    let response = await cache.match(cacheKey);

    if (!response) {
      console.log('Cache miss. Fetching from R2...');
      try {
        const object = await env.APOD_DATA.get('apod_master_data.csv'); // 'APOD_DATA' is the binding from wrangler.toml
        if (!object) {
          console.error('apod_master_data.csv not found in R2 bucket.');
          return null;
        }

        const csvText = await object.text();
        const parsedData = await parseCsv(csvText);

        // Store in in-memory cache
        apodDataCache = parsedData;

        // Cache in CDN for future requests
        response = new Response(JSON.stringify(parsedData), {
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' } // Cache for 1 hour
        });
        await cache.put(cacheKey, response.clone()); // Cache the response
        return parsedData;

      } catch (error) {
        console.error('Error fetching or parsing APOD data from R2:', error);
        return null;
      }
    } else {
      console.log('Cache hit. Using data from CDN cache.');
      // If from CDN cache, parse it back into our in-memory structure
      apodDataCache = await response.json();
      return apodDataCache;
    }
  })();

  return apodDataPromise;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const headers = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers });
    }

    // Ensure data is loaded (and cached)
    const apodData = await loadApodData(env);
    if (!apodData) {
      return new Response(JSON.stringify({ error: 'Failed to load APOD data.' }), { status: 500, headers });
    }

    if (url.pathname === '/api/timeline-years') {
      // Endpoint to get a summary of years for the circular timeline
      const years = {};
      for (const dateStr in apodData) {
        const year = dateStr.substring(0, 4);
        years[year] = (years[year] || 0) + 1;
      }
      const timelineYears = Object.keys(years).sort().map(year => ({
        year: parseInt(year),
        count: years[year],
      }));
      return new Response(JSON.stringify(timelineYears), { headers });

    } else if (url.pathname === '/api/apod-by-date') {
      // Endpoint to get details for a specific date
      const dateParam = url.searchParams.get('date');
      if (!dateParam) {
        return new Response(JSON.stringify({ error: 'Missing date parameter.' }), { status: 400, headers });
      }

      const entry = apodData[dateParam];
      if (entry) {
        return new Response(JSON.stringify(entry), { headers });
      } else {
        return new Response(JSON.stringify({ error: `APOD entry for ${dateParam} not found.` }), { status: 404, headers });
      }

    } else {
      return new Response(JSON.stringify({ error: 'Not Found' }), { status: 404, headers });
    }
  },
};