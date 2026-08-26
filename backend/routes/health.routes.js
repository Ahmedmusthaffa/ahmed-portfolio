const os = require('node:os');

function handleHealthCheck(req, res) {
  const healthData = {
    status: 'healthy',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    system: {
      platform: process.platform,
      nodeVersion: process.version,
      memoryUsageMB: {
        rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
        heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024)
      },
      cpuCount: os.cpus().length,
      freeMemoryMB: Math.round(os.freemem() / 1024 / 1024)
    },
    version: '2.0.0-production'
  };

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(healthData, null, 2));
}

module.exports = { handleHealthCheck };
