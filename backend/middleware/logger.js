function logRequest(req, res, durationMs) {
  const isApi = req.url.startsWith('/api');
  if (isApi) {
    console.log('[' + new Date().toISOString() + '] ' + req.method + ' ' + req.url + ' -> ' + res.statusCode + ' (' + durationMs + 'ms)');
  }
}

module.exports = { logRequest };
