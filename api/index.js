const { handleHealthCheck } = require('../backend/routes/health.routes');
const { handleContactRoutes } = require('../backend/routes/contact.routes');
const { handleAnalyticsRoutes } = require('../backend/routes/analytics.routes');
const { applySecurityHeaders } = require('../backend/middleware/security');

module.exports = async (req, res) => {
  applySecurityHeaders(res);

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  const clientIp = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.socket.remoteAddress || '127.0.0.1';

  if (req.url.includes('/api/health')) {
    return handleHealthCheck(req, res);
  }

  if (req.url.includes('/api/contact')) {
    return handleContactRoutes(req, res, clientIp);
  }

  if (req.url.includes('/api/analytics')) {
    return handleAnalyticsRoutes(req, res);
  }

  res.statusCode = 404;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ error: 'Endpoint Not Found' }));
};
