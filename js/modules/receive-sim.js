/**
 * Thanos Receive Simulation Logic
 * Focus: Remote write ingestion, consistent hashing, replication, and node failures.
 */

document.addEventListener('DOMContentLoaded', () => {
    // --- Elements ---
    const hashringEl = document.getElementById('hashring');
    const simCanvas = document.getElementById('sim-canvas');
    const promClient = document.getElementById('prom-client');
    const logPanel = document.getElementById('log-panel');
    const btnSendWrite = document.getElementById('btn-send-write');
    const selectReplication = document.getElementById('flag-replication');
    const selectNodes = document.getElementById('flag-nodes');

    // --- State ---
    let nodes = [];
    const RADIUS = 115; // Ring radius (smaller for UI fit)
    let isAnimating = false;

    // --- Logger ---
    function logMessage(msg, level = 'info') {
        const line = document.createElement('div');
        line.textContent = `level=${level} msg="${msg}"`;
        if (level === 'error') line.style.color = 'var(--danger-color)';
        if (level === 'warn') line.style.color = 'var(--warning-color)';

        logPanel.appendChild(line);
        logPanel.scrollTop = logPanel.scrollHeight;
    }

    // --- Core Logic: Initialize Hashring ---
    function initHashring() {
        // Clear existing nodes
        hashringEl.innerHTML = '<div class="ring-label">Consistent Hashring</div>';
        nodes = [];

        const numNodes = parseInt(selectNodes.value, 10);

        for (let i = 0; i < numNodes; i++) {
            // Position nodes evenly around the circle
            // Subtract 90 deg so node 0 is at the top
            const angle = (i * (360 / numNodes)) - 90;
            const angleRad = angle * (Math.PI / 180);

            // Calculate coordinates relative to center (125, 125)
            // The container is 250x250, center is 125x125.
            // translate(-50%, -50%) on the element centers it on this exact coordinate.
            const x = 125 + RADIUS * Math.cos(angleRad);
            const y = 125 + RADIUS * Math.sin(angleRad);

            const nodeEl = document.createElement('div');
            nodeEl.className = 'receive-node';
            nodeEl.style.left = `${x}px`;
            nodeEl.style.top = `${y}px`;

            nodeEl.innerHTML = `
                Node-${i}
                <div class="tsdb-indicator"><div class="tsdb-fill" id="tsdb-fill-${i}"></div></div>
            `;

            // Add click handler to simulate node failure
            nodeEl.addEventListener('click', () => toggleNodeStatus(i));

            hashringEl.appendChild(nodeEl);

            nodes.push({
                id: i,
                el: nodeEl,
                fillEl: nodeEl.querySelector('.tsdb-fill'),
                isUp: true,
                angle: (i * (360 / numNodes)), // logical angle 0-360 starting from 0
                storage: 0
            });
        }
        logMessage(`Initialized hashring with ${numNodes} nodes`);
    }

    function toggleNodeStatus(nodeId) {
        const node = nodes[nodeId];
        node.isUp = !node.isUp;
        if (node.isUp) {
            node.el.classList.remove('down');
            logMessage(`Node-${nodeId} recovered`, 'info');
        } else {
            node.el.classList.add('down');
            logMessage(`Node-${nodeId} crashed (simulated)`, 'error');
        }
    }

    // --- Consistent Hashing Logic ---
    // Simulates finding the "next" available nodes on the ring based on a hash
    function getTargetNodes(seriesHash, repFactor) {
        const targets = [];
        // Determine starting position on ring based on hash (0-360)
        // We simulate a hash simply by picking a random angle
        const startAngle = seriesHash;

        // Find the first node clockwise from startAngle
        // Sort nodes by angle
        const sortedNodes = [...nodes].sort((a, b) => a.angle - b.angle);

        let startIndex = sortedNodes.findIndex(n => n.angle >= startAngle);
        if (startIndex === -1) startIndex = 0; // Wrap around

        let checked = 0;
        let currentIndex = startIndex;

        // Walk the ring to find 'repFactor' healthy nodes
        while (targets.length < repFactor && checked < sortedNodes.length) {
            const candidate = sortedNodes[currentIndex];
            if (candidate.isUp) {
                targets.push(candidate);
            }

            currentIndex = (currentIndex + 1) % sortedNodes.length;
            checked++;
        }

        return targets;
    }

    // --- Animation: Animate packet from client to node ---
    function animatePacket(startRect, endRect, delay = 0, color = 'var(--warning-color)') {
        return new Promise(resolve => {
            const packet = document.createElement('div');
            packet.className = 'packet';
            packet.style.background = color;
            packet.style.boxShadow = `0 0 8px ${color}`;

            // Canvas boundaries to calculate relative positions
            const canvasRect = simCanvas.getBoundingClientRect();

            // Start at center of client
            const startX = startRect.left + (startRect.width / 2) - canvasRect.left;
            const startY = startRect.top + (startRect.height / 2) - canvasRect.top;

            // End at center of node
            const endX = endRect.left + (endRect.width / 2) - canvasRect.left;
            const endY = endRect.top + (endRect.height / 2) - canvasRect.top;

            packet.style.left = `${startX}px`;
            packet.style.top = `${startY}px`;
            packet.style.transition = `all 0.6s cubic-bezier(0.25, 0.8, 0.25, 1) ${delay}ms`;

            simCanvas.appendChild(packet);

            // Trigger animation next frame
            requestAnimationFrame(() => {
                packet.style.left = `${endX}px`;
                packet.style.top = `${endY}px`;

                setTimeout(() => {
                    packet.remove();
                    resolve();
                }, 600 + delay);
            });
        });
    }

    // --- Actions ---
    async function handleRemoteWrite() {
        if (isAnimating) return;
        isAnimating = true;
        btnSendWrite.disabled = true;

        const repFactor = parseInt(selectReplication.value, 10);
        const upNodes = nodes.filter(n => n.isUp).length;

        logMessage(`Incoming Remote Write request...`);

        if (upNodes < repFactor) {
            logMessage(`Request failed: Need ${repFactor} up nodes, but only ${upNodes} available.`, 'error');
            isAnimating = false;
            btnSendWrite.disabled = false;
            return;
        }

        // Simulate 3 different series in a batch
        const batchSize = 3;
        const colors = ['#f39c12', '#9b59b6', '#3498db']; // Different color for each series
        const animations = [];

        for (let i = 0; i < batchSize; i++) {
            // "Hash" the series to get an angle on the ring
            const seriesHash = Math.random() * 360;
            const targets = getTargetNodes(seriesHash, repFactor);
            const color = colors[i % colors.length];

            const targetIds = targets.map(t => t.id).join(',');
            logMessage(`Series hash mapped to angle ${Math.round(seriesHash)}°. Routing to nodes: [${targetIds}]`);

            targets.forEach(target => {
                const promRect = promClient.getBoundingClientRect();
                const targetRect = target.el.getBoundingClientRect();

                // Add staggered delay for visual effect
                const delay = i * 200;

                animations.push(
                    animatePacket(promRect, targetRect, delay, color).then(() => {
                        // Increase TSDB storage visually
                        target.storage = Math.min(100, target.storage + 5);
                        target.fillEl.style.width = `${target.storage}%`;

                        // Flash effect on the node
                        target.el.style.backgroundColor = '#333';
                        setTimeout(() => { target.el.style.backgroundColor = ''; }, 200);
                    })
                );
            });
        }

        await Promise.all(animations);

        logMessage(`Batch write successful (Replication: ${repFactor})`, 'info');

        isAnimating = false;
        btnSendWrite.disabled = false;

        // Notify gamification system
        if (window.ThanosApp && window.ThanosApp.trackProgress) {
            window.ThanosApp.trackProgress('receive_write_simulated');
        }
    }

    // --- Event Listeners ---
    btnSendWrite.addEventListener('click', handleRemoteWrite);

    selectNodes.addEventListener('change', () => {
        logMessage(`Topology change requested. Re-calculating hashring...`, 'warn');
        initHashring();
    });

    selectReplication.addEventListener('change', (e) => {
        logMessage(`Replication factor updated to ${e.target.value}`);
    });

    // Mark complete logic
    const markCompleteBtn = document.getElementById('mark-complete-btn');
    if (markCompleteBtn) {
        markCompleteBtn.addEventListener('click', () => {
            if (window.ThanosApp && window.ThanosApp.markLabComplete) {
                window.ThanosApp.markLabComplete('receive');
            } else {
                alert("Lab completed! (Gamification system not found)");
            }
        });
    }

    // --- Initialization ---
    initHashring();
});
