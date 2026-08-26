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
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
}

function checkRateLimit(ip) {
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
    .replace(/<[^>]*>?/gm, '')
    .replace(/[<>]/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+=/gi, '')
    .trim();
}

function validateEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const trimmed = email.trim();
  const atIndex = trimmed.indexOf('@');
  const dotIndex = trimmed.lastIndexOf('.');
  return atIndex > 0 && dotIndex > atIndex + 1 && dotIndex < trimmed.length - 1 && !trimmed.includes(' ');
}

module.exports = {
  applySecurityHeaders,
  checkRateLimit,
  sanitizeInput,
  validateEmail
};
