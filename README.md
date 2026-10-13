# AeroScope — Postman API Client & Distributed Topology Tracker

An Electron-powered distributed system tracker and API workbench that merges **request execution** with **Color-coded multi-domain resource inspection**, an **interactive collaborating party topology mindmap**, and an **embedded application source code page featuring origin-framed traffic inspection**.

---

## Key Features

### 1. Clean Startup & Manual Request Execution
- **Zero Default or Hardcoded Test Data**: Starts completely blank by default with clean empty states.
- The user enters target endpoints and executes requests manually.
- **HTTP Methods Supported**: `GET`, `POST`, `PUT`, `DELETE`, `PATCH`, `HEAD`, `OPTIONS`.
- **Request Configuration**:
  - **Query Parameters**: Dynamic key-value editor with enable/disable toggles.
  - **Headers**: Key-value editor with common presets (`application/json`, auth headers, etc.).
  - **Body Serialization**: Raw JSON, Form-data, text, with automatic JSON format & syntax validation.
  - **Authorization**: No Auth, Bearer Token, Basic Auth.
- **Deep Response Inspector**:
  - Status badges (`200 OK`, `201 Created`, `404 Not Found`, etc.).
  - Socket timing breakdown: DNS lookup, TCP connect, TTFB, and total latency (ms).
  - Remote Server IP resolution badge (e.g., `104.21.72.102` or `172.67.167.151`).
  - Response tabs: **Pretty JSON** with syntax coloring, **Raw**, **Headers Table**, and **HTML Preview**.

---

### 2. Multi-Domain Color Engine
Applies strict, visually distinguishable Wireshark color classification rules based on resource origins:

| Domain Role | Wireshark Color | Hex Code | Description |
| :--- | :--- | :--- | :--- |
| **Main Domain** | **Dark Royal Blue** | `#1d4ed8` | Root application domain serving core documents. |
| **Subdomains** | **Sky Blue** | `#0284c7` | Subdomains of the same main domain (`app.*`, `vault.*`, `auth.*`). |
| **API / Microservices** | **Emerald Green** | `#059669` | REST, GraphQL, RPC endpoints (`api.*`, `backend.*`, `v1/`). |
| **CDN / Static Assets** | **Violet / Purple** | `#7c3aed` | Asset distribution networks (`cdn.*`, Cloudflare, CloudFront, Google Fonts). |
| **Telemetry / Analytics** | **Amber / Gold** | `#d97706` | Telemetry pipelines, logging, exceptions (`telemetry.*`, Google Analytics, Sentry). |
| **3rd-Party Partners** | **Rose / Magenta** | `#e11d48` | Independent collaborating partners (`api.stripe.com`, `plaid.com`, etc.). |

- **Wireshark Waterfall Stream Table**:
  - Live filtering by category chips (toggle on/off any domain class).
  - Search filter across method, host, path, status, and IP address.
  - Color-coded packet rows with status pills, method badges, and IP tags.
  - **Packet Inspector Drawer**: Slide-out drawer displaying headers, timing, protocol, and cross-navigation shortcuts.

---

### 3. Distributed Topology Mindmap (Collaborating Parties & IPs)
- Powered by interactive **Vis-Network** physics simulation.
- Visualizes the entire mesh of collaborating services with:
  - **Central Node**: Root target application.
  - **Party Nodes**: Styled with Wireshark colors, displaying **Domain Hostname**, **Resolved Server IP address** (e.g. `[104.21.72.105]`), request counts, and payload size.
  - **Edges**: Labeled with relationship types (`REST / Microservice`, `Static CDN Distribution`, `Subdomain Mesh`, `3rd-Party Integration`).
- **Interactive Sync**:
  - Clicking any node filters the Wireshark table to that host and updates the inspector sidebar with infrastructure details (Cloudflare, AWS CloudFront, Google Cloud, Kubernetes).

---

### 4. Application Source Code & Origin Traffic Frames
- Displays the **actual source code page** of the target application with line numbers (`0001`, `0002`...).
- **Color-Framed Origin Traffic**:
  - Each tag, line, or block of code that generates network traffic is highlighted and framed with the color of the destination origin it will generate traffic to:
    - Main domain tags & lines framed in **Dark Royal Blue**.
    - Subdomain scripts and styles framed in **Sky Blue**.
    - API endpoint calls & actions framed in **Emerald Green**.
    - CDN assets and fonts framed in **Violet / Purple**.
    - Analytics and tracking tags framed in **Amber / Gold**.
    - 3rd-party integration scripts framed in **Rose / Magenta**.
  - Displays inline origin badges: `[ROLE | HOST | IP]`.
- **Traffic Origin Filter & Search Bar**:
  - Filter source code lines to show only API calls, only CDN assets, only Subdomains, or all code lines.
  - Search within source code by text, URL, host, or IP.
- **Endpoint Inspector Modal**:
  - Clicking any framed line opens a modal with the target URL, destination host, resolved IP address, generated traffic type, and the exact code line.

---

### 5. DNS & IP Resolution Matrix
- Direct directory of every participating domain, resolved IPv4/IPv6 address, autonomous system/cloud provider, total packets, and transferred byte volume.

---

## Running the Application

```bash
# Launch Electron application
npm start
```
