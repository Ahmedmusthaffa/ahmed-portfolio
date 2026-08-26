const db = require('../db/database');
const mailer = require('../services/mailer');
const analytics = require('../services/analytics');
const security = require('../middleware/security');
const config = require('../config/env');

function handleContactRoutes(req, res, clientIp) {
  if (req.method === 'POST' && req.url === '/api/contact') {
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

    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');

        if (payload._gotcha || payload.website) {
          console.warn('💖 [BOT TRDEP] Blocked honeypot bot submission');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: true, message: 'Thank you!' }));
        }

        const firstName = security.sanitizeInput(payload.firstName);
        const lastName = security.sanitizeInput(payload.lastName);
        const email = security.sanitizeInput(payload.email);
        const phone = security.sanitizeInput(payload.phone);
        const description = security.sanitizeInput(payload.description);

        if (!firstName || firstName.length < 2) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: 'Please provide a valid first name.' }));
        }

        if (!security.validateEmail(email)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: 'Please provide a valid email address.' }));
        }

        if (!description || description.length < 5) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: 'Please provide a project description (min 5 chars).' }));
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

        mailer.sendContactNotification(submission).catch(err => {
          console.error('Mailer error:', err);
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
          success: true,
          message: 'Thank you! Your request has been received.',
          id: submission.id
        }));

      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'Invalid JSON format' }));
      }
    });
    return true;
  }

  if (req.method === 'GET' && req.url.startsWith('/api/contact/submissions')) {
    const authHeader = req.headers['authorization'] || '';
    const secretKey = req.url.includes('secret=') ? req.url.split('secret=')[1].split('&')[0] : '';
    
    if (authHeader !== 'Bearer ' + config.adminSecret && secretKey !== config.adminSecret) {
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
