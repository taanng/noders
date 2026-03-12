'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

// ── Config ──────────────────────────────────────────────────────────────────

const configPath = path.resolve(process.env.CONFIG_PATH || process.argv[2] || '');

if (!configPath) {
  console.error('Error: No config file path provided.');
  console.error('Usage: node server.js <config-file-path>');
  console.error('  or set CONFIG_PATH environment variable.');
  process.exit(1);
}

function loadConfig() {
  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    const cfg = JSON.parse(raw);
    if (!cfg.category || typeof cfg.category !== 'string') {
      throw new Error('"category" is required and must be a non-empty string.');
    }
    if (!cfg.targetUrl || typeof cfg.targetUrl !== 'string') {
      throw new Error('"targetUrl" is required and must be a non-empty string.');
    }
    // Validate targetUrl is a valid URL
    new URL(cfg.targetUrl);
    return cfg;
  } catch (err) {
    console.error(`[Config] Failed to load: ${err.message}`);
    return null;
  }
}

let config = loadConfig();
if (!config) process.exit(1);

function printConfig(cfg) {
  console.log('=== URL Proxy Service ===');
  console.log(`Category (auth token): ${cfg.category}`);
  console.log(`Target URL:            ${cfg.targetUrl}`);
  console.log(`Mode:                  reverse-proxy`);
  console.log('=========================');
}

printConfig(config);

// ── Config hot-reload (watch file for changes) ───────────────────────────────

let reloadDebounce = null;
fs.watch(configPath, () => {
  clearTimeout(reloadDebounce);
  reloadDebounce = setTimeout(() => {
    const newCfg = loadConfig();
    if (newCfg) {
      config = newCfg;
      console.log('[Config] Reloaded successfully.');
      printConfig(config);
    }
  }, 300);
});

// ── Proxy helpers ────────────────────────────────────────────────────────────

// Headers to strip from upstream response before forwarding to client
const HOP_BY_HOP = new Set([
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailers', 'transfer-encoding', 'upgrade',
]);

function fetchUpstream(targetUrl, incomingReq) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(targetUrl);
    const isHttps = parsed.protocol === 'https:';
    const transport = isHttps ? https : http;

    // Forward a minimal set of headers; spoof a browser UA so upstream won't block
    const reqHeaders = {
      'user-agent': incomingReq.headers['user-agent'] || 'ClashMetaForAndroid',
      'accept': incomingReq.headers['accept'] || '*/*',
      'accept-encoding': 'identity', // avoid compressed responses we can't easily pipe
    };
    // Forward clash / openclash specific headers if present
    for (const h of ['clash-version', 'clash-meta-version', 'user-info']) {
      if (incomingReq.headers[h]) reqHeaders[h] = incomingReq.headers[h];
    }

    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: reqHeaders,
      timeout: 15000,
    };

    const upstream = transport.request(options, (upRes) => {
      resolve(upRes);
    });

    upstream.on('timeout', () => {
      upstream.destroy();
      reject(new Error('Upstream request timed out'));
    });

    upstream.on('error', reject);
    upstream.end();
  });
}

// ── Server ────────────────────────────────────────────────────────────────────

const listenPort = parseInt(process.env.LISTEN_PORT, 10) || 8080;

const server = http.createServer(async (req, res) => {
  const clientIP = req.socket.remoteAddress;
  const requestUrl = req.url;

  console.log(`[${new Date().toISOString()}] ${req.method} ${req.headers.host || ''}${requestUrl} from ${clientIP}`);

  // ── Health check ────────────────────────────────────────────────────────
  if (requestUrl === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', target: config.targetUrl, timestamp: new Date().toISOString() }));
    return;
  }

  // ── Auth: category token must appear in the URL path ───────────────────
  if (!requestUrl.includes(config.category)) {
    console.log(`[${new Date().toISOString()}] 403 Forbidden - invalid category token`);
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403 Forbidden');
    return;
  }

  // ── Reverse proxy ───────────────────────────────────────────────────────
  const target = config.targetUrl; // read snapshot; hot-reload safe
  console.log(`[${new Date().toISOString()}] PROXY -> ${target}`);

  try {
    const upRes = await fetchUpstream(target, req);

    // Build response headers – strip hop-by-hop, keep everything else
    const outHeaders = {};
    for (const [k, v] of Object.entries(upRes.headers)) {
      if (!HOP_BY_HOP.has(k.toLowerCase())) {
        outHeaders[k] = v;
      }
    }
    // Ensure no redirect leaks through
    delete outHeaders['location'];

    // Add informational header so clients know they're behind a proxy
    outHeaders['x-proxy-target'] = target;

    res.writeHead(upRes.statusCode, outHeaders);
    upRes.pipe(res, { end: true });

    upRes.on('end', () => {
      console.log(`[${new Date().toISOString()}] PROXY complete, upstream status: ${upRes.statusCode}`);
    });

  } catch (err) {
    console.error(`[${new Date().toISOString()}] PROXY error: ${err.message}`);
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(`502 Bad Gateway\n${err.message}`);
    }
  }
});

server.listen(listenPort, '0.0.0.0', () => {
  console.log(`Server listening on 0.0.0.0:${listenPort}`);
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────

function shutdown(sig) {
  console.log(`Received ${sig}, shutting down gracefully...`);
  server.close(() => {
    console.log('Server closed.');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
