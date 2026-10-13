/**
 * Wireshark-Style Network Waterfall and Packet Stream Table
 */

class WiresharkTable {
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    this.resources = [];
    this.filteredResources = [];
    this.rootHost = '';
    this.rootDomain = '';
    this.activeFilters = {
      main: true,
      subdomain: true,
      api: true,
      cdn: true,
      analytics: true,
      thirdparty: true
    };
    this.searchQuery = '';
    this.selectedResourceId = null;
    this.onSelectCallback = options.onSelect || null;
    this.onActionCallback = options.onAction || null;
  }

  setData(resources, rootHost, rootDomain) {
    this.rootHost = rootHost;
    this.rootDomain = rootDomain;
    this.resources = resources.map((res, index) => {
      const classification = window.DomainClassifier.classifyResource(
        res.host,
        this.rootHost,
        this.rootDomain,
        res.type,
        res.url
      );
      return {
        ...res,
        index: index + 1,
        classification
      };
    });
    this.applyFilters();
  }

  setFilter(category, isEnabled) {
    this.activeFilters[category] = isEnabled;
    this.applyFilters();
  }

  setSearch(query) {
    this.searchQuery = (query || '').toLowerCase().trim();
    this.applyFilters();
  }

  filterByHost(host) {
    this.searchQuery = host.toLowerCase().trim();
    const searchInput = document.getElementById('wireshark-search-input');
    if (searchInput) searchInput.value = host;
    this.applyFilters();
  }

  applyFilters() {
    this.filteredResources = this.resources.filter(res => {
      // Category filter
      if (!this.activeFilters[res.classification.key]) {
        return false;
      }

      // Search query filter
      if (this.searchQuery) {
        const matchUrl = (res.url || '').toLowerCase().includes(this.searchQuery);
        const matchHost = (res.host || '').toLowerCase().includes(this.searchQuery);
        const matchIp = (res.ip || '').toLowerCase().includes(this.searchQuery);
        const matchMethod = (res.method || '').toLowerCase().includes(this.searchQuery);
        const matchType = (res.type || '').toLowerCase().includes(this.searchQuery);
        const matchStatus = String(res.status).includes(this.searchQuery);
        if (!matchUrl && !matchHost && !matchIp && !matchMethod && !matchType && !matchStatus) {
          return false;
        }
      }

      return true;
    });

    this.render();
    this.updateStats();
  }

  formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  render() {
    if (!this.container) return;

    if (this.filteredResources.length === 0) {
      this.container.innerHTML = `
        <div class="empty-table-state">
          <div class="empty-icon"><i class="fa-solid fa-magnifying-glass"></i></div>
          <h4>No network packets match the current criteria</h4>
          <p>Try clearing your search query or enabling filtered domain categories.</p>
        </div>
      `;
      return;
    }

    let rowsHtml = '';
    this.filteredResources.forEach(res => {
      const isSelected = res.id === this.selectedResourceId;
      const statusClass = res.status >= 200 && res.status < 300 ? 'status-2xx' :
                          res.status >= 300 && res.status < 400 ? 'status-3xx' :
                          res.status >= 400 && res.status < 500 ? 'status-4xx' : 'status-5xx';

      const methodClass = `method-${(res.method || 'GET').toLowerCase()}`;
      const c = res.classification;

      // Extract short path for display
      let displayPath = res.url;
      try {
        const u = new URL(res.url);
        displayPath = u.pathname + (u.search ? u.search.slice(0, 24) + '...' : '');
      } catch (_) {}

      rowsHtml += `
        <tr class="packet-row ${isSelected ? 'row-selected' : ''}" 
            data-id="${res.id}" 
            style="border-left: 4px solid ${c.color};"
            onclick="window.wiresharkTableInstance.selectRow('${res.id}')">
          <td class="col-num">${String(res.index).padStart(2, '0')}</td>
          <td class="col-status">
            <span class="status-pill ${statusClass}">${res.status || '---'}</span>
          </td>
          <td class="col-method">
            <span class="method-badge ${methodClass}">${res.method}</span>
          </td>
          <td class="col-category">
            <span class="domain-tag" style="background:${c.bg}; border: 1px solid ${c.border}; color:${c.text};">
              <span class="tag-indicator" style="background:${c.color};"></span>
              ${c.name}
            </span>
          </td>
          <td class="col-host">
            <span class="host-text" title="${res.host}">${res.host}</span>
          </td>
          <td class="col-ip">
            <span class="ip-code" title="Resolved Server IP">
              ${res.ip || '<span class="ip-pending">Resolving...</span>'}
            </span>
          </td>
          <td class="col-path" title="${res.url}">
            <span class="path-text">${displayPath}</span>
          </td>
          <td class="col-type">
            <span class="type-pill">${res.type || 'Other'}</span>
          </td>
          <td class="col-size">${this.formatBytes(res.size)}</td>
          <td class="col-time">${res.time || 0} ms</td>
        </tr>
      `;
    });

    this.container.innerHTML = `
      <table class="packet-table">
        <thead>
          <tr>
            <th class="col-num">#</th>
            <th class="col-status">Status</th>
            <th class="col-method">Method</th>
            <th class="col-category">Domain Role (Wireshark)</th>
            <th class="col-host">Host</th>
            <th class="col-ip">Resolved IP</th>
            <th class="col-path">Resource Path</th>
            <th class="col-type">Type</th>
            <th class="col-size">Size</th>
            <th class="col-time">Time</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    `;
  }

  selectRow(resourceId) {
    this.selectedResourceId = resourceId;
    const selected = this.resources.find(r => r.id === resourceId);
    
    // Update active highlight in DOM
    document.querySelectorAll('.packet-row').forEach(row => {
      row.classList.toggle('row-selected', row.getAttribute('data-id') === resourceId);
    });

    if (this.onSelectCallback && selected) {
      this.onSelectCallback(selected);
    }
  }

  updateStats() {
    const totalCount = this.resources.length;
    const filteredCount = this.filteredResources.length;
    const totalBytes = this.filteredResources.reduce((acc, r) => acc + (r.size || 0), 0);

    const statsElem = document.getElementById('wireshark-stream-stats');
    if (statsElem) {
      statsElem.innerHTML = `
        <span>Showing <strong>${filteredCount}</strong> of <strong>${totalCount}</strong> transactions</span>
        <span class="separator">•</span>
        <span>Payload: <strong>${this.formatBytes(totalBytes)}</strong></span>
      `;
    }
  }
}

if (typeof window !== 'undefined') {
  window.WiresharkTable = WiresharkTable;
}
