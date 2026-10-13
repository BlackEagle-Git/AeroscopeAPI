/**
 * Postman-like API Client Controller
 * Handles GET, POST, PUT, DELETE, PATCH requests, query params, headers,
 * body serialization, auth, history, and response formatting.
 */

class PostmanClient {
  constructor(options = {}) {
    this.history = JSON.parse(localStorage.getItem('aerowire_history') || '[]');
    this.onResponseCallback = options.onResponse || null;
    this.onTraceCallback = options.onTrace || null;
    this.activeResponseTab = 'pretty';
    this.activeRequestTab = 'params';
    this.currentResponse = null;
  }

  init() {
    this.bindDomEvents();
    this.renderHistory();
    this.addDefaultParamRow();
    this.addDefaultHeaderRow();
  }

  bindDomEvents() {
    // Send buttons
    const sendBtn = document.getElementById('postman-send-btn');
    if (sendBtn) {
      sendBtn.addEventListener('click', () => this.handleSend(false));
    }

    const traceBtn = document.getElementById('postman-trace-btn');
    if (traceBtn) {
      traceBtn.addEventListener('click', () => this.handleSend(true));
    }

    // Method change coloring
    const methodSelect = document.getElementById('postman-method-select');
    if (methodSelect) {
      methodSelect.addEventListener('change', (e) => {
        methodSelect.className = `method-select method-${e.target.value.toLowerCase()}`;
      });
    }

    // Request tabs (Params, Headers, Body, Auth)
    document.querySelectorAll('.req-tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tab = e.currentTarget.getAttribute('data-tab');
        this.switchRequestTab(tab);
      });
    });

    // Response tabs (Pretty, Raw, Headers, Preview)
    document.querySelectorAll('.res-tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tab = e.currentTarget.getAttribute('data-res-tab');
        this.switchResponseTab(tab);
      });
    });

    // Add row buttons
    const addParamBtn = document.getElementById('add-param-row-btn');
    if (addParamBtn) addParamBtn.addEventListener('click', () => this.addParamRow());

    const addHeaderBtn = document.getElementById('add-header-row-btn');
    if (addHeaderBtn) addHeaderBtn.addEventListener('click', () => this.addHeaderRow());

    // Copy response button
    const copyResBtn = document.getElementById('copy-response-btn');
    if (copyResBtn) {
      copyResBtn.addEventListener('click', () => {
        if (this.currentResponse) {
          navigator.clipboard.writeText(this.currentResponse.body || '');
          copyResBtn.textContent = 'Copied!';
          setTimeout(() => { copyResBtn.textContent = 'Copy'; }, 1500);
        }
      });
    }

    // Format JSON button
    const formatJsonBtn = document.getElementById('format-json-btn');
    if (formatJsonBtn) {
      formatJsonBtn.addEventListener('click', () => this.formatJsonBody());
    }
  }

  switchRequestTab(tab) {
    this.activeRequestTab = tab;
    document.querySelectorAll('.req-tab-btn').forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-tab') === tab);
    });
    document.querySelectorAll('.req-tab-pane').forEach(p => {
      p.classList.toggle('active', p.getAttribute('data-pane') === tab);
    });
  }

  switchResponseTab(tab) {
    this.activeResponseTab = tab;
    document.querySelectorAll('.res-tab-btn').forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-res-tab') === tab);
    });
    document.querySelectorAll('.res-tab-pane').forEach(p => {
      p.classList.toggle('active', p.getAttribute('data-res-pane') === tab);
    });
  }

  addParamRow(key = '', val = '', enabled = true) {
    const tbody = document.getElementById('params-table-body');
    if (!tbody) return;
    const row = document.createElement('tr');
    row.className = 'keyvalue-row';
    row.innerHTML = `
      <td class="col-check"><input type="checkbox" ${enabled ? 'checked' : ''} class="row-enable" /></td>
      <td class="col-key"><input type="text" placeholder="Key" value="${key}" class="key-input" /></td>
      <td class="col-val"><input type="text" placeholder="Value" value="${val}" class="val-input" /></td>
      <td class="col-del"><button class="btn-del-row" title="Delete"><i class="fa-solid fa-xmark"></i></button></td>
    `;
    row.querySelector('.btn-del-row').addEventListener('click', () => row.remove());
    tbody.appendChild(row);
  }

  addHeaderRow(key = '', val = '', enabled = true) {
    const tbody = document.getElementById('headers-table-body');
    if (!tbody) return;
    const row = document.createElement('tr');
    row.className = 'keyvalue-row';
    row.innerHTML = `
      <td class="col-check"><input type="checkbox" ${enabled ? 'checked' : ''} class="row-enable" /></td>
      <td class="col-key"><input type="text" placeholder="Header (e.g. Content-Type)" value="${key}" class="key-input" /></td>
      <td class="col-val"><input type="text" placeholder="Value (e.g. application/json)" value="${val}" class="val-input" /></td>
      <td class="col-del"><button class="btn-del-row" title="Delete"><i class="fa-solid fa-xmark"></i></button></td>
    `;
    row.querySelector('.btn-del-row').addEventListener('click', () => row.remove());
    tbody.appendChild(row);
  }

  addDefaultParamRow() {
    this.addParamRow('', '', true);
  }

  addDefaultHeaderRow() {
    this.addHeaderRow('Content-Type', 'application/json', true);
  }

  formatJsonBody() {
    const editor = document.getElementById('body-json-editor');
    if (!editor) return;
    try {
      const parsed = JSON.parse(editor.value);
      editor.value = JSON.stringify(parsed, null, 2);
    } catch (_) {
      alert('Invalid JSON syntax');
    }
  }

  getCollectedHeaders() {
    const headers = {};
    document.querySelectorAll('#headers-table-body tr').forEach(row => {
      const isEnabled = row.querySelector('.row-enable')?.checked;
      const key = row.querySelector('.key-input')?.value.trim();
      const val = row.querySelector('.val-input')?.value.trim();
      if (isEnabled && key) {
        headers[key] = val;
      }
    });

    // Handle Auth tab
    const authType = document.getElementById('auth-type-select')?.value;
    if (authType === 'bearer') {
      const token = document.getElementById('auth-bearer-token')?.value.trim();
      if (token) headers['Authorization'] = `Bearer ${token}`;
    } else if (authType === 'basic') {
      const user = document.getElementById('auth-basic-user')?.value || '';
      const pass = document.getElementById('auth-basic-pass')?.value || '';
      const b64 = btoa(`${user}:${pass}`);
      headers['Authorization'] = `Basic ${b64}`;
    }

    return headers;
  }

  getCollectedParams() {
    const params = new URLSearchParams();
    document.querySelectorAll('#params-table-body tr').forEach(row => {
      const isEnabled = row.querySelector('.row-enable')?.checked;
      const key = row.querySelector('.key-input')?.value.trim();
      const val = row.querySelector('.val-input')?.value.trim();
      if (isEnabled && key) {
        params.append(key, val);
      }
    });
    return params;
  }

  getCollectedBody() {
    const bodyType = document.querySelector('input[name="body-type"]:checked')?.value || 'none';
    if (bodyType === 'json') {
      const val = document.getElementById('body-json-editor')?.value.trim();
      return val || null;
    } else if (bodyType === 'raw') {
      const val = document.getElementById('body-raw-editor')?.value;
      return val || null;
    }
    return null;
  }

  async handleSend(deepTrace = false) {
    const urlInput = document.getElementById('postman-url-input');
    const methodSelect = document.getElementById('postman-method-select');
    const sendBtn = document.getElementById('postman-send-btn');
    const statusPill = document.getElementById('res-status-badge');
    const timePill = document.getElementById('res-time-badge');
    const sizePill = document.getElementById('res-size-badge');
    const ipPill = document.getElementById('res-ip-badge');

    let url = (urlInput ? urlInput.value.trim() : '');
    const method = methodSelect ? methodSelect.value : 'GET';

    if (!url) {
      alert('Please enter a target URL');
      return;
    }

    // Append query params if any
    const params = this.getCollectedParams();
    const paramStr = params.toString();
    if (paramStr) {
      url += (url.includes('?') ? '&' : '?') + paramStr;
    }

    const headers = this.getCollectedHeaders();
    const body = this.getCollectedBody();

    // UI loading state
    if (sendBtn) sendBtn.disabled = true;
    if (statusPill) statusPill.textContent = 'Sending...';

    try {
      const response = await window.electronAPI.sendRequest({
        url,
        method,
        headers,
        body
      });

      this.currentResponse = response;
      this.displayResponse(response);
      this.addToHistory(method, url, response.status);

      if (this.onResponseCallback) {
        this.onResponseCallback(response, { url, method });
      }

      if (deepTrace && this.onTraceCallback) {
        this.onTraceCallback(url);
      }
    } catch (err) {
      this.displayError(err.message);
    } finally {
      if (sendBtn) sendBtn.disabled = false;
    }
  }

  displayResponse(res) {
    const statusPill = document.getElementById('res-status-badge');
    const timePill = document.getElementById('res-time-badge');
    const sizePill = document.getElementById('res-size-badge');
    const ipPill = document.getElementById('res-ip-badge');
    const jsonPre = document.getElementById('res-json-content');
    const rawPre = document.getElementById('res-raw-content');
    const headersTable = document.getElementById('res-headers-table');
    const previewFrame = document.getElementById('res-preview-frame');

    const isSuccess = res.status >= 200 && res.status < 300;
    const isError = res.status >= 400;

    if (statusPill) {
      statusPill.textContent = `${res.status} ${res.statusText}`;
      statusPill.className = `status-pill ${isSuccess ? 'status-2xx' : isError ? 'status-4xx' : 'status-3xx'}`;
    }

    if (timePill) timePill.textContent = `${res.timing?.total || 0} ms`;
    if (sizePill) sizePill.textContent = `${(res.size / 1024).toFixed(1)} KB`;
    if (ipPill) {
      ipPill.innerHTML = `<span>IP:</span> <strong>${res.network?.remoteIp || '127.0.0.1'}</strong>`;
    }

    // Format JSON
    if (jsonPre) {
      if (res.jsonData) {
        jsonPre.innerHTML = this.syntaxHighlight(JSON.stringify(res.jsonData, null, 2));
      } else {
        try {
          const parsed = JSON.parse(res.body);
          jsonPre.innerHTML = this.syntaxHighlight(JSON.stringify(parsed, null, 2));
        } catch (_) {
          jsonPre.textContent = res.body || '(Empty body)';
        }
      }
    }

    if (rawPre) rawPre.textContent = res.body || '';

    // Headers Table
    if (headersTable) {
      let headersHtml = '';
      for (const [k, v] of Object.entries(res.headers || {})) {
        headersHtml += `<tr><td><strong>${k}</strong></td><td>${v}</td></tr>`;
      }
      headersTable.innerHTML = headersHtml || '<tr><td colspan="2">No headers</td></tr>';
    }

    // HTML Preview
    if (previewFrame) {
      previewFrame.srcdoc = res.body || '';
    }
  }

  displayError(msg) {
    const statusPill = document.getElementById('res-status-badge');
    if (statusPill) {
      statusPill.textContent = 'Error';
      statusPill.className = 'status-pill status-5xx';
    }
    const jsonPre = document.getElementById('res-json-content');
    if (jsonPre) jsonPre.textContent = `Error: ${msg}`;
  }

  syntaxHighlight(json) {
    if (!json) return '';
    json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, function (match) {
      let cls = 'json-number';
      if (/^"/.test(match)) {
        if (/:$/.test(match)) {
          cls = 'json-key';
        } else {
          cls = 'json-string';
        }
      } else if (/true|false/.test(match)) {
        cls = 'json-boolean';
      } else if (/null/.test(match)) {
        cls = 'json-null';
      }
      return `<span class="${cls}">${match}</span>`;
    });
  }

  addToHistory(method, url, status) {
    const item = {
      id: Date.now(),
      method,
      url,
      status,
      timestamp: new Date().toLocaleTimeString()
    };
    this.history.unshift(item);
    if (this.history.length > 25) this.history.pop();
    localStorage.setItem('aerowire_history', JSON.stringify(this.history));
    this.renderHistory();
  }

  renderHistory() {
    const list = document.getElementById('postman-history-list');
    if (!list) return;

    if (this.history.length === 0) {
      list.innerHTML = '<div class="empty-history">No recent requests</div>';
      return;
    }

    list.innerHTML = this.history.map(item => `
      <div class="history-item" onclick="window.postmanInstance.loadFromHistory('${item.url}', '${item.method}')">
        <span class="method-badge method-${item.method.toLowerCase()}">${item.method}</span>
        <span class="history-url" title="${item.url}">${item.url}</span>
        <span class="history-time">${item.timestamp}</span>
      </div>
    `).join('');
  }

  loadFromHistory(url, method) {
    const urlInput = document.getElementById('postman-url-input');
    const methodSelect = document.getElementById('postman-method-select');
    if (urlInput) urlInput.value = url;
    if (methodSelect) {
      methodSelect.value = method;
      methodSelect.className = `method-select method-${method.toLowerCase()}`;
    }
  }
}

if (typeof window !== 'undefined') {
  window.PostmanClient = PostmanClient;
}
