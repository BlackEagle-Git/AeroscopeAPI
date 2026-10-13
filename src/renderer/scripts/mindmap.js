/**
 * Mindmap and Distributed Network Topology Graph
 * Visualizes collaborating parties with IP addresses and Wireshark domain coloring.
 */

class TopologyMindmap {
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    this.network = null;
    this.nodesDataSet = null;
    this.edgesDataSet = null;
    this.onNodeClickCallback = options.onNodeClick || null;
    this.hostsData = new Map();
  }

  renderTopology(resources, rootHost, rootDomain, dnsMap = {}) {
    if (!this.container || typeof vis === 'undefined') return;

    // Aggregate collaborating domains
    this.hostsData.clear();

    resources.forEach(res => {
      const host = res.host || 'unknown';
      if (!this.hostsData.has(host)) {
        const classification = window.DomainClassifier.classifyResource(
          host,
          rootHost,
          rootDomain,
          res.type,
          res.url
        );
        const resolvedIp = res.ip || dnsMap[host]?.ip || 'Unknown IP';

        this.hostsData.set(host, {
          host,
          ip: resolvedIp,
          classification,
          count: 0,
          totalBytes: 0,
          types: new Set(),
          latencies: [],
          provider: dnsMap[host]?.provider || (classification.key === 'cdn' ? 'CDN Edge' : 'Distributed Cloud')
        });
      }

      const entry = this.hostsData.get(host);
      entry.count += 1;
      entry.totalBytes += (res.size || 0);
      if (res.type) entry.types.add(res.type);
      if (res.time) entry.latencies.push(res.time);
      if (res.ip && entry.ip === 'Unknown IP') entry.ip = res.ip;
    });

    const nodes = [];
    const edges = [];

    // Central Application Node
    const rootNodeId = 'node_app_root';
    nodes.push({
      id: rootNodeId,
      label: `Target Application\n${rootHost}`,
      title: `Root Target App: ${rootHost}`,
      shape: 'box',
      margin: 12,
      color: {
        background: '#090d1a',
        border: '#00e5ff',
        highlight: { background: '#121a30', border: '#39ff14' }
      },
      font: { color: '#e0f4ff', size: 13, face: 'Orbitron, Rajdhani, monospace', bold: true },
      shadow: { enabled: true, color: 'rgba(0, 229, 255, 0.5)', size: 20 }
    });

    // Create collaborating nodes
    let index = 0;
    this.hostsData.forEach((data, host) => {
      const c = data.classification;
      const nodeId = `node_${host}`;
      const avgLatency = data.latencies.length > 0 
        ? Math.round(data.latencies.reduce((a, b) => a + b, 0) / data.latencies.length) 
        : 20;

      const sizeFormatted = data.totalBytes > 1024 * 1024 
        ? `${(data.totalBytes / (1024 * 1024)).toFixed(1)} MB`
        : `${Math.round(data.totalBytes / 1024)} KB`;

      // Node label with Hostname and IP address as requested
      const nodeLabel = `${host}\n[IP: ${data.ip}]\n${data.count} calls • ${sizeFormatted}`;

      nodes.push({
        id: nodeId,
        hostKey: host,
        label: nodeLabel,
        title: `Host: ${host}\nIP: ${data.ip}\nRole: ${c.name}\nRequests: ${data.count}\nTransferred: ${sizeFormatted}\nAvg Latency: ${avgLatency}ms`,
        shape: host === rootHost ? 'box' : 'box',
        margin: 10,
        color: {
          background: c.bg.replace('0.15', '0.85'),
          border: c.border,
          highlight: {
            background: c.color,
            border: '#ffffff'
          }
        },
        font: {
          color: '#ffffff',
          size: host === rootHost ? 13 : 11,
          face: 'JetBrains Mono, monospace',
          multi: false
        },
        borderWidth: host === rootHost ? 3 : 2,
        shadow: {
          enabled: true,
          color: c.color,
          size: 10
        }
      });

      // Edge from Root App to this collaborating node
      let edgeRelation = 'Dependency';
      if (c.key === 'main') edgeRelation = 'Primary Host';
      else if (c.key === 'subdomain') edgeRelation = 'Subdomain Mesh';
      else if (c.key === 'api') edgeRelation = 'REST / Microservice';
      else if (c.key === 'cdn') edgeRelation = 'Static CDN Distribution';
      else if (c.key === 'analytics') edgeRelation = 'Telemetry Pipeline';
      else if (c.key === 'thirdparty') edgeRelation = '3rd-Party Integration';

      edges.push({
        from: rootNodeId,
        to: nodeId,
        label: edgeRelation,
        color: {
          color: c.color,
          highlight: c.lightColor,
          opacity: 0.8
        },
        width: Math.min(Math.max(data.count * 0.8, 1.5), 6),
        font: {
          color: '#94a3b8',
          size: 9,
          align: 'middle',
          strokeWidth: 2,
          strokeColor: '#090d16'
        },
        smooth: {
          type: 'continuous',
          roundness: 0.2
        },
        arrows: {
          to: { enabled: true, scaleFactor: 0.6 }
        }
      });

      index++;
    });

    this.nodesDataSet = new vis.DataSet(nodes);
    this.edgesDataSet = new vis.DataSet(edges);

    const graphOptions = {
      nodes: {
        scaling: { min: 16, max: 32 }
      },
      edges: {
        smooth: { type: 'dynamic' }
      },
      physics: {
        enabled: true,
        solver: 'forceAtlas2Based',
        forceAtlas2Based: {
          gravitationalConstant: -55,
          centralGravity: 0.015,
          springLength: 120,
          springConstant: 0.08,
          damping: 0.4
        },
        stabilization: {
          enabled: true,
          iterations: 150
        }
      },
      interaction: {
        hover: true,
        tooltipDelay: 100,
        navigationButtons: false,
        keyboard: true
      }
    };

    if (this.network) {
      this.network.destroy();
    }

    this.network = new vis.Network(this.container, {
      nodes: this.nodesDataSet,
      edges: this.edgesDataSet
    }, graphOptions);

    this.network.on('click', (params) => {
      if (params.nodes.length > 0) {
        const clickedNodeId = params.nodes[0];
        if (clickedNodeId === rootNodeId) {
          if (this.onNodeClickCallback) this.onNodeClickCallback(null);
          return;
        }

        const node = this.nodesDataSet.get(clickedNodeId);
        if (node && node.hostKey) {
          const hostData = this.hostsData.get(node.hostKey);
          if (this.onNodeClickCallback) {
            this.onNodeClickCallback(hostData);
          }
        }
      } else {
        if (this.onNodeClickCallback) this.onNodeClickCallback(null);
      }
    });
  }

  fitView() {
    if (this.network) {
      this.network.fit({ animation: { duration: 500, easingFunction: 'easeInOutQuad' } });
    }
  }

  togglePhysics(enabled) {
    if (this.network) {
      this.network.setOptions({ physics: { enabled } });
    }
  }
}

if (typeof window !== 'undefined') {
  window.TopologyMindmap = TopologyMindmap;
}
