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

  if (req.url === '/linkedin' || req.url === '/linkedin/') {
    res.statusCode = 302;
    res.setHeader('Location', 'https://www.linkedin.com/in/ahmed-musthaffa-58956a371?trk=public_profile_browserview');
    return res.end();
  }

  if (req.url === '/github' || req.url === '/github/') {
    res.statusCode = 302;
    res.setHeader('Location', 'https://github.com/Ahmedmusthaffa');
    return res.end();
  }

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
