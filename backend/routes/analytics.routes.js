const analytics = require('../services/analytics');

function handleAnalyticsRoutes(req, res) {
  if (req.method === 'GET' && req.url === '/api/analytics') {
    const data = analytics.getData();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, analytics: data }));
    return true;
  }

  if (req.method === 'POST' && req.url === '/api/analytics/track') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const eventType = payload.event || 'pageview';
        const updated = analytics.track(eventType);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, event: eventType, stats: updated }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Invalid payload' }));
      }
    });
    return true;
  }

  return false;
}

module.exports = { handleAnalyticsRoutes };
