const path = require('path');
const fs = require('fs');

const envPath = path.resolve(__dirname, '../../.env');
if (fs.existsSync(envPath) && typeof process.loadEnvFile === 'function') {
  try { process.loadEnvFile(envPath); } catch (err) {}
}

const config = {
  port: parseInt(process.env.PORT || '8080', 10),
  host: process.env.HOST || '0.0.0.0',
  nodeEnv: process.env.NODE_ENV || 'production',
  adminSecret: process.env.ADMIN_SECRET || 'ahmed-dev-secret-2026',
  ownerEmail: process.env.OWNER_EMAIL || 'ahmedmusthaffa02@gmail.com',
  smtpUser: process.env.SMTP_USER || process.env.GMAIL_USER || '',
  smtpPass: process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD || '',
  smtpHost: process.env.SMTP_HOST || 'smtp.gmail.com',
  smtpPort: parseInt(process.env.SMTP_PORT || '465', 10),
  resendApiKey: process.env.RESEND_API_KEY || '',
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '10', 10),
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
  dbPath: path.resolve(__dirname, '../../contact_submissions.json'),
  backupDir: path.resolve(__dirname, '../../backups'),
  analyticsPath: path.resolve(__dirname, '../../analytics_data.json'),
  publicDir: path.resolve(__dirname, '../../')
};

module.exports = config;
