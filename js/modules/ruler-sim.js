class RulerSimulation {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.isStateless = false;
        this.isHA = false;
        this.lagMode = false;

        this.initSVG();
        this.setupBindings();
        this.logger = document.getElementById('log-panel');
    }

    log(msg, type = 'info') {
        const div = document.createElement('div');
        const color = type === 'error' ? 'var(--danger-color)' :
                      type === 'warn' ? 'var(--warning-color)' :
                      type === 'success' ? 'var(--success-color)' : 'var(--text-main)';
        div.style.color = color;
        div.textContent = `[${new Date().toISOString().split('T')[1].slice(0,8)}] ${msg}`;
        this.logger.appendChild(div);
        this.logger.scrollTop = this.logger.scrollHeight;
    }

    initSVG() {
        this.container.innerHTML = `
            <svg width="100%" height="100%" viewBox="0 0 800 400" preserveAspectRatio="xMidYMid meet">
                <!-- Definitions -->
                <defs>
                    <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                        <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--text-muted)" />
                    </marker>
                    <marker id="arrow-active" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                        <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--primary-color)" />
                    </marker>
                    <marker id="arrow-warn" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                        <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--warning-color)" />
                    </marker>
                </defs>

                <!-- Components -->
                <g id="ruler-group">
                    <rect x="300" y="150" width="200" height="60" rx="4" fill="var(--panel-bg)" stroke="var(--primary-color)" stroke-width="2"/>
                    <text x="400" y="185" fill="white" font-size="14" font-weight="bold" text-anchor="middle">Thanos Ruler</text>

                    <!-- HA Replica (Hidden by default) -->
                    <g id="ruler-ha" opacity="0">
                        <rect x="300" y="230" width="200" height="60" rx="4" fill="var(--panel-bg)" stroke="var(--primary-color)" stroke-width="2" stroke-dasharray="4,4"/>
                        <text x="400" y="265" fill="white" font-size="14" font-weight="bold" text-anchor="middle">Thanos Ruler (Replica)</text>
                    </g>
                </g>

                <g id="querier-group">
                    <rect x="50" y="150" width="150" height="60" rx="4" fill="var(--bg-secondary)" stroke="var(--border-color)"/>
                    <text x="125" y="185" fill="var(--text-main)" font-size="14" text-anchor="middle">Thanos Querier</text>
                </g>

                <g id="alertmanager-group">
                    <rect x="600" y="50" width="150" height="60" rx="4" fill="var(--bg-secondary)" stroke="var(--border-color)"/>
                    <text x="675" y="85" fill="var(--text-main)" font-size="14" text-anchor="middle">Alertmanager</text>
                </g>

                <g id="storage-group">
                    <!-- Stateful (Default) -->
                    <g id="local-tsdb">
                        <rect x="600" y="150" width="150" height="60" rx="4" fill="var(--bg-secondary)" stroke="var(--border-color)"/>
                        <text x="675" y="185" fill="var(--text-main)" font-size="14" text-anchor="middle">Local TSDB</text>
                    </g>
                    <!-- Stateless (Remote Write) -->
                    <g id="remote-write" opacity="0">
                        <rect x="600" y="250" width="150" height="60" rx="4" fill="var(--bg-secondary)" stroke="var(--border-color)" stroke-dasharray="2,2"/>
                        <text x="675" y="285" fill="var(--text-main)" font-size="14" text-anchor="middle">Remote Write (Receive)</text>
                    </g>
                </g>

                <!-- Connection Lines -->
                <path id="path-query" d="M 300 180 L 200 180" stroke="var(--text-muted)" stroke-width="2" fill="none" marker-start="url(#arrow)"/>
                <path id="path-ha-query" d="M 300 260 L 125 260 L 125 210" stroke="var(--text-muted)" stroke-width="2" fill="none" opacity="0" marker-start="url(#arrow)"/>

                <path id="path-alert" d="M 400 150 L 400 80 L 600 80" stroke="var(--text-muted)" stroke-width="2" fill="none" marker-end="url(#arrow)"/>
                <path id="path-ha-alert" d="M 500 260 L 550 260 L 550 80 L 600 80" stroke="var(--text-muted)" stroke-width="2" fill="none" opacity="0" marker-end="url(#arrow)"/>

                <path id="path-store" d="M 500 180 L 600 180" stroke="var(--text-muted)" stroke-width="2" fill="none" marker-end="url(#arrow)"/>
                <path id="path-rw" d="M 500 190 L 550 190 L 550 280 L 600 280" stroke="var(--text-muted)" stroke-width="2" fill="none" opacity="0" marker-end="url(#arrow)"/>
                <path id="path-ha-rw" d="M 500 260 L 550 260 L 550 280 L 600 280" stroke="var(--text-muted)" stroke-width="2" fill="none" opacity="0" marker-end="url(#arrow)"/>

                <!-- Animation Elements -->
                <circle id="anim-dot-query" cx="0" cy="0" r="5" fill="var(--primary-color)" opacity="0"/>
                <circle id="anim-dot-ha-query" cx="0" cy="0" r="5" fill="var(--primary-color)" opacity="0"/>

                <circle id="anim-dot-alert" cx="0" cy="0" r="5" fill="var(--danger-color)" opacity="0"/>
                <circle id="anim-dot-ha-alert" cx="0" cy="0" r="5" fill="var(--danger-color)" opacity="0"/>

                <circle id="anim-dot-store" cx="0" cy="0" r="5" fill="var(--success-color)" opacity="0"/>
                <circle id="anim-dot-rw" cx="0" cy="0" r="5" fill="var(--success-color)" opacity="0"/>
                <circle id="anim-dot-ha-rw" cx="0" cy="0" r="5" fill="var(--success-color)" opacity="0"/>

            </svg>
        `;

        this.svgPaths = {
            query: document.getElementById('path-query'),
            haQuery: document.getElementById('path-ha-query'),
            alert: document.getElementById('path-alert'),
            haAlert: document.getElementById('path-ha-alert'),
            store: document.getElementById('path-store'),
            rw: document.getElementById('path-rw'),
            haRw: document.getElementById('path-ha-rw')
        };

        this.svgDots = {
            query: document.getElementById('anim-dot-query'),
            haQuery: document.getElementById('anim-dot-ha-query'),
            alert: document.getElementById('anim-dot-alert'),
            haAlert: document.getElementById('anim-dot-ha-alert'),
            store: document.getElementById('anim-dot-store'),
            rw: document.getElementById('anim-dot-rw'),
            haRw: document.getElementById('anim-dot-ha-rw')
        };
    }

    setupBindings() {
        document.getElementById('flag-stateless').addEventListener('change', (e) => {
            this.isStateless = e.target.checked;
            this.updateStorageVisuals();
            this.log(`Toggled Stateless Mode: ${this.isStateless ? 'Remote Write enabled. Local TSDB disabled.' : 'Local TSDB enabled.'}`);
        });

        document.getElementById('flag-ha').addEventListener('change', (e) => {
            this.isHA = e.target.checked;
            document.getElementById('ruler-ha').style.opacity = this.isHA ? '1' : '0';
            this.svgPaths.haQuery.style.opacity = this.isHA ? '1' : '0';
            this.svgPaths.haAlert.style.opacity = this.isHA ? '1' : '0';

            if (this.isStateless && this.isHA) {
                this.svgPaths.haRw.style.opacity = '1';
            } else {
                this.svgPaths.haRw.style.opacity = '0';
            }

            this.log(`Toggled HA Mode: ${this.isHA ? '2 replicas active' : '1 replica active'}`);
        });

        document.getElementById('btn-eval-record').addEventListener('click', () => {
            this.runEvaluation('recording');
        });

        document.getElementById('btn-eval-alert').addEventListener('click', () => {
            this.runEvaluation('alerting');
        });

        document.getElementById('btn-simulate-querier-lag').addEventListener('click', () => {
            this.lagMode = !this.lagMode;
            const btn = document.getElementById('btn-simulate-querier-lag');
            btn.textContent = this.lagMode ? 'Disable Querier Lag' : 'Simulate Querier Lag';
            btn.classList.toggle('danger-btn');
            btn.classList.toggle('warning-btn');
            this.log(this.lagMode ? 'Querier lag simulated. Evaluations will exceed interval time.' : 'Querier lag removed.');
        });

        document.getElementById('btn-reset').addEventListener('click', () => {
            this.logger.innerHTML = '<div style="color: var(--text-muted)">System initialized. Waiting for rule evaluations...</div>';
            this.log('Visuals and logs reset.');
        });
    }

    updateStorageVisuals() {
        const tsdb = document.getElementById('local-tsdb');
        const rw = document.getElementById('remote-write');

        if (this.isStateless) {
            tsdb.style.opacity = '0.3';
            this.svgPaths.store.style.opacity = '0';
            rw.style.opacity = '1';
            this.svgPaths.rw.style.opacity = '1';
            if (this.isHA) this.svgPaths.haRw.style.opacity = '1';
        } else {
            tsdb.style.opacity = '1';
            this.svgPaths.store.style.opacity = '1';
            rw.style.opacity = '0';
            this.svgPaths.rw.style.opacity = '0';
            this.svgPaths.haRw.style.opacity = '0';
        }
    }

    animatePath(dotElement, pathElement, duration, callback) {
        dotElement.style.opacity = '1';
        const length = pathElement.getTotalLength();
        let startTime = null;

        const animate = (time) => {
            if (!startTime) startTime = time;
            const progress = (time - startTime) / duration;

            if (progress < 1) {
                // Reverse direction for query requests
                const p = (pathElement.id === 'path-query' || pathElement.id === 'path-ha-query')
                    ? length * (1 - progress)
                    : length * progress;
                const point = pathElement.getPointAtLength(p);
                dotElement.setAttribute('cx', point.x);
                dotElement.setAttribute('cy', point.y);
                requestAnimationFrame(animate);
            } else {
                dotElement.style.opacity = '0';
                if (callback) callback();
            }
        };
        requestAnimationFrame(animate);
    }

    runEvaluation(type) {
        document.querySelectorAll('.btn').forEach(b => b.disabled = true);
        this.log(`Initiating ${type} rule evaluation...`);

        const queryDuration = this.lagMode ? 3000 : 800;

        // Animate Query out
        this.svgPaths.query.style.stroke = 'var(--primary-color)';
        if (this.isHA) this.svgPaths.haQuery.style.stroke = 'var(--primary-color)';

        this.animatePath(this.svgDots.query, this.svgPaths.query, queryDuration);
        if (this.isHA) this.animatePath(this.svgDots.haQuery, this.svgPaths.haQuery, queryDuration);

        setTimeout(() => {
            this.svgPaths.query.style.stroke = 'var(--text-muted)';
            if (this.isHA) this.svgPaths.haQuery.style.stroke = 'var(--text-muted)';

            if (this.lagMode) {
                this.log('WARNING: Evaluation time exceeded rule interval (prometheus_rule_group_last_duration_seconds > prometheus_rule_group_interval_seconds)', 'warn');
            }

            // Animate results
            this.log(`Evaluated ${type} rule successfully. Processing results...`);

            if (type === 'recording') {
                this.processStorage();
            } else if (type === 'alerting') {
                this.processAlerts();
            }
        }, queryDuration + 100);
    }

    processStorage() {
        if (this.isStateless) {
            this.svgPaths.rw.style.stroke = 'var(--success-color)';
            this.animatePath(this.svgDots.rw, this.svgPaths.rw, 800);
            this.log('Stateless mode: Streaming result series via Remote Write to Receive.');

            if (this.isHA) {
                this.svgPaths.haRw.style.stroke = 'var(--success-color)';
                this.animatePath(this.svgDots.haRw, this.svgPaths.haRw, 800);
                this.log('Stateless mode (Replica): Streaming result series via Remote Write.');
            }
        } else {
            this.svgPaths.store.style.stroke = 'var(--success-color)';
            this.animatePath(this.svgDots.store, this.svgPaths.store, 800);
            this.log('Stateful mode: Writing result series to Local TSDB block.');
        }

        setTimeout(() => {
            this.svgPaths.store.style.stroke = 'var(--text-muted)';
            this.svgPaths.rw.style.stroke = 'var(--text-muted)';
            this.svgPaths.haRw.style.stroke = 'var(--text-muted)';
            document.querySelectorAll('.btn').forEach(b => b.disabled = false);
        }, 1000);
    }

    processAlerts() {
        this.svgPaths.alert.style.stroke = 'var(--danger-color)';
        this.animatePath(this.svgDots.alert, this.svgPaths.alert, 800);
        this.log('Alert fired! Sending alert to Alertmanager.', 'error');

        if (this.isHA) {
            this.svgPaths.haAlert.style.stroke = 'var(--danger-color)';
            this.animatePath(this.svgDots.haAlert, this.svgPaths.haAlert, 800);
            this.log('Alert fired (Replica)! Sending alert to Alertmanager. (Alertmanager will deduplicate based on replica label)', 'error');
        }

        setTimeout(() => {
            this.svgPaths.alert.style.stroke = 'var(--text-muted)';
            this.svgPaths.haAlert.style.stroke = 'var(--text-muted)';
            document.querySelectorAll('.btn').forEach(b => b.disabled = false);
        }, 1000);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new RulerSimulation('sim-canvas');

    // Wire up completion button
    const markCompleteBtn = document.getElementById('markCompleteBtn');
    if (markCompleteBtn && window.ThanosApp) {
        if (window.ThanosApp.isLabCompleted('ruler')) {
            markCompleteBtn.textContent = '✓ Lab Completed';
            markCompleteBtn.classList.add('completed');
            markCompleteBtn.disabled = true;
        }

        markCompleteBtn.addEventListener('click', () => {
            window.ThanosApp.markLabComplete('ruler');
            markCompleteBtn.textContent = '✓ Lab Completed';
            markCompleteBtn.classList.add('completed');
            markCompleteBtn.disabled = true;
        });
    }
});
