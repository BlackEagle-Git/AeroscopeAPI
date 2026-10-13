/**
 * Domain Classifier and Wireshark Color Palette Engine
 * Categorizes network traffic according to application origin:
 * - Main Domain -> Dark Blue
 * - Subdomain of same domain -> Sky Blue
 * - API / Microservices -> Emerald Green
 * - CDN / Static Assets -> Purple / Violet
 * - Analytics / Telemetry -> Amber / Gold
 * - 3rd-Party / External -> Rose / Crimson
 */

const WIRESHARK_PALETTE = {
  main: {
    key: 'main',
    name: 'Main Domain',
    color: '#1d4ed8',        // Dark Blue / Royal Navy
    lightColor: '#60a5fa',
    bg: 'rgba(29, 78, 216, 0.15)',
    border: '#2563eb',
    text: '#93c5fd',
    badgeClass: 'badge-main',
    description: 'Root application host serving primary documents'
  },
  subdomain: {
    key: 'subdomain',
    name: 'Subdomain',
    color: '#0284c7',        // Sky Blue
    lightColor: '#38bdf8',
    bg: 'rgba(2, 132, 199, 0.15)',
    border: '#38bdf8',
    text: '#7dd3fc',
    badgeClass: 'badge-subdomain',
    description: 'Associated subdomains within the primary domain boundary'
  },
  api: {
    key: 'api',
    name: 'API Service',
    color: '#059669',        // Emerald Green
    lightColor: '#10b981',
    bg: 'rgba(16, 185, 129, 0.15)',
    border: '#10b981',
    text: '#6ee7b7',
    badgeClass: 'badge-api',
    description: 'REST, GraphQL, RPC and microservice endpoints'
  },
  cdn: {
    key: 'cdn',
    name: 'CDN Assets',
    color: '#7c3aed',        // Violet / Purple
    lightColor: '#a855f7',
    bg: 'rgba(124, 58, 237, 0.15)',
    border: '#a855f7',
    text: '#d8b4fe',
    badgeClass: 'badge-cdn',
    description: 'Content delivery networks, static bundles, fonts, stylesheets'
  },
  analytics: {
    key: 'analytics',
    name: 'Telemetry',
    color: '#d97706',        // Amber / Gold
    lightColor: '#f59e0b',
    bg: 'rgba(245, 158, 11, 0.15)',
    border: '#f59e0b',
    text: '#fcd34d',
    badgeClass: 'badge-analytics',
    description: 'Telemetry, logging, analytics and exception monitors'
  },
  thirdparty: {
    key: 'thirdparty',
    name: '3rd-Party Partner',
    color: '#e11d48',        // Rose / Magenta
    lightColor: '#f43f5e',
    bg: 'rgba(244, 63, 94, 0.15)',
    border: '#f43f5e',
    text: '#fda4af',
    badgeClass: 'badge-thirdparty',
    description: 'Independent external collaborating domain or partner API'
  }
};

/**
 * Known CDN providers patterns
 */
const KNOWN_CDN_PATTERNS = [
  /cdnjs\.cloudflare\.com/i,
  /cdn\.jsdelivr\.net/i,
  /unpkg\.com/i,
  /fonts\.googleapis\.com/i,
  /fonts\.gstatic\.com/i,
  /cloudfront\.net/i,
  /akamaihd\.net/i,
  /fastly\.net/i,
  /azureedge\.net/i,
  /static\./i,
  /assets\./i,
  /cdn\./i,
  /-cdn\./i,
  /-assets\./i
];

/**
 * Known Analytics / Telemetry patterns
 */
const KNOWN_ANALYTICS_PATTERNS = [
  /google-analytics\.com/i,
  /googletagmanager\.com/i,
  /segment\.io/i,
  /mixpanel\.com/i,
  /sentry\.io/i,
  /hotjar\.com/i,
  /datadoghq\.com/i,
  /telemetry\./i,
  /metrics\./i,
  /analytics\./i
];

/**
 * Extracts registered base domain
 */
function extractBaseDomain(host) {
  if (!host) return '';
  const clean = host.toLowerCase().split(':')[0];
  const parts = clean.split('.');
  if (parts.length <= 2) return clean;

  const twoPartTlds = ['co.uk', 'com.au', 'co.jp', 'com.br', 'gov.uk'];
  const lastTwo = parts.slice(-2).join('.');
  if (twoPartTlds.includes(lastTwo) && parts.length > 2) {
    return parts.slice(-3).join('.');
  }
  return parts.slice(-2).join('.');
}

/**
 * Classifies a resource or host given the target application root domain and host
 * @param {string} resourceHost - e.g. api.example.com
 * @param {string} rootHost - e.g. example.com
 * @param {string} rootDomain - e.g. example.com
 * @param {string} [resourceType] - e.g. 'Fetch/XHR', 'Script', etc.
 * @param {string} [url] - full URL
 * @returns {Object} classification object with Wireshark styling
 */
function classifyResource(resourceHost, rootHost, rootDomain, resourceType = '', url = '') {
  const host = (resourceHost || '').toLowerCase().split(':')[0];
  const root = (rootHost || '').toLowerCase().split(':')[0];
  const domain = (rootDomain || extractBaseDomain(root)).toLowerCase();

  // 1. Is it Analytics / Telemetry?
  for (const pat of KNOWN_ANALYTICS_PATTERNS) {
    if (pat.test(host) || pat.test(url)) {
      return { ...WIRESHARK_PALETTE.analytics, category: 'analytics', host };
    }
  }

  // 2. Is it CDN / Static Asset?
  for (const pat of KNOWN_CDN_PATTERNS) {
    if (pat.test(host)) {
      return { ...WIRESHARK_PALETTE.cdn, category: 'cdn', host };
    }
  }

  // 3. Is it API Service?
  const isApiByHost = host.startsWith('api.') || host.startsWith('gateway.') || host.startsWith('backend.') || host.startsWith('service.') || host.startsWith('fraud.');
  const isApiByPath = url && (url.includes('/api/') || url.includes('/v1/') || url.includes('/v2/') || url.includes('/graphql') || url.includes('/rpc'));
  const isApiByType = resourceType === 'Fetch/XHR' || resourceType === 'xhr' || resourceType === 'fetch';

  if (isApiByHost || (isApiByPath && isApiByType)) {
    return { ...WIRESHARK_PALETTE.api, category: 'api', host };
  }

  // 4. Exact Main Domain match
  if (host === root) {
    return { ...WIRESHARK_PALETTE.main, category: 'main', host };
  }

  // 5. Subdomain of same domain (ends with .domain)
  if (host.endsWith('.' + domain)) {
    return { ...WIRESHARK_PALETTE.subdomain, category: 'subdomain', host };
  }

  // 6. External 3rd Party
  return { ...WIRESHARK_PALETTE.thirdparty, category: 'thirdparty', host };
}

// Export for renderer scripts
if (typeof window !== 'undefined') {
  window.DomainClassifier = {
    WIRESHARK_PALETTE,
    classifyResource,
    extractBaseDomain
  };
}
