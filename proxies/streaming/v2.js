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
  
    // 🔥 リダイレクト検知
    if (
      [301, 302, 303, 307, 308].includes(proxyRes.statusCode) &&
      proxyRes.headers.location
    ) {
      const redirectUrl = proxyRes.headers.location;
  
      const wrapped =
        `?url=${encodeURIComponent(redirectUrl)}`;
  
      console.log('Redirect →', redirectUrl);
  
      res.status(proxyRes.statusCode);
      res.setHeader('Location', wrapped);
      return res.end();
    }
  
    res.status(proxyRes.statusCode);
  
    Object.entries(proxyRes.headers).forEach(([key, value]) => {
      // Locationは通常時は触らない
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
