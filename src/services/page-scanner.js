const { BrowserWindow, session } = require('electron');
const { resolveBatch, resolveHostname } = require('./dns-service');
const { URL } = require('url');
const http = require('http');
const https = require('https');

/**
 * Extracts domain base from hostname (e.g. app.example.com -> example.com)
 */
function getBaseDomain(hostname) {
  if (!hostname) return '';
  const parts = hostname.toLowerCase().split('.');
  if (parts.length <= 2) return hostname;
  const knownTwoPartTlds = ['co.uk', 'com.au', 'co.jp', 'com.br', 'gov.uk'];
  const lastTwo = parts.slice(-2).join('.');
  if (knownTwoPartTlds.includes(lastTwo) && parts.length > 2) {
    return parts.slice(-3).join('.');
  }
  return parts.slice(-2).join('.');
}

/**
 * Scans a target URL live by loading it in an isolated Chromium session
 * capturing all network requests, DNS IPs, and the exact source code.
 * @param {string} targetUrl
 * @returns {Promise<Object>}
 */
async function scanPageNetwork(targetUrl) {
  let normalizedUrl = (targetUrl || '').trim();
  if (!normalizedUrl) {
    throw new Error('Please provide a valid URL.');
  }

  if (!/^https?:\/\//i.test(normalizedUrl)) {
    normalizedUrl = 'https://' + normalizedUrl;
  }

  let parsedTarget;
  try {
    parsedTarget = new URL(normalizedUrl);
  } catch (err) {
    throw new Error(`Invalid URL: ${normalizedUrl}`);
  }

  const rootHost = parsedTarget.hostname;
  const rootDomain = getBaseDomain(rootHost);

  // Isolated partition to capture real network traffic
  const partitionName = `scan-${Date.now()}`;
  const customSession = session.fromPartition(partitionName, { cache: false });

  const capturedResources = [];
  const requestStartTimes = new Map();

  // Listen to response started to capture real remote server IP from Chromium socket
  customSession.webRequest.onResponseStarted((details) => {
    requestStartTimes.set(details.id, {
      startTime: Date.now(),
      ip: details.ip || null,
      statusCode: details.statusCode,
      responseHeaders: details.responseHeaders,
      resourceType: details.resourceType
    });
  });

  // Listen to completed requests
  customSession.webRequest.onCompleted((details) => {
    const startInfo = requestStartTimes.get(details.id) || {};
    const elapsed = Date.now() - (startInfo.startTime || Date.now());
    let reqHost = '';
    try {
      reqHost = new URL(details.url).hostname;
    } catch (_) {
      reqHost = rootHost;
    }

    let contentLength = 0;
    if (details.responseHeaders) {
      const cl = details.responseHeaders['content-length'] || details.responseHeaders['Content-Length'];
      if (cl && cl[0]) {
        contentLength = parseInt(cl[0], 10) || 0;
      }
    }

    capturedResources.push({
      id: `req_${details.id}`,
      url: details.url,
      method: details.method || 'GET',
      status: details.statusCode,
      type: mapResourceType(details.resourceType),
      host: reqHost,
      ip: details.ip || startInfo.ip || null,
      size: contentLength || 1024,
      time: elapsed || 20,
      protocol: 'HTTP/2',
      fromCache: details.fromCache || false
    });
  });

  // Create offscreen scanner window
  const scannerWindow = new BrowserWindow({
    show: false,
    width: 1280,
    height: 800,
    webPreferences: {
      session: customSession,
      images: true,
      javascript: true,
      webSecurity: false
    }
  });

  try {
    // Navigate to page with timeout
    await new Promise((resolve) => {
      const timeoutTimer = setTimeout(() => {
        resolve();
      }, 10000);

      scannerWindow.loadURL(normalizedUrl).then(() => {
        clearTimeout(timeoutTimer);
        setTimeout(resolve, 2000);
      }).catch(() => {
        clearTimeout(timeoutTimer);
        resolve();
      });
    });

    // Extract exact raw source code page
    let extractedData = { title: '', sourceCode: '' };
    try {
      extractedData = await scannerWindow.webContents.executeJavaScript(`
        (() => {
          return {
            title: document.title || '',
            sourceCode: document.documentElement ? document.documentElement.outerHTML : (document.body ? document.body.innerText : '')
          };
        })()
      `);
    } catch (_) {
      // If JS evaluation failed, fetch raw text
      extractedData.sourceCode = await fetchRawText(normalizedUrl);
    }

    if (!extractedData.sourceCode) {
      extractedData.sourceCode = await fetchRawText(normalizedUrl);
    }

    // Resolve IPs for all captured hosts
    const hostsToResolve = capturedResources.map(r => r.host).filter(Boolean);
    hostsToResolve.push(rootHost);
    const dnsMap = await resolveBatch(hostsToResolve);

    capturedResources.forEach(res => {
      if (!res.ip && dnsMap[res.host]) {
        res.ip = dnsMap[res.host].ip;
      }
    });

    // If 0 sub-resources captured (e.g. pure JSON endpoint), add the root document
    if (capturedResources.length === 0) {
      capturedResources.push({
        id: `req_main`,
        url: normalizedUrl,
        method: 'GET',
        status: 200,
        type: 'Document',
        host: rootHost,
        ip: dnsMap[rootHost]?.ip || '127.0.0.1',
        size: Buffer.byteLength(extractedData.sourceCode || ''),
        time: 35,
        protocol: 'HTTP/2'
      });
    }

    return {
      success: true,
      url: normalizedUrl,
      rootHost,
      rootDomain,
      name: extractedData.title || rootHost,
      sourceCode: extractedData.sourceCode || '',
      resources: capturedResources,
      dnsMap
    };

  } finally {
    try {
      scannerWindow.destroy();
    } catch (_) {}
  }
}

/**
 * Fallback to fetch raw text directly
 */
function fetchRawText(urlStr) {
  return new Promise((resolve) => {
    try {
      const parsed = new URL(urlStr);
      const client = parsed.protocol === 'https:' ? https : http;
      client.get(urlStr, { timeout: 6000, rejectUnauthorized: false }, (res) => {
        let chunks = '';
        res.on('data', chunk => { chunks += chunk; });
        res.on('end', () => resolve(chunks));
      }).on('error', () => resolve(''));
    } catch (_) {
      resolve('');
    }
  });
}

function mapResourceType(type) {
  switch (type) {
    case 'mainFrame': return 'Document';
    case 'subFrame': return 'SubFrame';
    case 'stylesheet': return 'Stylesheet';
    case 'script': return 'Script';
    case 'image': return 'Image';
    case 'font': return 'Font';
    case 'xhr': return 'Fetch/XHR';
    case 'fetch': return 'Fetch/XHR';
    case 'ping': return 'Ping/Beacon';
    default: return type ? type.charAt(0).toUpperCase() + type.slice(1) : 'Resource';
  }
}

module.exports = {
  scanPageNetwork,
  getBaseDomain
};
