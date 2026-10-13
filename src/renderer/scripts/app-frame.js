/**
 * Source Code Origin Traffic Frame Inspector
 * Displays the application's source code page with lines and blocks framed
 * in distinct colors based on the origin network traffic they will generate.
 */

class AppFrameViewer {
  constructor(viewportId, modalId) {
    this.viewport = document.getElementById(viewportId);
    this.modal = document.getElementById(modalId);
    this.rootHost = '';
    this.rootDomain = '';
    this.rawSourceCode = '';
    this.resources = [];
    this.dnsMap = {};
    this.activeFilter = 'all';
    this.searchQuery = '';
    this.parsedBlocks = [];
  }

  loadSourceCode(sourceCode, rootHost, rootDomain, resources = [], dnsMap = {}) {
    this.rawSourceCode = sourceCode || '';
    this.rootHost = rootHost || '';
    this.rootDomain = rootDomain || '';
    this.resources = resources || [];
    this.dnsMap = dnsMap || {};

    if (!this.viewport) return;

    if (!this.rawSourceCode.trim()) {
      this.renderEmptyState();
      return;
    }

    this.parseSourceCodeTraffic();
    this.render();
  }

  renderEmptyState() {
    if (!this.viewport) return;
    this.viewport.innerHTML = `
      <div class="empty-source-state">
        <div class="empty-icon"><i class="fa-solid fa-file-code"></i></div>
        <h3>No Source Code Loaded</h3>
        <p>Send an API request in the Postman tab or enter a URL in the Trace bar to inspect the source code framed by the origin traffic it will generate.</p>
      </div>
    `;
  }

  /**
   * Parses the source code to find elements/lines that generate network traffic
   * and maps them to their respective destination domain, classification, and IP.
   */
  parseSourceCodeTraffic() {
    this.parsedBlocks = [];
    const lines = this.rawSourceCode.split('\n');

    // Patterns that trigger network traffic
    const TRAFFIC_PATTERNS = [
      { regex: /<script\b[^>]*?\bsrc=["']([^"']+)["'][^>]*>/i, type: 'Script' },
      { regex: /<link\b[^>]*?\bhref=["']([^"']+)["'][^>]*>/i, type: 'Stylesheet/Resource' },
      { regex: /<img\b[^>]*?\bsrc=["']([^"']+)["'][^>]*>/i, type: 'Image' },
      { regex: /<iframe\b[^>]*?\bsrc=["']([^"']+)["'][^>]*>/i, type: 'SubFrame' },
      { regex: /<form\b[^>]*?\baction=["']([^"']+)["'][^>]*>/i, type: 'Form POST/GET' },
      { regex: /<video\b[^>]*?\bsrc=["']([^"']+)["'][^>]*>/i, type: 'Media' },
      { regex: /<source\b[^>]*?\bsrc=["']([^"']+)["'][^>]*>/i, type: 'Media Source' },
      { regex: /fetch\(["']([^"']+)["']/i, type: 'Fetch/XHR' },
      { regex: /axios\.[a-z]+\(["']([^"']+)["']/i, type: 'API Call' },
      { regex: /\burl\(["']?([^"')]+)["']?\)/i, type: 'CSS Asset' },
      { regex: /<a\b[^>]*?\bhref=["'](https?:\/\/[^"']+)["'][^>]*>/i, type: 'Outbound Link' }
    ];

    lines.forEach((lineText, index) => {
      const lineNum = index + 1;
      let trafficInfo = null;

      for (const pattern of TRAFFIC_PATTERNS) {
        const match = pattern.regex.exec(lineText);
        if (match && match[1]) {
          const rawTargetUrl = match[1];
          if (!rawTargetUrl.startsWith('data:') && !rawTargetUrl.startsWith('javascript:')) {
            trafficInfo = this.resolveTrafficTarget(rawTargetUrl, pattern.type);
            break;
          }
        }
      }

      // Check for main document root tags if no specific external resource
      if (!trafficInfo) {
        if (/<html\b|<head\b|<body\b|<!DOCTYPE\b/i.test(lineText)) {
          const c = window.DomainClassifier.classifyResource(
            this.rootHost,
            this.rootHost,
            this.rootDomain,
            'Document'
          );
          const ip = this.dnsMap[this.rootHost]?.ip || '127.0.0.1';
          trafficInfo = {
            targetUrl: `https://${this.rootHost}/`,
            targetHost: this.rootHost,
            type: 'Primary Document',
            classification: c,
            ip,
            isRootDoc: true
          };
        }
      }

      this.parsedBlocks.push({
        lineNum,
        rawText: lineText,
        trafficInfo
      });
    });
  }

  /**
   * Resolves a target URL into destination domain host, IP address, and classification
   */
  resolveTrafficTarget(urlStr, resourceType) {
    let targetHost = this.rootHost;
    let fullUrl = urlStr;

    try {
      if (urlStr.startsWith('//')) {
        fullUrl = 'https:' + urlStr;
        targetHost = new URL(fullUrl).hostname;
      } else if (urlStr.startsWith('http://') || urlStr.startsWith('https://')) {
        fullUrl = urlStr;
        targetHost = new URL(fullUrl).hostname;
      } else if (urlStr.startsWith('/')) {
        fullUrl = `https://${this.rootHost}${urlStr}`;
        targetHost = this.rootHost;
      }
    } catch (_) {
      targetHost = this.rootHost;
    }

    const classification = window.DomainClassifier.classifyResource(
      targetHost,
      this.rootHost,
      this.rootDomain,
      resourceType,
      fullUrl
    );

    // Find IP
    const matchingRes = this.resources.find(r => r.host === targetHost);
    const ip = (matchingRes && matchingRes.ip) || this.dnsMap[targetHost]?.ip || 'Resolved via DNS';

    return {
      targetUrl: fullUrl,
      targetHost,
      type: resourceType,
      classification,
      ip
    };
  }

  setFilter(category) {
    this.activeFilter = category;
    this.render();
  }

  setSearch(query) {
    this.searchQuery = (query || '').toLowerCase().trim();
    this.render();
  }

  highlightOrigin(originHost) {
    const rows = this.viewport.querySelectorAll('.source-code-line');
    rows.forEach(row => {
      if (!originHost) {
        row.classList.remove('origin-dimmed', 'origin-focused');
      } else {
        const matches = row.getAttribute('data-origin-host') === originHost;
        row.classList.toggle('origin-focused', matches);
        row.classList.toggle('origin-dimmed', !matches);
      }
    });
  }

  render() {
    if (!this.viewport) return;
    if (!this.parsedBlocks.length) {
      this.renderEmptyState();
      return;
    }

    // Compute traffic stats
    const trafficLines = this.parsedBlocks.filter(b => b.trafficInfo);
    const categoryCounts = {
      main: 0,
      subdomain: 0,
      api: 0,
      cdn: 0,
      analytics: 0,
      thirdparty: 0
    };

    trafficLines.forEach(b => {
      const k = b.trafficInfo.classification.key;
      if (categoryCounts[k] !== undefined) categoryCounts[k]++;
    });

    // Build lines HTML
    let linesHtml = '';
    let visibleCount = 0;

    this.parsedBlocks.forEach(block => {
      const info = block.trafficInfo;

      // Filter by category
      if (this.activeFilter !== 'all') {
        if (!info || info.classification.key !== this.activeFilter) {
          return;
        }
      }

      // Filter by search query
      if (this.searchQuery) {
        const matchCode = block.rawText.toLowerCase().includes(this.searchQuery);
        const matchHost = info ? info.targetHost.toLowerCase().includes(this.searchQuery) : false;
        const matchIp = info ? info.ip.toLowerCase().includes(this.searchQuery) : false;
        if (!matchCode && !matchHost && !matchIp) {
          return;
        }
      }

      visibleCount++;
      const isFramed = !!info;
      const c = isFramed ? info.classification : null;

      const escapedText = block.rawText
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

      let frameStyle = '';
      let badgeHtml = '';

      if (isFramed) {
        frameStyle = `border-left: 4px solid ${c.color}; background: ${c.bg};`;
        badgeHtml = `
          <div class="code-origin-badge" style="background:${c.color}; border: 1px solid ${c.border};" title="Click to inspect endpoint">
            <span class="badge-role">${c.name}</span>
            <span class="badge-host">${info.targetHost}</span>
            <span class="badge-ip">[IP: ${info.ip}]</span>
          </div>
        `;
      }

      linesHtml += `
        <div class="source-code-line ${isFramed ? 'source-traffic-framed' : ''}" 
             data-line="${block.lineNum}" 
             data-origin-host="${info ? info.targetHost : ''}"
             style="${frameStyle}"
             onclick="window.appFrameInstance.handleLineClick(${block.lineNum})">
          <span class="line-number">${String(block.lineNum).padStart(4, '0')}</span>
          <div class="line-content-wrapper">
            <pre class="line-code-text">${escapedText || '&nbsp;'}</pre>
            ${badgeHtml}
          </div>
        </div>
      `;
    });

    this.viewport.innerHTML = `
      <div class="source-inspector-container">
        <!-- Top Controls & Origin Traffic Filter Bar -->
        <div class="source-filter-bar">
          <div class="source-filter-chips">
            <span class="filter-bar-title">Origin Traffic Filter:</span>
            <button class="source-filter-btn ${this.activeFilter === 'all' ? 'active' : ''}" onclick="window.appFrameInstance.setFilter('all')">
              All Lines (${this.parsedBlocks.length})
            </button>
            <button class="source-filter-btn filter-main ${this.activeFilter === 'main' ? 'active' : ''}" onclick="window.appFrameInstance.setFilter('main')">
              <span class="dot-main"></span> Main Domain (${categoryCounts.main})
            </button>
            <button class="source-filter-btn filter-subdomain ${this.activeFilter === 'subdomain' ? 'active' : ''}" onclick="window.appFrameInstance.setFilter('subdomain')">
              <span class="dot-subdomain"></span> Subdomains (${categoryCounts.subdomain})
            </button>
            <button class="source-filter-btn filter-api ${this.activeFilter === 'api' ? 'active' : ''}" onclick="window.appFrameInstance.setFilter('api')">
              <span class="dot-api"></span> API Services (${categoryCounts.api})
            </button>
            <button class="source-filter-btn filter-cdn ${this.activeFilter === 'cdn' ? 'active' : ''}" onclick="window.appFrameInstance.setFilter('cdn')">
              <span class="dot-cdn"></span> CDN Assets (${categoryCounts.cdn})
            </button>
            <button class="source-filter-btn filter-analytics ${this.activeFilter === 'analytics' ? 'active' : ''}" onclick="window.appFrameInstance.setFilter('analytics')">
              <span class="dot-analytics"></span> Telemetry (${categoryCounts.analytics})
            </button>
            <button class="source-filter-btn filter-thirdparty ${this.activeFilter === 'thirdparty' ? 'active' : ''}" onclick="window.appFrameInstance.setFilter('thirdparty')">
              <span class="dot-thirdparty"></span> 3rd-Party (${categoryCounts.thirdparty})
            </button>
          </div>

          <div class="source-search-row">
            <input 
              type="text" 
              class="search-input-box" 
              placeholder="Search in source code, URLs, hosts, or IP addresses..." 
              value="${this.searchQuery}"
              oninput="window.appFrameInstance.setSearch(this.value)"
            />
            <span class="source-lines-count">Showing <strong>${visibleCount}</strong> lines (${trafficLines.length} traffic-generating blocks)</span>
          </div>
        </div>

        <!-- Source Code Lines Canvas -->
        <div class="source-code-editor-viewport">
          ${linesHtml || '<div class="empty-filter-state">No source code lines match the selected origin filter.</div>'}
        </div>
      </div>
    `;
  }

  handleLineClick(lineNum) {
    const block = this.parsedBlocks.find(b => b.lineNum === lineNum);
    if (!block || !block.trafficInfo) return;

    const info = block.trafficInfo;
    const c = info.classification;

    if (!this.modal) return;

    const headerTitle = this.modal.querySelector('#modal-origin-title');
    const headerIp = this.modal.querySelector('#modal-origin-ip');
    const headerRole = this.modal.querySelector('#modal-origin-role');
    const codeContainer = this.modal.querySelector('#modal-origin-code');
    const headersContainer = this.modal.querySelector('#modal-origin-headers');
    const modalBanner = this.modal.querySelector('.origin-modal-header');

    if (modalBanner) {
      modalBanner.style.borderBottom = `3px solid ${c.border}`;
      modalBanner.style.background = `linear-gradient(90deg, ${c.bg} 0%, rgba(15, 23, 42, 0.95) 100%)`;
    }

    if (headerTitle) headerTitle.textContent = info.targetHost;
    if (headerIp) headerIp.innerHTML = `<span class="badge-ip-tag">${info.ip}</span>`;
    if (headerRole) {
      headerRole.innerHTML = `
        <span class="domain-tag" style="background:${c.bg}; border:1px solid ${c.border}; color:${c.text};">
          <span class="tag-indicator" style="background:${c.color}"></span>
          ${c.name}
        </span>
      `;
    }

    if (codeContainer) {
      codeContainer.textContent = block.rawText.trim();
    }

    if (headersContainer) {
      headersContainer.innerHTML = `
        <div class="meta-item"><span>Target URL:</span> <code>${info.targetUrl}</code></div>
        <div class="meta-item"><span>Destination Host:</span> <code>${info.targetHost}</code></div>
        <div class="meta-item"><span>Resolved Server IP:</span> <code>${info.ip}</code></div>
        <div class="meta-item"><span>Generated Traffic Type:</span> <code>${info.type}</code></div>
        <div class="meta-item"><span>Source Line:</span> <code>Line ${block.lineNum}</code></div>
        <div class="meta-item"><span>Wireshark Color Rule:</span> <code>${c.name} (${c.color})</code></div>
      `;
    }

    this.modal.classList.add('modal-visible');
  }

  closeModal() {
    if (this.modal) {
      this.modal.classList.remove('modal-visible');
    }
  }
}

if (typeof window !== 'undefined') {
  window.AppFrameViewer = AppFrameViewer;
}
