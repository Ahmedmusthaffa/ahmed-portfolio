const test = require('node:test');
const assert = require('node:assert');
const db = require('../backend/db/database');
const security = require('../backend/middleware/security');
const analytics = require('../backend/services/analytics');
const { createProductionServer } = require('../backend/server');

test('1: Database Scalability & Atomic Persistence', () => {
  const record = db.saveSubmission({
    firstName: 'Test',
    lastName: 'Developer',
    email: 'test@ahmeddev.com',
    phone: '+11223344',
    description: 'Building app features',
    clientIp: '127.0.0.1'
  });

  assert.ok(record.id, 'Record should have an id');
  assert.strictEqual(record.firstName, 'Test');
  assert.strictEqual(record.status, 'New');

  const all = db.readSubmissions();
  assert.ok(all.some(s => s.id === record.id), 'Database should contain new record');
});

test('2: Security Gate - Input Sanitization & Validation', () => {
  const maliciousInput = '<script>alert(1)</script> John javascript:alert() onclick=foo()';
  const clean = security.sanitizeInput(maliciousInput);
  assert.ok(!clean.includes('<script>'), 'XSS tags must be stripped');
  assert.ok(!clean.includes('javascript:'), 'JavaScript protocol must be stripped');

  assert.strictEqual(security.validateEmail('valid@example.com'), true);
  assert.strictEqual(security.validateEmail('invalid-email'), false);

  const rateCheck = security.checkRateLimit('192.168.1.100');
  assert.strictEqual(rateCheck.allowed, true);
});

test('4: Monitoring & Health Endpoint', async () => {
  const server = createProductionServer();
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;

  const res = await fetch(`http://localhost:${port}/api/health`);
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.status, 'healthy');
  assert.ok(body.system, 'System metrics must be present');

  await new Promise(resolve => server.close(resolve));
});

test('6: Actionable Contact API & Honeypot Bot Trap', async () => {
  const server = createProductionServer();
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;

  // 1. Valid Submission
  const validRes = await fetch(`http://localhost:${port}/api/contact`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      firstName: 'Alice',
      lastName: 'Smith',
      email: 'alice@example.com',
      phone: '+1555000',
      description: 'Need a Full Stack Platform'
    })
  });
  assert.strictEqual(validRes.status, 200);
  const validBody = await validRes.json();
  assert.strictEqual(validBody.success, true);

  // 2. Invalid Email Rejection
  const invalidRes = await fetch(`http://localhost:${port}/api/contact`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      firstName: 'Bad',
      email: 'broken-email',
      description: 'Test'
    })
  });
  assert.strictEqual(invalidRes.status, 400);

  // 3. Honeypot Bot Trap (Decoy Field)
  const botRes = await fetch(`http://localhost:${port}/api/contact`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      firstName: 'SpamBot',
      email: 'bot@spam.com',
      description: 'Spam message',
      _gotcha: 'human'
    })
  });
  assert.strictEqual(botRes.status, 200);

  // 4. Analytics Data Retrieval
  const analyticsRes = await fetch(`http://localhost:${port}/api/analytics`);
  assert.strictEqual(analyticsRes.status, 200);

  await new Promise(resolve => server.close(resolve));
});

test('7: Enterprise Security Gate - Static File Shield & Sensitive Data Exposure Defense', async () => {
  const server = createProductionServer();
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;

  // Blocked sensitive files
  const blockedFiles = [
    'contact_submissions.json',
    'analytics_data.json',
    '.env',
    '.env.example',
    'package.json',
    'package-lock.json',
    'server.js',
    'backend/server.js',
    'backend/config/env.js',
    'Dockerfile',
    '.gitignore'
  ];

  for (const file of blockedFiles) {
    const res = await fetch(`http://localhost:${port}/${file}`);
    await res.text();
    assert.ok(
      res.status === 403 || res.status === 404,
      `Access to sensitive file '${file}' must be blocked (Got HTTP ${res.status})`
    );
  }

  // Allowed public assets
  const allowedRes = await fetch(`http://localhost:${port}/index.html`);
  await allowedRes.text();
  assert.strictEqual(allowedRes.status, 200, 'Public index.html should be accessible');

  await new Promise(resolve => server.close(resolve));
});

test('8: DoS Prevention - Request Body Size Limit (Max 100KB)', async () => {
  const server = createProductionServer();
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;

  // Large 200KB payload
  const oversizedPayload = {
    firstName: 'Attacker',
    email: 'attacker@example.com',
    description: 'A'.repeat(200 * 1024)
  };

  const res = await fetch(`http://localhost:${port}/api/contact`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(oversizedPayload)
  });
  await res.text();

  assert.strictEqual(res.status, 413, 'Oversized payload must be rejected with 413 Payload Too Large');

  await new Promise(resolve => server.close(resolve));
});

test('9: Timing-Safe Admin Authentication & Query Param Secret Rejection', async () => {
  const server = createProductionServer();
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const config = require('../backend/config/env');

  // 1. Unauthenticated request -> 401
  const unauthRes = await fetch(`http://localhost:${port}/api/contact/submissions`);
  await unauthRes.text();
  assert.strictEqual(unauthRes.status, 401, 'Unauthenticated access must be rejected');

  // 2. Query parameter secret attempt (?secret=...) -> MUST BE REJECTED (401)
  const querySecretRes = await fetch(`http://localhost:${port}/api/contact/submissions?secret=${config.adminSecret}`);
  await querySecretRes.text();
  assert.strictEqual(querySecretRes.status, 401, 'Query parameter secrets must be rejected to prevent log leaks');

  // 3. Invalid Bearer Token -> 401
  const invalidTokenRes = await fetch(`http://localhost:${port}/api/contact/submissions`, {
    headers: { 'Authorization': 'Bearer wrong-secret-token' }
  });
  await invalidTokenRes.text();
  assert.strictEqual(invalidTokenRes.status, 401, 'Invalid Bearer token must be rejected');

  // 4. Valid Bearer Token -> 200
  const validTokenRes = await fetch(`http://localhost:${port}/api/contact/submissions`, {
    headers: { 'Authorization': `Bearer ${config.adminSecret}` }
  });
  await validTokenRes.text();
  assert.strictEqual(validTokenRes.status, 200, 'Valid Bearer token must succeed');

  await new Promise(resolve => server.close(resolve));
});

test('10: Security Headers (CSP, HSTS, Permissions-Policy)', async () => {
  const server = createProductionServer();
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;

  const res = await fetch(`http://localhost:${port}/index.html`);
  const csp = res.headers.get('content-security-policy');
  const hsts = res.headers.get('strict-transport-security');
  const xcto = res.headers.get('x-content-type-options');
  const xfo = res.headers.get('x-frame-options');
  const perm = res.headers.get('permissions-policy');
  await res.text();

  assert.ok(csp, 'Content-Security-Policy header must be present');
  assert.strictEqual(xcto, 'nosniff');
  assert.strictEqual(xfo, 'DENY');
  assert.ok(hsts, 'HSTS header must be present');
  assert.ok(perm, 'Permissions-Policy header must be present');

  await new Promise(resolve => server.close(resolve));
});
