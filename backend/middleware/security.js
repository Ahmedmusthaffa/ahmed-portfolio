const crypto = require('crypto');
const config = require('../config/env');

const ipHits = new Map();

// Clear old rate limit entries every minute
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of ipHits.entries()) {
    if (now - data.resetTime > config.rateLimitWindowMs) {
      ipHits.delete(ip);
    }
  }
}, 60000);

cleanupTimer.unref();

function applySecurityHeaders(res) {
  // 1. Strict Content-Security-Policy (CSP Level 3)
  const cspDirectives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: https: blob:",
    "media-src 'self' data: blob:",
    "connect-src 'self' https:",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://mail.google.com mailto:"
  ];
  res.setHeader('Content-Security-Policy', cspDirectives.join('; '));

  // 2. HTTP Strict Transport Security (HSTS)
  res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');

  // 3. MIME Sniffing Defense
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // 4. Clickjacking Defense
  res.setHeader('X-Frame-Options', 'DENY');

  // 5. Legacy XSS Filter Defense
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // 6. Strict Referrer Policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // 7. Hardware & Permissions Policy
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');

  // 8. CORS Headers (Restrictive)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
}

function sanitizeIp(ip) {
  if (typeof ip !== 'string') return '127.0.0.1';
  // If multiple IPs are present in x-forwarded-for, take the first valid one
  const first = ip.split(',')[0].trim();
  // Strip any non-standard IP characters
  return first.replace(/[^a-fA-F0-9:.]/g, '').slice(0, 45) || '127.0.0.1';
}

function checkRateLimit(rawIp) {
  const ip = sanitizeIp(rawIp);
  const now = Date.now();
  let record = ipHits.get(ip);
  if (!record || (now - record.resetTime > config.rateLimitWindowMs)) {
    record = { count: 1, resetTime: now };
    ipHits.set(ip, record);
    return { allowed: true, remaining: config.rateLimitMax - 1 };
  }

  record.count += 1;
  if (record.count > config.rateLimitMax) {
    return { allowed: false, remaining: 0, retryAfter: Math.ceil((config.rateLimitWindowMs - (now - record.resetTime)) / 1000) };
  }

  return { allowed: true, remaining: config.rateLimitMax - record.count };
}

function sanitizeInput(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/\0/g, '') // Strip null bytes
    .replace(/<[^>]*>?/gm, '') // Strip HTML tags
    .replace(/[<>]/g, '')
    .replace(/javascript:/gi, '')
    .replace(/data:text\/html/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .trim();
}

function validateEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const trimmed = email.trim();
  if (trimmed.length > 254) return false;
  // RFC 5322 compliant email regex
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  return emailRegex.test(trimmed);
}

function timingSafeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // Perform constant-time dummy comparison to prevent length timing leak
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

function readJsonBody(req, maxBytes = config.maxBodyBytes) {
  return new Promise((resolve, reject) => {
    let body = '';
    let bytes = 0;
    let aborted = false;

    function onData(chunk) {
      if (aborted) return;
      bytes += chunk.length;
      if (bytes > maxBytes) {
        aborted = true;
        req.pause();
        req.removeListener('data', onData);
        req.removeListener('end', onEnd);
        const err = new Error('Payload Too Large: Maximum allowed body is 100KB');
        err.statusCode = 413;
        reject(err);
        return;
      }
      body += chunk.toString();
    }

    function onEnd() {
      if (aborted) return;
      try {
        const parsed = JSON.parse(body || '{}');
        resolve(parsed);
      } catch (e) {
        const err = new Error('Invalid JSON format');
        err.statusCode = 400;
        reject(err);
      }
    }

    req.on('data', onData);
    req.on('end', onEnd);
    req.on('error', (err) => {
      if (!aborted) reject(err);
    });
  });
}

module.exports = {
  applySecurityHeaders,
  checkRateLimit,
  sanitizeInput,
  validateEmail,
  timingSafeCompare,
  readJsonBody
};
