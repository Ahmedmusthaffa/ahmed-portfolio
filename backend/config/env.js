const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const envPath = path.resolve(__dirname, '../../.env');
if (fs.existsSync(envPath) && typeof process.loadEnvFile === 'function') {
  try { process.loadEnvFile(envPath); } catch (err) {}
}

const isVercel = !!process.env.VERCEL;
const storageBase = isVercel ? '/tmp' : path.resolve(__dirname, '../../');

const config = {
  port: parseInt(process.env.PORT || '8080', 10),
  host: process.env.HOST || '0.0.0.0',
  nodeEnv: process.env.NODE_ENV || 'production',
  adminSecret: process.env.ADMIN_SECRET || (process.env.NODE_ENV === 'test' ? 'test-admin-secret-key-32chars!!' : crypto.randomBytes(32).toString('hex')),
  ownerEmail: process.env.OWNER_EMAIL || 'ahmedmusthaffa02@gmail.com',
  smtpUser: process.env.SMTP_USER || process.env.GMAIL_USER || 'ahmedmusthaffa02@gmail.com',
  smtpPass: process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD || '',
  smtpHost: process.env.SMTP_HOST || 'smtp.gmail.com',
  smtpPort: parseInt(process.env.SMTP_PORT || '465', 10),
  resendApiKey: process.env.RESEND_API_KEY || '',
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '3', 10),
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '600000', 10),
  maxBodyBytes: 100 * 1024, // 100KB DoS protection limit
  dbPath: path.resolve(storageBase, 'contact_submissions.json'),
  backupDir: path.resolve(storageBase, 'backups'),
  analyticsPath: path.resolve(storageBase, 'analytics_data.json'),
  publicDir: path.resolve(__dirname, '../../')
};

module.exports = config;
