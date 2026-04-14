const https = require('https');

const CALENDLY_BASE = 'api.calendly.com';

const apiRequest = (method, path, body) => {
  const token = process.env.CALENDLY_API_TOKEN;
  if (!token) {
    throw new Error(
      'Calendly is not configured. Set CALENDLY_API_TOKEN in .env'
    );
  }

  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: CALENDLY_BASE,
      path,
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    };

    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', (chunk) => (raw += chunk));
      res.on('end', () => {
        try {
          const json = JSON.parse(raw);
          if (res.statusCode >= 400) {
            reject(new Error(json.message || `Calendly API error ${res.statusCode}`));
          } else {
            resolve(json);
          }
        } catch {
          reject(new Error(`Invalid Calendly response: ${raw.slice(0, 200)}`));
        }
      });
    });

    // Abort if Calendly doesn't respond within 10 seconds
    req.setTimeout(10000, () => {
      req.destroy(new Error('Calendly API request timed out after 10s'));
    });

    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
};

/**
 * Create a single-use Calendly scheduling link.
 * The lead receives this link and can book the meeting directly.
 */
exports.createCalendlyLink = async () => {
  const eventTypeUri = process.env.CALENDLY_EVENT_TYPE_URI;
  if (!eventTypeUri) {
    throw new Error(
      'Calendly event type not configured. Set CALENDLY_EVENT_TYPE_URI in .env'
    );
  }

  const result = await apiRequest('POST', '/scheduling_links', {
    max_event_count: 1,
    owner: eventTypeUri,
    owner_type: 'EventType',
  });

  return {
    bookingUrl: result.resource.booking_url,
  };
};
