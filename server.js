const { createProductionServer } = require('./backend/server');
const config = require('./backend/config/env');

let PORT = config.port;

function launch(port) {
  const server = createProductionServer();

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSEE') {
      console.log(`Port ${port} in use, trying ${port + 1}...`);
      launch(port + 1);
    } else {
      console.error('Server error:', err);
    }
  });

  server.listen(port, config.host, () => {
    console.log('===================================================');
    console.log('🚀 AHMED PORTFOLIO - PRODUCTION BACKEND ONLINE');
    console.log(`> Local: http://localhost:${port}/`);
    console.log(`> Health: http://localhost:${port}/api/health`);
    console.log(`> Analytics: http://localhost:${port}/api/analytics`);
    console.log('==================================================');
  });

  // Graceful Shutdown
  process.on('SIGINT', () => {
    console.log('\nShutting down gracefully...');
    server.close(() => process.exit(0));
  });
  process.on('SIGTERM', () => {
    server.close(() => process.exit(0));
  });
}

launch(PORT);
