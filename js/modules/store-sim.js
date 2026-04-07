/**
 * Thanos Store Gateway Simulation
 * Simulates index header lookups, caching layers (Index/Chunk), and byte-range requests.
 */

document.addEventListener('DOMContentLoaded', () => {
    // UI Elements
    const logPanel = document.getElementById('log-panel');
    const bucketContainer = document.getElementById('bucket-blocks');
    const btnClearCache = document.getElementById('btn-clear-cache');
    const blockButtonsContainer = document.getElementById('block-buttons');
    const btnMarkComplete = document.getElementById('mark-complete-btn');

    // Config Flags
    const flagIndexCache = document.getElementById('flag-index-cache');
    const flagChunkCache = document.getElementById('flag-chunk-cache');
    const flagTimePartition = document.getElementById('flag-time-partition');

    // Architecture Nodes & Flows
    const arrowGrpc = document.getElementById('arrow-grpc');
    const arrowHttp = document.getElementById('arrow-http');
    const nodeStore = document.getElementById('arch-store');
    const nodeObj = document.getElementById('arch-obj');

    // Internal Nodes
    const simIndexHeader = document.getElementById('sim-index-header');
    const simIndexCache = document.getElementById('sim-index-cache');
    const simChunkCache = document.getElementById('sim-chunk-cache');
    const packet = document.getElementById('packet');
    const simCanvas = document.getElementById('sim-canvas');

    // Gamification Hook
    const labId = 'store';
    if (window.ThanosApp && window.ThanosApp.state.isCompleted(labId)) {
        btnMarkComplete.textContent = "✓ Completed";
        btnMarkComplete.disabled = true;
        btnMarkComplete.classList.remove('primary-btn');
    }

    btnMarkComplete.addEventListener('click', () => {
        if (window.ThanosApp) {
            window.ThanosApp.markLabComplete(labId);
            btnMarkComplete.textContent = "✓ Completed";
            btnMarkComplete.disabled = true;
            btnMarkComplete.classList.remove('primary-btn');
        }
    });

    // Logging helper
    function log(msg, type="info") {
        const div = document.createElement('div');
        div.style.color = type === "error" ? "#f85149" : (type === "warn" ? "#d29922" : "#0f0");
        const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
        div.textContent = `[${timestamp}] level=${type} msg="${msg}"`;
        logPanel.appendChild(div);
        logPanel.scrollTop = logPanel.scrollHeight;
    }

    // State
    let isSimulating = false;

    // Define Blocks in Object Storage
    const blocks = [
        { id: 'b1', name: 'Recent Block A', age: '1d ago', timeOffset: 1, element: null },
        { id: 'b2', name: 'Historical Block B', age: '3w ago', timeOffset: 21, element: null },
    ];

    // Caches state
    const cacheState = {
        index: new Set(),
        chunk: new Set()
    };

    // Initialize UI
    function init() {
        log("Starting Thanos Store Gateway...", "info");
        log("Scanning Object Storage bucket for TSDB blocks...", "info");

        blocks.forEach(block => {
            // Create Block element in bucket
            const el = document.createElement('div');
            el.className = 'obj-block';
            el.id = `block-${block.id}`;
            el.innerHTML = `
                <div><strong>${block.name}</strong></div>
                <div style="font-size:0.75rem; color:var(--text-muted)">${block.age}</div>
            `;
            bucketContainer.appendChild(el);
            block.element = el;

            // Create Query button
            const btn = document.createElement('button');
            btn.className = 'btn primary-btn';
            btn.textContent = `Query ${block.name}`;
            btn.addEventListener('click', () => simulateQuery(block));
            blockButtonsContainer.appendChild(btn);
        });

        setTimeout(() => {
            log("Downloaded meta.json and Index Headers to local disk.", "info");
            flashElement(simIndexHeader, 'active', 1000);
            log("Store Gateway ready. Serving StoreAPI.", "info");
        }, 800);
    }

    // Animation Helper
    async function animatePacket(fromEl, toEl, color = 'var(--success-color)', duration = 500) {
        const fromRect = fromEl.getBoundingClientRect();
        const toRect = toEl.getBoundingClientRect();
        const canvasRect = simCanvas.getBoundingClientRect();

        const startX = fromRect.left + fromRect.width / 2 - canvasRect.left;
        const startY = fromRect.top + fromRect.height / 2 - canvasRect.top;
        const endX = toRect.left + toRect.width / 2 - canvasRect.left;
        const endY = toRect.top + toRect.height / 2 - canvasRect.top;

        packet.style.backgroundColor = color;
        packet.style.boxShadow = `0 0 8px ${color}`;
        packet.style.left = `${startX}px`;
        packet.style.top = `${startY}px`;
        packet.classList.add('animating');

        // Force reflow
        void packet.offsetWidth;

        packet.style.transition = `all ${duration}ms ease-in-out`;
        packet.style.left = `${endX}px`;
        packet.style.top = `${endY}px`;

        return new Promise(resolve => setTimeout(() => {
            packet.classList.remove('animating');
            packet.style.transition = '';
            resolve();
        }, duration));
    }

    async function wait(ms) {
        return new Promise(r => setTimeout(r, ms));
    }

    function flashElement(el, className, duration = 800) {
        el.classList.add(className);
        setTimeout(() => el.classList.remove(className), duration);
    }

    // Main Simulation Logic
    async function simulateQuery(block) {
        if (isSimulating) return;
        isSimulating = true;

        // Disable buttons
        const btns = blockButtonsContainer.querySelectorAll('button');
        btns.forEach(b => b.disabled = true);
        btnClearCache.disabled = true;

        log(`--- Incoming StoreAPI Query for time range targeting ${block.name} ---`, "info");
        arrowGrpc.classList.add('active');

        try {
            // Step 0: Time Partitioning Check (Metadata Filter equivalent)
            if (flagTimePartition.checked) {
                // simulated rule: --min-time=-2w --max-time=now
                if (block.timeOffset > 14) {
                    log(`Query ignored: Metadata filter determines ${block.name} (${block.age}) is outside configured --min-time=-2w`, "warn");
                    await wait(1000);
                    return; // exit early, Store returns nothing
                }
            }

            // Step 1: Index Header Lookup (Local Disk)
            log(`Step 1: Reading local Index Header to find offsets for ${block.name}...`);
            flashElement(simIndexHeader, 'active');
            await wait(800);

            // Step 2: Index Cache Lookup
            let indexHit = false;
            log(`Step 2: Checking Index Cache for Postings/Series...`);
            if (flagIndexCache.checked) {
                if (cacheState.index.has(block.id)) {
                    indexHit = true;
                    log(`[Hit] Index Cache found series data.`, "info");
                    flashElement(simIndexCache, 'hit');
                } else {
                    log(`[Miss] Index Cache miss. Fetching index bytes...`, "warn");
                    flashElement(simIndexCache, 'miss');
                    // Add to cache
                    cacheState.index.add(block.id);
                }
            } else {
                log("Index Cache disabled. Skipping.", "warn");
            }
            await wait(800);

            // Fetch missing index from ObjStore if needed
            if (!indexHit && flagIndexCache.checked) {
                log(`Sending HTTP Byte-Range Request to Object Storage for Index bytes...`, "info");
                arrowHttp.classList.add('active');
                await animatePacket(nodeStore, nodeObj, 'var(--warning-color)');
                block.element.classList.add('fetching');
                await wait(600);
                block.element.classList.remove('fetching');
                await animatePacket(nodeObj, nodeStore, 'var(--success-color)');
                arrowHttp.classList.remove('active');
            }

            // Step 3: Chunk Cache Lookup
            let chunkHit = false;
            log(`Step 3: Checking Chunk Cache for raw sample data...`);
            if (flagChunkCache.checked) {
                if (cacheState.chunk.has(block.id)) {
                    chunkHit = true;
                    log(`[Hit] Chunk Cache found sample data.`, "info");
                    flashElement(simChunkCache, 'hit');
                } else {
                    log(`[Miss] Chunk Cache miss. Fetching chunk bytes...`, "warn");
                    flashElement(simChunkCache, 'miss');
                    cacheState.chunk.add(block.id);
                }
            } else {
                log("Chunk Cache disabled. Skipping.", "warn");
            }
            await wait(800);

            // Step 4: Fetch missing chunks from Object Storage using HTTP Range Requests
            if (!chunkHit) {
                log(`Step 4: Sending HTTP Byte-Range Request to Object Storage for Chunk bytes...`, "info");
                arrowHttp.classList.add('active');

                await animatePacket(nodeStore, nodeObj, 'var(--warning-color)');
                block.element.classList.add('fetching');
                await wait(800);

                log(`Fetched exact chunk bytes from Object Storage.`, "info");
                block.element.classList.remove('fetching');
                await animatePacket(nodeObj, nodeStore, 'var(--success-color)');
            } else {
                log(`Sample data served from local Chunk Cache! No Object Storage egress required.`, "info");
            }

            log(`Successfully served StoreAPI Query to Querier.`, "info");

        } finally {
            // Cleanup
            arrowGrpc.classList.remove('active');
            arrowHttp.classList.remove('active');
            btns.forEach(b => b.disabled = false);
            btnClearCache.disabled = false;
            isSimulating = false;
            log(`--- Query Complete ---`, "info");

            // Add spacing between logs
            const spacer = document.createElement('div');
            spacer.style.height = "10px";
            logPanel.appendChild(spacer);
            logPanel.scrollTop = logPanel.scrollHeight;
        }
    }

    // Cache Clearing
    btnClearCache.addEventListener('click', () => {
        cacheState.index.clear();
        cacheState.chunk.clear();
        log("Caches cleared manually (Simulating Store Gateway restart without persistent caches).", "warn");

        flashElement(simIndexCache, 'miss', 400);
        flashElement(simChunkCache, 'miss', 400);
    });

    // Run Init
    init();
});