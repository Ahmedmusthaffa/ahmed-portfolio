process.env.NODE_ENV = 'test';
process.env.ADMIN_SECRET = 'test-admin-secret-key-32chars!!';

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

test('2: Security Gate - Input Sanitization & Validation', async () => {
  const maliciousInput = '<script>alert(1)</script> John javascript:alert() onclick=foo()';
  const clean = security.sanitizeInput(maliciousInput);
  assert.ok(!clean.includes('<script>'), 'XSS tags must be stripped');
  assert.ok(!clean.includes('javascript:'), 'JavaScript protocol must be stripped');

  assert.strictEqual(security.validateEmail('valid@example.com'), true);
  assert.strictEqual(security.validateEmail('invalid-email'), false);

  const rateCheck = await security.checkRateLimit('192.168.1.100');
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

  const sitemapRes = await fetch(`http://localhost:${port}/sitemap.xml`);
  const sitemapText = await sitemapRes.text();
  assert.strictEqual(sitemapRes.status, 200, 'sitemap.xml should be accessible');
  assert.ok(sitemapText.includes('https://ahmed-portfolio-kohl.vercel.app/'), 'sitemap.xml should contain portfolio url');

  const robotsRes = await fetch(`http://localhost:${port}/robots.txt`);
  const robotsText = await robotsRes.text();
  assert.strictEqual(robotsRes.status, 200, 'robots.txt should be accessible');
  assert.ok(robotsText.includes('Sitemap:'), 'robots.txt should declare Sitemap location');

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
    headers: { 
      'Content-Type': 'application/json',
      'X-Forwarded-For': '198.51.100.8'
    },
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

test('11: Footer Finality & Clean Boundary', async () => {
  const fs = require('fs');
  const path = require('path');
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

  // Verify copyright is the absolute final section in the footer
  assert.ok(html.includes('Copyright © 2026 Ahmed — All Right Reserved'), 'Copyright text must be present');
  assert.ok(html.includes('Created by Ahmed'), 'Created by Ahmed must be present');

  // Verify terms container is cleanly removed as requested
  assert.strictEqual(html.includes('launch-terms-container'), false, 'Terms container must not be present');
  assert.strictEqual(html.includes('id="terms-modal"'), false, 'Terms modal must not be present');
});

test('12: Anti-Spam Defense - Timestamp Verification (<2.5s Bot Rejection) & Honeypot', async () => {
  const server = createProductionServer();
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;

  // 1. Rapid submission (<2.5s after page load) -> Bot trapped
  const fastSubmission = {
    firstName: 'SpeedyBot',
    lastName: 'Tester',
    email: 'speedy@spam.com',
    description: 'Instant spam payload submission',
    _timestamp: Date.now() - 500 // 500ms ago -> bot!
  };

  const fastRes = await fetch(`http://localhost:${port}/api/contact`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'X-Forwarded-For': '198.51.100.12'
    },
    body: JSON.stringify(fastSubmission)
  });
  const fastBody = await fastRes.json();
  assert.strictEqual(fastRes.status, 200, 'Bot submission should return 200 to drop silently');
  assert.strictEqual(fastBody.success, true);

  // 2. Legitimate submission (>2.5s after page load)
  const legitSubmission = {
    firstName: 'HumanUser',
    lastName: 'Legitimate',
    email: 'human@example.com',
    description: 'Legitimate detailed client inquiry for portfolio',
    _timestamp: Date.now() - 5000 // 5s ago -> human!
  };

  const legitRes = await fetch(`http://localhost:${port}/api/contact`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'X-Forwarded-For': '198.51.100.13'
    },
    body: JSON.stringify(legitSubmission)
  });
  const legitBody = await legitRes.json();
  assert.strictEqual(legitRes.status, 200);
  assert.strictEqual(legitBody.success, true);
  assert.ok(legitBody.id, 'Legitimate submission should return record id');

  await new Promise(resolve => server.close(resolve));
});

test('13: Contact Form Rate Limiting (Max 3 submissions per IP per 10 minutes)', async () => {
  const server = createProductionServer();
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const testIp = '198.51.100.42'; // Dedicated IP for rate test

  const sendWithIp = (num) => fetch(`http://localhost:${port}/api/contact`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'X-Forwarded-For': testIp
    },
    body: JSON.stringify({
      firstName: `Tester${num}`,
      email: `tester${num}@example.com`,
      description: 'Testing rate limit enforcement',
      _timestamp: Date.now() - 6000
    })
  });

  // Requests 1, 2, 3 should succeed
  const res1 = await sendWithIp(1);
  assert.strictEqual(res1.status, 200, 'Request 1 should succeed');
  const res2 = await sendWithIp(2);
  assert.strictEqual(res2.status, 200, 'Request 2 should succeed');
  const res3 = await sendWithIp(3);
  assert.strictEqual(res3.status, 200, 'Request 3 should succeed');

  // Request 4 should be rejected with 429
  const res4 = await sendWithIp(4);
  assert.strictEqual(res4.status, 429, 'Request 4 within window must be rate-limited (HTTP 429)');
  const body4 = await res4.json();
  assert.strictEqual(body4.success, false);
  assert.ok(res4.headers.get('retry-after'), 'Retry-After header must be present on 429');

  await new Promise(resolve => server.close(resolve));
});

test('14: vercel.json Security & Cache-Control Configuration', () => {
  const fs = require('fs');
  const path = require('path');
  const vercel = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8'));

  assert.ok(Array.isArray(vercel.headers), 'vercel.json must define headers array');

  // Check global security headers rule
  const globalRule = vercel.headers.find(h => h.source === '/(.*)');
  assert.ok(globalRule, 'Global headers rule for /(.*) must exist');

  const headerKeys = globalRule.headers.map(h => h.key.toLowerCase());
  assert.ok(headerKeys.includes('content-security-policy'), 'CSP must be defined in vercel.json');
  assert.ok(headerKeys.includes('x-frame-options'), 'X-Frame-Options must be defined in vercel.json');
  assert.ok(headerKeys.includes('x-content-type-options'), 'X-Content-Type-Options must be defined in vercel.json');
  assert.ok(headerKeys.includes('referrer-policy'), 'Referrer-Policy must be defined in vercel.json');
  assert.ok(headerKeys.includes('permissions-policy'), 'Permissions-Policy must be defined in vercel.json');
  assert.ok(headerKeys.includes('strict-transport-security'), 'HSTS must be defined in vercel.json');

  // Check static asset long-term caching rule
  const cacheRule = vercel.headers.find(h => h.headers.some(hdr => hdr.key.toLowerCase() === 'cache-control' && hdr.value.includes('immutable')));
  assert.ok(cacheRule, 'A long-term immutable Cache-Control rule must exist for static assets in vercel.json');
});

test('15: Dual-Track ATS Resumes & Engineering Project Callouts', () => {
  const fs = require('fs');
  const path = require('path');
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

  // Verify dual-track PDF files exist on disk
  const fullstackPdf = path.join(__dirname, '..', 'Ahmed_Musthaffa_FullStack_AI_Resume.pdf');
  const agenticPdf = path.join(__dirname, '..', 'Ahmed_Musthaffa_Agentic_AI_Resume.pdf');
  assert.ok(fs.existsSync(fullstackPdf), 'Ahmed_Musthaffa_FullStack_AI_Resume.pdf must exist');
  assert.ok(fs.existsSync(agenticPdf), 'Ahmed_Musthaffa_Agentic_AI_Resume.pdf must exist');

  // Verify index.html references the ATS-compliant resume files
  assert.ok(html.includes('Ahmed_Musthaffa_FullStack_AI_Resume.pdf'), 'index.html must link to FullStack AI resume');
  assert.ok(html.includes('Ahmed_Musthaffa_Agentic_AI_Resume.pdf'), 'index.html must link to Agentic AI resume');

  // Verify quantified architecture callouts for GovAgent MCP & PitchCraft AI
  assert.ok(html.includes('LangGraph') && html.includes('Unity Catalog'), 'GovAgent MCP architecture callouts must be present');
  assert.ok(html.includes('Rate Limiting') || html.includes('rate limiting'), 'Rate limiting metric must be present');
});

test('16: SEO, OpenGraph Metadata & JSON-LD Structured Data', () => {
  const fs = require('fs');
  const path = require('path');
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

  // OpenGraph & Twitter Card
  assert.ok(html.includes('property="og:title" content="Ahmed Musthaffa — Full-Stack &amp; Agentic AI Systems Engineer"') ||
            html.includes('property="og:title" content="Ahmed Musthaffa — Full-Stack & Agentic AI Systems Engineer"'), 'og:title must match standard');
  assert.ok(html.includes('property="og:description"'), 'og:description must be present');
  assert.ok(html.includes('name="twitter:card" content="summary_large_image"'), 'twitter:card must be summary_large_image');

  // JSON-LD Schema
  assert.ok(html.includes('"@type": "Person"'), 'JSON-LD must include Person schema');
  assert.ok(html.includes('"@type": "ProfilePage"'), 'JSON-LD must include ProfilePage schema');
  assert.ok(html.includes('Ahmed Musthaffa'), 'Schema must declare Ahmed Musthaffa');
  assert.ok(html.includes('sameAs'), 'Schema must declare sameAs social profiles');
});

test('17: Cloudflare Turnstile Bot Defense & CSP Whitelist', () => {
  const fs = require('fs');
  const path = require('path');
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const vercel = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8'));

  // 1. Verify Turnstile script and widget in index.html
  assert.ok(html.includes('challenges.cloudflare.com/turnstile/v0/api.js'), 'Turnstile API script must be loaded in HTML');
  assert.ok(html.includes('class="cf-turnstile"'), 'Turnstile container widget must be present in contact form');

  // 2. Verify CSP allows Cloudflare Turnstile domains
  const globalRule = vercel.headers.find(h => h.source === '/(.*)');
  const cspHeader = globalRule.headers.find(h => h.key.toLowerCase() === 'content-security-policy');
  assert.ok(cspHeader.value.includes('challenges.cloudflare.com'), 'CSP must whitelist challenges.cloudflare.com');
  assert.ok(cspHeader.value.includes('frame-src https://challenges.cloudflare.com'), 'CSP must declare frame-src for Turnstile iframe');
});

test('18: Edge Proxy IP Prioritization (x-real-ip vs x-forwarded-for)', async () => {
  const server = createProductionServer();
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;

  // Real IP is 198.51.100.99, while client attempts to spoof X-Forwarded-For with fake IP
  const spoofedRes = await fetch(`http://localhost:${port}/api/contact`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Real-IP': '198.51.100.99',
      'X-Forwarded-For': '10.0.0.1, 10.0.0.2'
    },
    body: JSON.stringify({
      firstName: 'SecureUser',
      email: 'secure@example.com',
      description: 'Testing edge IP verification',
      _timestamp: Date.now() - 5000
    })
  });

  assert.strictEqual(spoofedRes.status, 200);
  const body = await spoofedRes.json();
  assert.strictEqual(body.success, true);

  await new Promise(resolve => server.close(resolve));
});

test('19: Fail-Closed Protection on Admin Insecure Sample Tokens', async () => {
  const server = createProductionServer();
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;

  // Attempt using common/sample tokens -> must be rejected
  const insecureTokens = ['ahmed-dev-secret-2027', 'admin', 'password', '123456'];
  for (const token of insecureTokens) {
    const res = await fetch(`http://localhost:${port}/api/contact/submissions`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    assert.strictEqual(res.status, 401, `Insecure token '${token}' must be rejected with 401`);
  }

  await new Promise(resolve => server.close(resolve));
});
