const express = require('express');
const http = require('http');
const https = require('https');

const router = express.Router();

router.all('/', (req, res) => {
  const targetUrl = req.query.url;

  if (!targetUrl) {
    return res.status(400).send('Missing ?url=');
  }

  let parsed;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return res.status(400).send('Invalid target URL');
  }

  const isHttps = parsed.protocol === 'https:';
  const proxy = isHttps ? https : http;

  const headers = { ...req.headers };
  headers.host = parsed.host;
  delete headers['accept-encoding'];

  const options = {
    hostname: parsed.hostname,
    port: parsed.port || (isHttps ? 443 : 80),
    path: parsed.pathname + parsed.search,
    method: req.method,
    headers,
  };

  console.log('Proxy →', parsed.href);

  const proxyReq = proxy.request(options, (proxyRes) => {
    res.status(proxyRes.statusCode);
    Object.entries(proxyRes.headers).forEach(([key, value]) => {
      res.setHeader(key, value);
    });

    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error('Proxy error:', err);
    res.status(502).send('Bad Gateway');
  });

  req.pipe(proxyReq);
});

module.exports = router;
