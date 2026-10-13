/**
 * Main Application Orchestrator for AeroScope
 * Coordinates Postman client, Wireshark packet stream, Topology Mindmap,
 * and Origin-Framed Source Code Inspector.
 */

// Safe browser environment fallback without any mocks
if (!window.electronAPI) {
  window.electronAPI = {
    sendRequest: async (opts) => {
      const startTime = Date.now();
      try {
        const res = await fetch(opts.url, {
          method: opts.method,
          headers: opts.headers,
          body: ['POST', 'PUT', 'PATCH'].includes(opts.method) ? opts.body : undefined
        });
        const text = await res.text();
        let json = null;
        try { json = JSON.parse(text); } catch (_) {}
        const headers = {};
        res.headers.forEach((v, k) => { headers[k] = v; });
        const host = new URL(opts.url).hostname;
        return {
          status: res.status,
          statusText: res.statusText || 'OK',
          headers,
          body: text,
          jsonData: json,
          size: text.length,
          timing: { total: Date.now() - startTime },
          network: { remoteIp: '127.0.0.1', host, provider: 'HTTP Host' }
        };
      } catch (err) {
        return {
          error: true,
          message: err.message,
          status: 0,
          statusText: 'Failed',
          headers: {},
          body: '',
          timing: { total: 0 }
        };
      }
    },
    scanPage: async (url) => {
      let norm = url.trim();
      if (!/^https?:\/\//i.test(norm)) norm = 'https://' + norm;
      const host = new URL(norm).hostname;
      const baseDomain = window.DomainClassifier.extractBaseDomain(host);

      try {
        const res = await fetch(norm);
        const text = await res.text();
        return {
          success: true,
          url: norm,
          rootHost: host,
          rootDomain: baseDomain,
          name: host,
          sourceCode: text,
          resources: [{
            id: 'req_1',
            url: norm,
            method: 'GET',
            status: res.status,
            type: 'Document',
            host,
            ip: '127.0.0.1',
            size: text.length,
            time: 30,
            protocol: 'HTTP/2'
          }],
          dnsMap: { [host]: { ip: '127.0.0.1', provider: 'Web Host' } }
        };
      } catch (err) {
        return {
          error: true,
          message: err.message,
          resources: []
        };
      }
    },
    resolveDns: async (host) => ({ ip: '127.0.0.1', provider: 'Host' }),
    resolveBatchDns: async () => ({})
  };
}

document.addEventListener('DOMContentLoaded', () => {
  // Global State starts completely EMPTY by default
  window.appState = {
    currentUrl: '',
    rootHost: '',
    rootDomain: '',
    resources: [],
    dnsMap: {},
    sourceCode: '',
    currentScan: null,
    activeTab: 'postman',
    isStackedMode: false
  };

  // 1. Initialize Wireshark Table
  window.wiresharkTableInstance = new WiresharkTable('wireshark-table-container', {
    onSelect: (resource) => {
      openPacketDrawer(resource);
    }
  });

  // 2. Initialize Topology Mindmap
  window.mindmapInstance = new TopologyMindmap('topology-network-canvas', {
    onNodeClick: (hostData) => {
      if (hostData) {
        window.wiresharkTableInstance.filterByHost(hostData.host);
        updateMindmapSidebar(hostData);
        if (window.appFrameInstance) {
          window.appFrameInstance.highlightOrigin(hostData.host);
        }
      } else {
        window.wiresharkTableInstance.filterByHost('');
        updateMindmapSidebar(null);
        if (window.appFrameInstance) {
          window.appFrameInstance.highlightOrigin(null);
        }
      }
    }
  });

  // 3. Initialize Source Code Frame Viewer
  window.appFrameInstance = new AppFrameViewer('browser-viewport-content', 'origin-code-modal');

  // 4. Initialize Postman Client
  window.postmanInstance = new PostmanClient({
    onResponse: (response, reqMeta) => {
      try {
        const u = new URL(reqMeta.url);
        window.appState.currentUrl = reqMeta.url;
        window.appState.rootHost = u.hostname;
        window.appState.rootDomain = window.DomainClassifier.extractBaseDomain(u.hostname);
        window.appState.sourceCode = response.body || '';

        const singleResource = [{
          id: 'req_direct',
          url: reqMeta.url,
          method: reqMeta.method,
          status: response.status,
          type: 'Fetch/XHR',
          host: u.hostname,
          ip: response.network?.remoteIp || '127.0.0.1',
          size: response.size || 1024,
          time: response.timing?.total || 25,
          protocol: 'HTTP/2'
        }];

        const dnsMap = {
          [u.hostname]: {
            ip: response.network?.remoteIp || '127.0.0.1',
            provider: response.network?.provider || 'HTTP Host'
          }
        };

        window.appState.resources = singleResource;
        window.appState.dnsMap = dnsMap;

        updateAllViews(singleResource, u.hostname, window.appState.rootDomain, dnsMap, response.body || '');
      } catch (e) {
        console.error('Error processing response:', e);
      }
    },
    onTrace: (url) => {
      performDeepScan(url);
    }
  });
  window.postmanInstance.init();

  // Bind Main Navigation Tabs
  bindNavigationTabs();

  // Bind Global Header Scan Bar
  bindHeaderScanBar();

  // Bind Wireshark Legend Filter Toggles
  bindWiresharkLegend();

  // Bind Mindmap Controls
  bindMindmapControls();

  // Bind App Frame Controls
  bindAppFrameControls();

  // Bind Stack View Controls
  bindStackControls();

  // Bind Anime.js gaming button animations
  initGamingAnimations();

  // Render initial clean empty states across all views
  renderInitialEmptyStates();
});

/**
 * Initializes empty states across all views
 */
function renderInitialEmptyStates() {
  window.wiresharkTableInstance.setData([], '', '');
  window.appFrameInstance.renderEmptyState();
  updateHeaderBadges([], '', '');
  renderDnsMatrix([], {}, '', '');
}

/**
 * Triggers full deep-scan / trace of user-provided URL
 */
async function performDeepScan(targetUrl) {
  if (!targetUrl || !targetUrl.trim()) {
    alert('Please enter a target URL to trace.');
    return;
  }

  const scanBtn = document.getElementById('global-scan-btn');
  const targetInput = document.getElementById('global-url-bar');
  if (scanBtn) {
    scanBtn.disabled = true;
    scanBtn.innerHTML = `<span>Scanning Mesh...</span>`;
  }

  try {
    const scanResult = await window.electronAPI.scanPage(targetUrl);
    if (scanResult.error) {
      alert(`Scan failed: ${scanResult.message}`);
      return;
    }

    window.appState.currentScan = scanResult;
    window.appState.currentUrl = scanResult.url;
    window.appState.rootHost = scanResult.rootHost;
    window.appState.rootDomain = scanResult.rootDomain;
    window.appState.resources = scanResult.resources;
    window.appState.dnsMap = scanResult.dnsMap || {};
    window.appState.sourceCode = scanResult.sourceCode || '';

    if (targetInput) targetInput.value = scanResult.url;
    const postmanUrl = document.getElementById('postman-url-input');
    if (postmanUrl && !postmanUrl.value) postmanUrl.value = scanResult.url;

    updateAllViews(
      scanResult.resources,
      scanResult.rootHost,
      scanResult.rootDomain,
      scanResult.dnsMap,
      scanResult.sourceCode
    );

  } catch (err) {
    console.error('Scan error:', err);
  } finally {
    if (scanBtn) {
      scanBtn.disabled = false;
      scanBtn.innerHTML = `<span>Trace Architecture</span>`;
    }
  }
}

/**
 * Propagates updated network dataset to all views
 */
function updateAllViews(resources, rootHost, rootDomain, dnsMap, sourceCode) {
  // 1. Wireshark Table
  window.wiresharkTableInstance.setData(resources, rootHost, rootDomain);

  // 2. Topology Mindmap
  window.mindmapInstance.renderTopology(resources, rootHost, rootDomain, dnsMap);

  // 3. Application Source Code View with Origin Frames
  window.appFrameInstance.loadSourceCode(sourceCode, rootHost, rootDomain, resources, dnsMap);

  // 4. Update Header Metrics
  updateHeaderBadges(resources, rootHost, rootDomain);

  // 5. Update DNS Matrix Tab
  renderDnsMatrix(resources, dnsMap, rootHost, rootDomain);
}

function updateHeaderBadges(resources, rootHost, rootDomain) {
  const hosts = new Set(resources.map(r => r.host).filter(Boolean));
  const totalBytes = resources.reduce((a, b) => a + (b.size || 0), 0);
  const sizeStr = totalBytes > 1024 * 1024 ? `${(totalBytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.round(totalBytes / 1024)} KB`;

  const nodeCountElem = document.getElementById('badge-nodes-count');
  const reqCountElem = document.getElementById('badge-reqs-count');
  const rootHostElem = document.getElementById('badge-root-host');

  if (nodeCountElem) nodeCountElem.textContent = hosts.size > 0 ? `${hosts.size} Parties` : '0 Parties';
  if (reqCountElem) reqCountElem.textContent = resources.length > 0 ? `${resources.length} Packets (${sizeStr})` : '0 Packets';
  if (rootHostElem) rootHostElem.textContent = rootHost || 'None';
}

function bindNavigationTabs() {
  document.querySelectorAll('.main-nav-tab').forEach(tabBtn => {
    tabBtn.addEventListener('click', (e) => {
      const targetView = e.currentTarget.getAttribute('data-view');
      switchMainView(targetView);
    });
  });
}

function switchMainView(viewName, smoothScrollInStack = true) {
  window.appState.activeTab = viewName;

  document.querySelectorAll('.main-nav-tab').forEach(tab => {
    tab.classList.toggle('active', tab.getAttribute('data-view') === viewName);
  });

  if (window.appState.isStackedMode) {
    // In stacked mode: smooth-scroll to the targeted section
    if (smoothScrollInStack) {
      const targetPanel = document.getElementById(`view-${viewName}`);
      const container = document.getElementById('main-app-content');
      if (targetPanel && container) {
        // Expand panel if it was collapsed
        targetPanel.classList.remove('panel-collapsed');

        if (typeof anime !== 'undefined') {
          anime({
            targets: container,
            scrollTop: targetPanel.offsetTop - 16,
            duration: 400,
            easing: 'easeInOutCubic'
          });
          // Flash gaming neon highlight on the target panel
          anime({
            targets: targetPanel,
            borderColor: ['#00e5ff', 'rgba(0, 229, 255, 0.2)'],
            boxShadow: ['0 0 24px rgba(0, 229, 255, 0.4)', '0 8px 32px rgba(0, 0, 0, 0.5)'],
            duration: 900,
            easing: 'easeOutQuad'
          });
        } else {
          targetPanel.scrollIntoView({ behavior: 'smooth' });
        }
      }
    }
  } else {
    // In single view mode: anime.js view entrance transition
    document.querySelectorAll('.view-panel').forEach(panel => {
      const isTarget = panel.id === `view-${viewName}`;
      if (isTarget) {
        panel.classList.add('active');
        if (typeof anime !== 'undefined') {
          anime({
            targets: panel,
            opacity: [0, 1],
            translateY: [14, 0],
            scale: [0.995, 1],
            duration: 320,
            easing: 'easeOutCubic'
          });
        }
      } else {
        panel.classList.remove('active');
      }
    });
  }

  if (viewName === 'mindmap' && window.mindmapInstance) {
    setTimeout(() => {
      window.mindmapInstance.fitView();
    }, 150);
  }
}

function bindHeaderScanBar() {
  const input = document.getElementById('global-url-bar');
  const btn = document.getElementById('global-scan-btn');

  if (btn && input) {
    btn.addEventListener('click', () => {
      const url = input.value.trim();
      if (url) performDeepScan(url);
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const url = input.value.trim();
        if (url) performDeepScan(url);
      }
    });
  }
}

function bindWiresharkLegend() {
  const searchInput = document.getElementById('wireshark-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      window.wiresharkTableInstance.setSearch(e.target.value);
    });
  }

  document.querySelectorAll('.legend-chip').forEach(chip => {
    chip.addEventListener('click', (e) => {
      const category = e.currentTarget.getAttribute('data-category');
      const isCurrentlyActive = !e.currentTarget.classList.contains('chip-inactive');
      const nextActive = !isCurrentlyActive;

      e.currentTarget.classList.toggle('chip-inactive', !nextActive);
      window.wiresharkTableInstance.setFilter(category, nextActive);
    });
  });
}

function bindMindmapControls() {
  const btnFit = document.getElementById('mindmap-btn-fit');
  if (btnFit) {
    btnFit.addEventListener('click', () => window.mindmapInstance.fitView());
  }

  const chkPhysics = document.getElementById('mindmap-physics-toggle');
  if (chkPhysics) {
    chkPhysics.addEventListener('change', (e) => {
      window.mindmapInstance.togglePhysics(e.target.checked);
    });
  }
}

function bindAppFrameControls() {
  const modalClose = document.getElementById('modal-origin-close');
  if (modalClose) {
    modalClose.addEventListener('click', () => {
      window.appFrameInstance.closeModal();
    });
  }

  const copyCodeBtn = document.getElementById('modal-copy-code-btn');
  if (copyCodeBtn) {
    copyCodeBtn.addEventListener('click', () => {
      const codeElem = document.getElementById('modal-origin-code');
      if (codeElem) {
        navigator.clipboard.writeText(codeElem.textContent || '');
        copyCodeBtn.textContent = 'Copied!';
        setTimeout(() => { copyCodeBtn.textContent = 'Copy Code'; }, 1500);
      }
    });
  }

  const modalOverlay = document.getElementById('origin-code-modal');
  if (modalOverlay) {
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) {
        window.appFrameInstance.closeModal();
      }
    });
  }
}

function openPacketDrawer(resource) {
  const drawer = document.getElementById('packet-detail-drawer');
  if (!drawer) return;

  const c = resource.classification;
  document.getElementById('drawer-res-url').textContent = resource.url;
  document.getElementById('drawer-res-host').textContent = resource.host;
  document.getElementById('drawer-res-ip').textContent = resource.ip || '127.0.0.1';
  document.getElementById('drawer-res-method').textContent = resource.method;
  document.getElementById('drawer-res-status').textContent = `${resource.status}`;
  document.getElementById('drawer-res-size').textContent = `${(resource.size / 1024).toFixed(1)} KB`;
  document.getElementById('drawer-res-time').textContent = `${resource.time} ms`;

  const tagElem = document.getElementById('drawer-res-role');
  if (tagElem) {
    tagElem.innerHTML = `
      <span class="domain-tag" style="background:${c.bg}; border:1px solid ${c.border}; color:${c.text};">
        <span class="tag-indicator" style="background:${c.color}"></span>
        ${c.name}
      </span>
    `;
  }

  const btnHighlightGraph = document.getElementById('drawer-btn-graph');
  if (btnHighlightGraph) {
    btnHighlightGraph.onclick = () => {
      switchMainView('mindmap');
    };
  }

  const btnHighlightFrame = document.getElementById('drawer-btn-frame');
  if (btnHighlightFrame) {
    btnHighlightFrame.onclick = () => {
      switchMainView('appframe');
      window.appFrameInstance.highlightOrigin(resource.host);
    };
  }

  const btnOpenPostman = document.getElementById('drawer-btn-postman');
  if (btnOpenPostman) {
    btnOpenPostman.onclick = () => {
      switchMainView('postman');
      const urlInput = document.getElementById('postman-url-input');
      const methodSelect = document.getElementById('postman-method-select');
      if (urlInput) urlInput.value = resource.url;
      if (methodSelect) {
        methodSelect.value = resource.method;
        methodSelect.className = `method-select method-${resource.method.toLowerCase()}`;
      }
    };
  }

  drawer.classList.add('drawer-open');
}

function closePacketDrawer() {
  const drawer = document.getElementById('packet-detail-drawer');
  if (drawer) drawer.classList.remove('drawer-open');
}

function updateMindmapSidebar(hostData) {
  const sidebar = document.getElementById('mindmap-sidebar-details');
  if (!sidebar) return;

  if (!hostData) {
    sidebar.innerHTML = `
      <div class="sidebar-placeholder">
        <p>Click on any collaborating party in the mindmap to inspect its server IP address, classification rule, and transferred payload.</p>
      </div>
    `;
    return;
  }

  const c = hostData.classification;
  sidebar.innerHTML = `
    <div class="host-detail-card" style="border-top: 3px solid ${c.border}">
      <div class="card-title-row">
        <h3>${hostData.host}</h3>
        <span class="domain-tag" style="background:${c.bg}; border:1px solid ${c.border}; color:${c.text};">
          ${c.name}
        </span>
      </div>
      <div class="detail-props">
        <div class="prop-item">
          <span class="label">Server IP Address:</span>
          <span class="value ip-highlight">${hostData.ip}</span>
        </div>
        <div class="prop-item">
          <span class="label">Infrastructure Provider:</span>
          <span class="value">${hostData.provider}</span>
        </div>
        <div class="prop-item">
          <span class="label">Captured Packets:</span>
          <span class="value">${hostData.count} calls</span>
        </div>
        <div class="prop-item">
          <span class="label">Total Transferred:</span>
          <span class="value">${(hostData.totalBytes / 1024).toFixed(1)} KB</span>
        </div>
        <div class="prop-item">
          <span class="label">Resource Types:</span>
          <span class="value">${Array.from(hostData.types).join(', ')}</span>
        </div>
      </div>
      <div class="card-actions">
        <button class="btn-action-sm" onclick="window.wiresharkTableInstance.filterByHost('${hostData.host}'); switchMainView('wireshark');">
          View in Wireshark Waterfall
        </button>
        <button class="btn-action-sm outline" onclick="switchMainView('appframe'); window.appFrameInstance.highlightOrigin('${hostData.host}');">
          Highlight in Source Code View
        </button>
      </div>
    </div>
  `;
}

function renderDnsMatrix(resources, dnsMap, rootHost, rootDomain) {
  const matrixContainer = document.getElementById('dns-matrix-table-body');
  if (!matrixContainer) return;

  const hosts = [...new Set(resources.map(r => r.host).filter(Boolean))];

  if (hosts.length === 0) {
    matrixContainer.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; color: var(--text-dim); padding: 32px 12px;">
          No DNS records resolved yet. Execute an API request or enter a target URL to populate the matrix.
        </td>
      </tr>
    `;
    return;
  }

  let rowsHtml = '';
  hosts.forEach(host => {
    const classification = window.DomainClassifier.classifyResource(host, rootHost, rootDomain);
    const dnsInfo = dnsMap[host] || { ip: '127.0.0.1', provider: 'Autonomous Edge', allIps: [] };
    const matchingRes = resources.filter(r => r.host === host);
    const totalBytes = matchingRes.reduce((a, b) => a + (b.size || 0), 0);

    rowsHtml += `
      <tr>
        <td>
          <span class="domain-tag" style="background:${classification.bg}; border:1px solid ${classification.border}; color:${classification.text};">
            <span class="tag-indicator" style="background:${classification.color}"></span>
            ${classification.name}
          </span>
        </td>
        <td><strong>${host}</strong></td>
        <td><code class="ip-code">${dnsInfo.ip}</code></td>
        <td><span class="provider-pill">${dnsInfo.provider || 'Autonomous Edge'}</span></td>
        <td>${matchingRes.length} requests</td>
        <td>${(totalBytes / 1024).toFixed(1)} KB</td>
      </tr>
    `;
  });

  matrixContainer.innerHTML = rowsHtml;
}

/**
 * Stack Views Control and Layout Manager
 */
function bindStackControls() {
  const stackToggleBtn = document.getElementById('stack-toggle-btn');
  if (stackToggleBtn) {
    stackToggleBtn.addEventListener('click', () => {
      toggleStackMode();
    });
  }

  // Bind collapse/expand buttons on each stacked panel header
  document.querySelectorAll('.panel-collapse-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const panel = e.currentTarget.closest('.view-panel');
      if (panel) {
        const isCollapsed = panel.classList.toggle('panel-collapsed');
        if (typeof anime !== 'undefined') {
          anime({
            targets: e.currentTarget.querySelector('i'),
            rotate: isCollapsed ? 180 : 0,
            duration: 250,
            easing: 'easeInOutQuad'
          });
        }
      }
    });
  });
}

function toggleStackMode(forceState) {
  const container = document.getElementById('main-app-content');
  const stackBtn = document.getElementById('stack-toggle-btn');
  const stackBtnLabel = document.getElementById('stack-btn-label');
  if (!container || !stackBtn) return;

  const nextState = forceState !== undefined ? forceState : !window.appState.isStackedMode;
  window.appState.isStackedMode = nextState;

  if (nextState) {
    // ENTER STACKED MODE: All panels stacked vertically
    container.classList.add('stacked-mode');
    stackBtn.classList.add('stack-active');
    if (stackBtnLabel) stackBtnLabel.textContent = 'Single View';
    stackBtn.querySelector('i').className = 'fa-solid fa-table-columns';

    // Anime.js cascade transition for all panels
    if (typeof anime !== 'undefined') {
      anime({
        targets: '.app-content.stacked-mode .view-panel',
        opacity: [0, 1],
        translateY: [24, 0],
        delay: anime.stagger(60),
        duration: 380,
        easing: 'easeOutCubic'
      });
    }

    if (window.mindmapInstance) {
      setTimeout(() => window.mindmapInstance.fitView(), 200);
    }
  } else {
    // EXIT STACKED MODE: Revert to single active tab view
    container.classList.remove('stacked-mode');
    stackBtn.classList.remove('stack-active');
    if (stackBtnLabel) stackBtnLabel.textContent = 'Stack Views';
    stackBtn.querySelector('i').className = 'fa-solid fa-layer-group';

    switchMainView(window.appState.activeTab || 'postman', false);
  }
}

/**
 * Anime.js Micro-Animations for Gaming UI Buttons
 */
function initGamingAnimations() {
  if (typeof anime === 'undefined') return;

  const selector = '.btn-trace, .btn-send, .btn-trace-distributed, .main-nav-tab, .sub-tab-btn, .btn-add-row, .sample-preset-chip, .btn-ctrl, .btn-action-sm, .stack-toggle-btn, .panel-stack-action-btn, .modal-close-btn, .btn-copy-code';

  document.addEventListener('mouseover', (e) => {
    const btn = e.target.closest(selector);
    if (btn && !btn.disabled) {
      anime.remove(btn);
      anime({
        targets: btn,
        scale: 1.025,
        translateY: -1,
        duration: 160,
        easing: 'easeOutQuad'
      });
    }
  });

  document.addEventListener('mouseout', (e) => {
    const btn = e.target.closest(selector);
    if (btn) {
      anime.remove(btn);
      anime({
        targets: btn,
        scale: 1.0,
        translateY: 0,
        duration: 160,
        easing: 'easeOutQuad'
      });
    }
  });

  document.addEventListener('mousedown', (e) => {
    const btn = e.target.closest(selector);
    if (btn && !btn.disabled) {
      anime.remove(btn);
      anime({
        targets: btn,
        scale: 0.96,
        translateY: 1,
        duration: 70,
        easing: 'easeOutQuad'
      });
    }
  });

  document.addEventListener('mouseup', (e) => {
    const btn = e.target.closest(selector);
    if (btn && !btn.disabled) {
      anime.remove(btn);
      anime({
        targets: btn,
        scale: 1.025,
        translateY: -1,
        duration: 120,
        easing: 'easeOutQuad'
      });
    }
  });
}

window.closePacketDrawer = closePacketDrawer;
window.switchMainView = switchMainView;
window.toggleStackMode = toggleStackMode;
