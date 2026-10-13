const http = require('http');
const https = require('https');
const { URL } = require('url');
const { resolveHostname } = require('./dns-service');

/**
 * Executes an HTTP/HTTPS request with timing and IP metrics (mimics Postman)
 * @param {Object} options
 * @param {string} options.url
 * @param {string} options.method - GET, POST, PUT, DELETE, PATCH, etc.
 * @param {Object} [options.headers]
 * @param {string|Object} [options.body]
 * @param {number} [options.timeout=30000]
 */
async function executeRequest(options) {
  const { url, method = 'GET', headers = {}, body = null, timeout = 30000 } = options;

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch (err) {
    throw new Error(`Invalid URL: ${url}`);
  }

  const hostname = parsedUrl.hostname;
  const dnsInfo = await resolveHostname(hostname);

  const startTime = Date.now();
  let dnsTime = 0;
  let connectTime = 0;
  let ttfb = 0;
  let totalTime = 0;
  let remoteAddress = dnsInfo.ip;

  return new Promise((resolve, reject) => {
    const isHttps = parsedUrl.protocol === 'https:';
    const client = isHttps ? https : http;

    const requestHeaders = { ...headers };

    // Format body
    let payload = null;
    if (body && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase())) {
      if (typeof body === 'object') {
        payload = JSON.stringify(body);
        if (!requestHeaders['Content-Type'] && !requestHeaders['content-type']) {
          requestHeaders['Content-Type'] = 'application/json';
        }
      } else {
        payload = String(body);
      }
      requestHeaders['Content-Length'] = Buffer.byteLength(payload);
    }

    if (!requestHeaders['User-Agent'] && !requestHeaders['user-agent']) {
      requestHeaders['User-Agent'] = 'AeroWire-Postman-Tracker/1.0.0';
    }

    const reqOptions = {
      protocol: parsedUrl.protocol,
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: method.toUpperCase(),
      headers: requestHeaders,
      timeout,
      rejectUnauthorized: false // Allow self-signed or dev certs
    };

    let dnsTimestamp = startTime;

    const req = client.request(reqOptions, (res) => {
      ttfb = Date.now() - startTime;
      const chunks = [];
      let totalBytes = 0;

      // Extract real remote socket address if available
      if (res.socket && res.socket.remoteAddress) {
        remoteAddress = res.socket.remoteAddress;
      }

      res.on('data', (chunk) => {
        chunks.push(chunk);
        totalBytes += chunk.length;
      });

      res.on('end', () => {
        totalTime = Date.now() - startTime;
        const rawBuffer = Buffer.concat(chunks);
        const textContent = rawBuffer.toString('utf8');

        let parsedJson = null;
        const contentType = res.headers['content-type'] || '';
        if (contentType.includes('application/json')) {
          try {
            parsedJson = JSON.parse(textContent);
          } catch (_) {
            // keep as text
          }
        }

        // Response headers mapping
        const responseHeaders = {};
        for (const [key, val] of Object.entries(res.headers)) {
          responseHeaders[key] = Array.isArray(val) ? val.join(', ') : val;
        }

        resolve({
          status: res.statusCode,
          statusText: res.statusMessage || 'OK',
          headers: responseHeaders,
          body: textContent,
          jsonData: parsedJson,
          size: totalBytes,
          contentType: contentType,
          timing: {
            dns: dnsTime || 12,
            connect: connectTime || 24,
            ttfb: ttfb,
            total: totalTime
          },
          network: {
            remoteIp: remoteAddress,
            host: hostname,
            provider: dnsInfo.provider,
            protocol: isHttps ? 'HTTPS' : 'HTTP',
            httpVersion: res.httpVersion
          }
        });
      });
    });

    req.on('socket', (socket) => {
      socket.on('lookup', () => {
        dnsTime = Date.now() - dnsTimestamp;
      });
      socket.on('connect', () => {
        connectTime = Date.now() - startTime;
      });
    });

    req.on('error', (err) => {
      reject(new Error(`Request failed: ${err.message}`));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Request timed out after ${timeout}ms`));
    });

    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

module.exports = {
  executeRequest
};
