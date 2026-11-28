const db = require('../db/database');
const mailer = require('../services/mailer');
const analytics = require('../services/analytics');
const security = require('../middleware/security');
const config = require('../config/env');

function handleContactRoutes(req, res, clientIp) {
  if (req.method === 'POST' && req.url === '/api/contact') {
    // 1. DoS Protection: Reject oversized payloads immediately before consuming rate limit
    const contentLength = parseInt(req.headers['content-length'] || '0', 10);
    if (contentLength > config.maxBodyBytes) {
      res.writeHead(413, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ 
        success: false, 
        error: 'Payload Too Large: Maximum allowed size is 100KB' 
      }));
    }

    const rateCheck = security.checkRateLimit(clientIp);
    if (!rateCheck.allowed) {
      res.writeHead(429, { 
        'Content-Type': 'application/json',
        'Retry-After': String(rateCheck.retryAfter || 60)
      });
      return res.end(JSON.stringify({ 
        success: false, 
        error: 'Too many requests. Please try again later.' 
      }));
    }

    security.readJsonBody(req)
      .then(async (payload) => {
        if (payload._gotcha || payload.website) {
          console.warn('💖 [BOT TRAP] Blocked honeypot bot submission');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: true, message: 'Thank you!' }));
        }

        // Anti-Spam: Reject rapid automated submissions occurring < 2.5 seconds after page load
        if (payload._timestamp && typeof payload._timestamp === 'number') {
          const elapsed = Date.now() - payload._timestamp;
          if (elapsed < 2500) {
            console.warn(`💖 [BOT TRAP] Blocked rapid bot submission (${elapsed}ms < 2500ms)`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: true, message: 'Thank you!' }));
          }
        }

        const firstName = security.sanitizeInput(payload.firstName);
        const lastName = security.sanitizeInput(payload.lastName);
        const email = (payload.email || '').trim().toLowerCase();
        const phone = security.sanitizeInput(payload.phone);
        const description = security.sanitizeInput(payload.description);

        if (!firstName || firstName.length < 2 || firstName.length > 60) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: 'Please provide a valid first name (2-60 characters).' }));
        }

        if (!security.validateEmail(email)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: 'Please provide a valid email address.' }));
        }

        if (!description || description.length < 5 || description.length > 5000) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: 'Please provide a project description (5-5000 chars).' }));
        }

        const submission = db.saveSubmission({
          firstName,
          lastName,
          email,
          phone,
          description,
          clientIp
        });

        analytics.track('submission');

        try {
          await mailer.sendContactNotification(submission);
        } catch (mailErr) {
          console.error('[ContactRoutes] Mailer error:', mailErr.message);
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
          success: true,
          message: 'Thank you! Your message has been sent directly to Ahmed.',
          id: submission.id
        }));
      })
      .catch((err) => {
        const status = err.statusCode || 400;
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message || 'Invalid payload' }));
      });

    return true;
  }

  if (req.method === 'GET' && req.url.startsWith('/api/contact/submissions')) {
    // Disallow query parameter authentication (?secret=...) as query strings leak into web server logs & history
    if (req.url.includes('?') && req.url.includes('secret=')) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, error: 'Query parameter authentication forbidden. Use Bearer header.' }));
    }

    const authHeader = req.headers['authorization'] || '';
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    const providedToken = match ? match[1].trim() : '';
    
    // Constant-time timing-safe comparison against configured adminSecret
    if (!providedToken || !config.adminSecret || !security.timingSafeCompare(providedToken, config.adminSecret)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, error: 'Unauthorized access' }));
    }

    const submissions = db.readSubmissions();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, count: submissions.length, data: submissions }));
    return true;
  }

  return false;
}

module.exports = { handleContactRoutes };
