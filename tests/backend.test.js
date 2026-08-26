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
