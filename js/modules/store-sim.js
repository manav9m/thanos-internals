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
        btnMarkComplete.classList.remove('primary');
    }

    btnMarkComplete.addEventListener('click', () => {
        if (window.ThanosApp) {
            window.ThanosApp.markLabComplete(labId);
            btnMarkComplete.textContent = "✓ Completed";
            btnMarkComplete.disabled = true;
            btnMarkComplete.classList.remove('primary');
        }
    });

    // Logging helper
    function log(msg, type="info") {
        const div = document.createElement('div');
        div.style.color = type === "error" ? "#f85149" : (type === "warn" ? "#d29922" : "#0f0");
        div.textContent = `level=${type} msg="${msg}"`;
        logPanel.appendChild(div);
        logPanel.scrollTop = logPanel.scrollHeight;
    }

    // State
    let isSimulating = false;

    // Define Blocks in Object Storage
    const blocks = [
        { id: 'b1', name: 'Block A', age: '1d ago', timeOffset: 1, element: null },
        { id: 'b2', name: 'Block B', age: '3w ago', timeOffset: 21, element: null },
    ];

    // Caches state
    const cacheState = {
        index: new Set(),
        chunk: new Set()
    };

    // Initialize UI
    function init() {
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
            btn.className = 'primary';
            btn.style.flex = '1';
            btn.textContent = `Query ${block.name}`;
            btn.addEventListener('click', () => simulateQuery(block));
            blockButtonsContainer.appendChild(btn);
        });

        log("Store Gateway loaded index-headers from Object Storage to local disk.");
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

        log(`--- Incoming StoreAPI Query for ${block.name} ---`, "info");
        arrowGrpc.classList.add('active');

        try {
            // 1. Time Partitioning Check
            if (flagTimePartition.checked) {
                // simulated rule: --min-time=-2w --max-time=now
                if (block.timeOffset > 14) {
                    log(`Query dropped: ${block.name} (${block.age}) is outside configured time range (--min-time=-2w)`, "warn");
                    await wait(800);
                    return; // exit early
                }
            }

            // 2. Index Header Lookup (Local Disk)
            log(`Checking local Index Header for ${block.name} offsets...`);
            flashElement(simIndexHeader, 'active');
            await wait(600);

            // 3. Index Cache Lookup
            let indexHit = false;
            if (flagIndexCache.checked) {
                if (cacheState.index.has(block.id)) {
                    indexHit = true;
                    log(`Index Cache HIT for ${block.name} (Postings/Series)`, "info");
                    flashElement(simIndexCache, 'hit');
                } else {
                    log(`Index Cache MISS for ${block.name}`, "warn");
                    flashElement(simIndexCache, 'miss');
                    // Add to cache
                    cacheState.index.add(block.id);
                }
            } else {
                log("Index Cache disabled. Skipping.", "warn");
            }
            await wait(600);

            // 4. Chunk Cache Lookup
            let chunkHit = false;
            if (flagChunkCache.checked) {
                if (cacheState.chunk.has(block.id)) {
                    chunkHit = true;
                    log(`Chunk Cache HIT for ${block.name} (Sample Data)`, "info");
                    flashElement(simChunkCache, 'hit');
                } else {
                    log(`Chunk Cache MISS for ${block.name}`, "warn");
                    flashElement(simChunkCache, 'miss');
                    cacheState.chunk.add(block.id);
                }
            } else {
                log("Chunk Cache disabled. Skipping.", "warn");
            }
            await wait(600);

            // 5. Fetch from Object Storage if needed
            if (!indexHit || !chunkHit) {
                log(`Sending HTTP Byte-Range request to Object Storage for ${block.name}...`, "info");
                arrowHttp.classList.add('active');

                await animatePacket(nodeStore, nodeObj, 'var(--warning-color)');
                block.element.classList.add('fetching');
                await wait(800);

                log(`Fetched missing data bytes from Object Storage.`, "info");
                block.element.classList.remove('fetching');
                await animatePacket(nodeObj, nodeStore, 'var(--success-color)');
            } else {
                log(`All required data served from internal caches! No request to Object Storage.`, "info");
            }

            log(`Successfully served StoreAPI Query for ${block.name}.`, "info");

        } finally {
            // Cleanup
            arrowGrpc.classList.remove('active');
            arrowHttp.classList.remove('active');
            btns.forEach(b => b.disabled = false);
            btnClearCache.disabled = false;
            isSimulating = false;
            log(`--- Query Complete ---`, "info");
        }
    }

    // Cache Clearing
    btnClearCache.addEventListener('click', () => {
        cacheState.index.clear();
        cacheState.chunk.clear();
        log("Caches cleared manually.", "warn");

        flashElement(simIndexCache, 'miss', 400);
        flashElement(simChunkCache, 'miss', 400);
    });

    // Run Init
    init();
});