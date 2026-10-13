const dns = require('dns').promises;

// Cache to prevent redundant DNS lookups
const dnsCache = new Map();

/**
 * Known CDN and Cloud IP / Domain ranges or identifiers
 */
const CLOUD_PROVIDERS = [
  { match: /cloudflare/i, name: 'Cloudflare Edge' },
  { match: /cloudfront|amazonaws/i, name: 'AWS CloudFront' },
  { match: /fastly/i, name: 'Fastly CDN' },
  { match: /akamai/i, name: 'Akamai Edge' },
  { match: /google|gstatic/i, name: 'Google Cloud Edge' },
  { match: /azure|azureedge/i, name: 'Microsoft Azure CDN' },
  { match: /github/i, name: 'GitHub Infrastructure' }
];

/**
 * Resolves IP addresses and provider info for a given hostname
 * @param {string} hostname
 * @returns {Promise<{ip: string, allIps: string[], provider: string, ttl?: number}>}
 */
async function resolveHostname(hostname) {
  if (!hostname || typeof hostname !== 'string') {
    return { ip: '127.0.0.1', allIps: ['127.0.0.1'], provider: 'Localhost' };
  }

  // Remove port if present
  const cleanHost = hostname.split(':')[0].toLowerCase();

  if (cleanHost === 'localhost' || cleanHost === '127.0.0.1') {
    return { ip: '127.0.0.1', allIps: ['127.0.0.1'], provider: 'Local Loopback' };
  }

  // Check cache
  if (dnsCache.has(cleanHost)) {
    return dnsCache.get(cleanHost);
  }

  // Detect provider from hostname first
  let detectedProvider = 'Autonomous Host';
  for (const prov of CLOUD_PROVIDERS) {
    if (prov.match.test(cleanHost)) {
      detectedProvider = prov.name;
      break;
    }
  }

  try {
    const lookupResult = await dns.lookup(cleanHost, { all: true });
    const allIps = lookupResult.map(entry => entry.address);
    const primaryIp = allIps[0] || 'Unknown IP';

    const result = {
      host: cleanHost,
      ip: primaryIp,
      allIps: allIps.length > 0 ? allIps : [primaryIp],
      provider: detectedProvider,
      family: lookupResult[0]?.family || 4,
      timestamp: Date.now()
    };

    dnsCache.set(cleanHost, result);
    return result;
  } catch (err) {
    // Fallback if DNS query fails (e.g. simulated domain or offline)
    // Generate deterministic pseudo-IP for demonstration if unresolvable
    const hash = cleanHost.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const pseudoIp = `192.168.${(hash % 250) + 1}.${((hash * 7) % 250) + 1}`;

    const fallbackResult = {
      host: cleanHost,
      ip: pseudoIp,
      allIps: [pseudoIp],
      provider: detectedProvider,
      isSynthetic: true,
      error: err.message
    };

    dnsCache.set(cleanHost, fallbackResult);
    return fallbackResult;
  }
}

/**
 * Resolves a batch of hosts simultaneously
 * @param {string[]} hostnames
 */
async function resolveBatch(hostnames) {
  const uniqueHosts = [...new Set(hostnames.filter(Boolean))];
  const results = {};
  await Promise.all(
    uniqueHosts.map(async (host) => {
      results[host] = await resolveHostname(host);
    })
  );
  return results;
}

module.exports = {
  resolveHostname,
  resolveBatch
};
