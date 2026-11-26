const http = require('http');
const fs = require('fs');
const path = require('path');
const config = require('./config/env');
const security = require('./middleware/security');
const { logRequest } = require('./middleware/logger');
const { handleHealthCheck } = require('./routes/health.routes');
const { handleContactRoutes } = require('./routes/contact.routes');
const { handleAnalyticsRoutes } = require('./routes/analytics.routes');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.mp4': 'video/mp4',
  '.json': 'application/json'
};

function createProductionServer() {
  const server = http.createServer((req, res) => {
    const startTime = Date.now();
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';

    // 1. Security Headers
    security.applySecurityHeaders(res);

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }

    res.on('finish', () => {
      logRequest(req, res, Date.now() - startTime);
    });

    // Social Browser-Preserving Redirects
    if (req.url === '/linkedin' || req.url === '/linkedin/') {
      res.writeHead(302, { 'Location': 'https://www.linkedin.com/in/ahmed-musthaffa-58956a371?trk=public_profile_browserview' });
      return res.end();
    }
    if (req.url === '/github' || req.url === '/github/') {
      res.writeHead(302, { 'Location': 'https://github.com/Ahmedmusthaffa' });
      return res.end();
    }

    // 2. Health Endpoint
    if (req.method === 'GET' && req.url === '/api/health') {
      return handleHealthCheck(req, res);
    }

    // 3. Contact Endpoint
    if (req.url.startsWith('/api/contact')) {
      if (handleContactRoutes(req, res, clientIp)) return;
    }

    // 4. Analytics Endpoint
    if (req.url.startsWith('/api/analytics')) {
      if (handleAnalyticsRoutes(req, res)) return;
    }

    // 5. Static File Serving with Enterprise Security Sandbox
    try {
      let rawPath = req.url.split('?')[0];
      let reqUrl = decodeURIComponent(rawPath).replace(/^\/+/, '');
      if (!reqUrl) reqUrl = 'index.html';

      const filePath = path.resolve(config.publicDir, reqUrl);

      // Path traversal security check
      if (!filePath.startsWith(config.publicDir)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        return res.end('403 Forbidden');
      }

      // Security Sandbox: Strictly block internal files, configs, databases, and server scripts
      const lowerUrl = reqUrl.toLowerCase();
      const isSensitiveOrBlocked = 
        lowerUrl.startsWith('.') || 
        /(^|\/)\./.test(lowerUrl) ||
        lowerUrl.endsWith('.json') ||
        lowerUrl.includes('.env') ||
        lowerUrl.endsWith('.py') ||
        lowerUrl.endsWith('.yml') ||
        lowerUrl.endsWith('.yaml') ||
        lowerUrl.endsWith('.md') ||
        lowerUrl === 'dockerfile' ||
        lowerUrl.startsWith('backend/') ||
        lowerUrl.startsWith('api/') ||
        lowerUrl.startsWith('tests/') ||
        lowerUrl === 'server.js';

      if (isSensitiveOrBlocked) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Access Denied: Protected Asset' }));
      }

      if (!fs.existsSync(filePath)) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('404 Not Found');
      }

      const stats = fs.statSync(filePath);
      if (!stats.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('404 Not Found');
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Length': stats.size,
        'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=86400'
      });

      const stream = fs.createReadStream(filePath);
      stream.pipe(res);

    } catch (err) {
      console.error('Server execution error:', err);
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal Server Error');
    }
  });

  return server;
}

module.exports = { createProductionServer };
