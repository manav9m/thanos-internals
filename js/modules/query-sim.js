export class QuerySimulation {
    constructor(containerId, logPanelId) {
        this.container = document.getElementById(containerId);
        this.logPanel = document.getElementById(logPanelId);

        // State
        this.isNodeDown = false;
        this.dedupEnabled = document.getElementById('flag-dedup')?.checked ?? true;
        this.partialResponse = document.getElementById('flag-partial-response')?.checked ?? false;
        this.downsampling = '0s';

        this.initSVG();
        this.bindEvents();
        this.log('info', 'Thanos Querier simulation initialized.');
    }

    initSVG() {
        this.container.innerHTML = `
            <svg width="100%" height="400" viewBox="0 0 800 400" xmlns="http://www.w3.org/2000/svg">
                <defs>
                    <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                        <path d="M 0 0 L 10 5 L 0 10 z" fill="#8892b0" />
                    </marker>
                    <marker id="arrow-green" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                        <path d="M 0 0 L 10 5 L 0 10 z" fill="#4ade80" />
                    </marker>
                    <marker id="arrow-red" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                        <path d="M 0 0 L 10 5 L 0 10 z" fill="#f87171" />
                    </marker>
                </defs>

                <!-- Client / Grafana -->
                <rect x="50" y="160" width="120" height="60" rx="4" fill="#3b82f6" />
                <text x="110" y="195" fill="white" font-size="14" text-anchor="middle" font-weight="bold">Client (Grafana)</text>

                <!-- Thanos Querier -->
                <rect x="250" y="140" width="160" height="100" rx="4" fill="#8b5cf6" />
                <text x="330" y="175" fill="white" font-size="16" text-anchor="middle" font-weight="bold">Thanos Querier</text>
                <text x="330" y="195" fill="#e2e8f0" font-size="12" text-anchor="middle">PromQL Engine</text>
                <text x="330" y="215" fill="#e2e8f0" font-size="12" text-anchor="middle" id="dedup-label">Dedup: ON</text>

                <!-- Target Nodes Container -->
                <rect x="550" y="40" width="220" height="320" rx="8" fill="none" stroke="#475569" stroke-width="2" stroke-dasharray="5,5"/>
                <text x="660" y="30" fill="#94a3b8" font-size="12" text-anchor="middle">StoreAPI Endpoints</text>

                <!-- Prometheus HA 1 -->
                <rect x="580" y="60" width="160" height="60" rx="4" fill="#0f172a" stroke="#3b82f6" stroke-width="2" id="node-prom-1"/>
                <text x="660" y="95" fill="white" font-size="14" text-anchor="middle">Prometheus (Replica A)</text>

                <!-- Prometheus HA 2 -->
                <rect x="580" y="140" width="160" height="60" rx="4" fill="#0f172a" stroke="#3b82f6" stroke-width="2" id="node-prom-2"/>
                <text x="660" y="175" fill="white" font-size="14" text-anchor="middle">Prometheus (Replica B)</text>

                <!-- Store Gateway -->
                <rect x="580" y="220" width="160" height="60" rx="4" fill="#0f172a" stroke="#eab308" stroke-width="2" id="node-store"/>
                <text x="660" y="255" fill="white" font-size="14" text-anchor="middle">Store Gateway</text>

                <!-- Connection Lines -->
                <line x1="170" y1="190" x2="240" y2="190" stroke="#8892b0" stroke-width="2" marker-end="url(#arrow)" id="line-client"/>

                <path d="M 410 170 L 490 170 L 490 90 L 570 90" fill="none" stroke="#8892b0" stroke-width="2" marker-end="url(#arrow)" id="line-prom-1"/>
                <line x1="410" y1="190" x2="570" y2="190" stroke="#8892b0" stroke-width="2" marker-end="url(#arrow)" id="line-prom-2"/>
                <path d="M 410 210 L 490 210 L 490 250 L 570 250" fill="none" stroke="#8892b0" stroke-width="2" marker-end="url(#arrow)" id="line-store"/>

                <!-- Packets Container -->
                <g id="packet-container"></g>
            </svg>
        `;
    }

    bindEvents() {
        document.getElementById('btn-query-normal').addEventListener('click', () => this.runQuery('global'));
        document.getElementById('btn-query-ha').addEventListener('click', () => this.runQuery('ha'));
        document.getElementById('btn-toggle-node').addEventListener('click', () => this.toggleNode());
        document.getElementById('btn-reset').addEventListener('click', () => this.resetSim());

        document.getElementById('flag-dedup')?.addEventListener('change', (e) => {
            this.dedupEnabled = e.target.checked;
            document.getElementById('dedup-label').textContent = `Dedup: ${this.dedupEnabled ? 'ON' : 'OFF'}`;
            this.log('warn', `Configuration changed: --query.replica-label ${this.dedupEnabled ? 'set' : 'removed'}.`);
        });

        document.getElementById('flag-partial-response')?.addEventListener('change', (e) => {
            this.partialResponse = e.target.checked;
            this.log('warn', `Configuration changed: --query.partial-response=${this.partialResponse} (Strategy: ${this.partialResponse ? 'WARN' : 'ABORT'}).`);
        });

        document.getElementById('flag-downsampling')?.addEventListener('change', (e) => {
            this.downsampling = e.target.value;
            this.log('warn', `Query Parameter changed: max_source_resolution=${this.downsampling}.`);
        });
    }

    log(level, msg) {
        const p = document.createElement('p');
        p.className = `log-${level}`;
        const timestamp = new Date().toISOString().split('T')[1].slice(0, -1);
        p.textContent = `[${timestamp}] level=${level} msg="${msg}"`;
        this.logPanel.appendChild(p);
        this.logPanel.scrollTop = this.logPanel.scrollHeight;
    }

    toggleNode() {
        this.isNodeDown = !this.isNodeDown;
        const node = document.getElementById('node-store');
        if (this.isNodeDown) {
            node.setAttribute('fill', '#450a0a');
            node.setAttribute('stroke', '#ef4444');
            this.log('error', 'Simulated failure: Store Gateway node is down/unreachable.');
        } else {
            node.setAttribute('fill', '#0f172a');
            node.setAttribute('stroke', '#eab308');
            this.log('info', 'Simulated recovery: Store Gateway node is back online.');
        }
    }

    resetSim() {
        document.getElementById('packet-container').innerHTML = '';
        this.logPanel.innerHTML = '';
        this.log('info', 'Simulation reset.');

        ['line-prom-1', 'line-prom-2', 'line-store'].forEach(id => {
            const el = document.getElementById(id);
            el.setAttribute('stroke', '#8892b0');
            el.setAttribute('marker-end', 'url(#arrow)');
        });
    }

    createPacket(startX, startY, color, label) {
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', startX);
        circle.setAttribute('cy', startY);
        circle.setAttribute('r', '8');
        circle.setAttribute('fill', color);

        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', startX);
        text.setAttribute('y', startY - 12);
        text.setAttribute('fill', '#e2e8f0');
        text.setAttribute('font-size', '10');
        text.setAttribute('text-anchor', 'middle');
        text.textContent = label;

        g.appendChild(circle);
        g.appendChild(text);
        document.getElementById('packet-container').appendChild(g);
        return g;
    }

    animatePacket(packet, pathStr, duration, onComplete) {
        // Very basic path animation using pure JS
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', pathStr);
        const length = path.getTotalLength();

        let start = null;
        const step = (timestamp) => {
            if (!start) start = timestamp;
            const progress = (timestamp - start) / duration;
            if (progress < 1) {
                const point = path.getPointAtLength(progress * length);
                packet.setAttribute('transform', `translate(${point.x - packet.firstChild.getAttribute('cx')}, ${point.y - packet.firstChild.getAttribute('cy')})`);
                requestAnimationFrame(step);
            } else {
                if (onComplete) onComplete();
                packet.remove();
            }
        };
        requestAnimationFrame(step);
    }

    runQuery(type) {
        this.resetSim();
        this.log('info', `Received PromQL query from Client.`);

        // Client to Querier
        const reqPacket = this.createPacket(170, 190, '#3b82f6', 'PromQL');
        this.animatePacket(reqPacket, 'M 170 190 L 250 190', 500, () => {
            this.log('info', `Querier analyzing query... Scatter phase initiated.`);

            // Scatter to Nodes
            let activeNodes = ['prom-1', 'prom-2', 'store'];
            if (type === 'ha') {
                activeNodes = ['prom-1', 'prom-2']; // Only HA cluster for this scenario
            }

            let responsesReceived = 0;
            let successResponses = 0;
            const targetCount = activeNodes.length;

            activeNodes.forEach(node => {
                let startY, endY, pathStr;
                if (node === 'prom-1') { startY = 170; endY = 90; pathStr = `M 410 170 L 490 170 L 490 90 L 580 90`; }
                if (node === 'prom-2') { startY = 190; endY = 190; pathStr = `M 410 190 L 580 190`; }
                if (node === 'store') { startY = 210; endY = 250; pathStr = `M 410 210 L 490 210 L 490 250 L 580 250`; }

                const pReq = this.createPacket(410, startY, '#8b5cf6', 'gRPC');

                this.animatePacket(pReq, pathStr, 800, () => {
                    // Handle Response
                    let respColor = '#4ade80';
                    let respStatus = 'Success';
                    let isFail = false;

                    if (node === 'store' && this.isNodeDown) {
                        respColor = '#ef4444';
                        respStatus = 'Error/Timeout';
                        isFail = true;
                        document.getElementById(`line-${node}`).setAttribute('stroke', '#ef4444');
                        document.getElementById(`line-${node}`).setAttribute('marker-end', 'url(#arrow-red)');
                    } else {
                        document.getElementById(`line-${node}`).setAttribute('stroke', '#4ade80');
                        document.getElementById(`line-${node}`).setAttribute('marker-end', 'url(#arrow-green)');
                    }

                    if (!isFail) successResponses++;

                    // Return path (reverse)
                    const retPathStr = pathStr.split(' L ').reverse().join(' L ');

                    const pResp = this.createPacket(580, endY, respColor, respStatus);
                    this.animatePacket(pResp, retPathStr, 800, () => {
                        responsesReceived++;
                        if (isFail) {
                            this.log('error', `Gather: Store Gateway returned an error.`);
                        } else {
                            let msg = `Gather: Received data from ${node}.`;
                            if (node === 'store' && this.downsampling !== '0s') {
                                msg += ` (Resolution: ${this.downsampling})`;
                            }
                            this.log('info', msg);
                        }

                        if (responsesReceived === targetCount) {
                            this.processResults(successResponses, targetCount, type);
                        }
                    });
                });
            });
        });
    }

    processResults(successResponses, targetCount, type) {
        if (successResponses < targetCount) {
            if (this.partialResponse) {
                this.log('warn', `Partial Response: Some stores failed, but returning available data anyway (Strategy: WARN).`);
            } else {
                this.log('error', `Query Aborted: A store failed and partial response is disabled (Strategy: ABORT).`);

                // Return Error to client
                const pErr = this.createPacket(250, 190, '#ef4444', 'Error 500');
                this.animatePacket(pErr, 'M 250 190 L 170 190', 500, () => {
                    this.log('error', `Client received HTTP 500 Internal Server Error.`);
                });
                return;
            }
        }

        // Deduplication Phase
        if (type === 'ha') {
            if (this.dedupEnabled) {
                this.log('info', `Deduplication: Merged overlapping series from Replica A and Replica B.`);
            } else {
                this.log('warn', `Deduplication OFF: Returning duplicate series from both replicas to client.`);
            }
        }

        // Return Success to Client
        this.log('info', `Evaluation complete. Sending HTTP 200 to client.`);
        const pFinal = this.createPacket(250, 190, '#4ade80', 'HTTP 200 OK');
        this.animatePacket(pFinal, 'M 250 190 L 170 190', 600, () => {
            this.log('info', `Client successfully received query results.`);
        });
    }
}

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('sim-canvas')) {
        window.querySim = new QuerySimulation('sim-canvas', 'log-panel');
    }

    // Gamification Integration
    const markCompleteBtn = document.getElementById('markCompleteBtn');
    if (markCompleteBtn && window.ThanosApp) {
        // Check initial state
        if (window.ThanosApp.state.isCompleted('query')) {
            markCompleteBtn.textContent = '✓ Lab Completed';
            markCompleteBtn.classList.add('completed');
            markCompleteBtn.disabled = true;
        }

        markCompleteBtn.addEventListener('click', () => {
            window.ThanosApp.markLabComplete('query');
            markCompleteBtn.textContent = '✓ Lab Completed';
            markCompleteBtn.classList.add('completed');
            markCompleteBtn.disabled = true;
        });
    }
});