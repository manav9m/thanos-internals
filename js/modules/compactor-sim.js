// Compactor Simulation Logic

document.addEventListener('DOMContentLoaded', () => {
    // --- State ---
    let blocks = [];
    let blockIdCounter = 1;
    let timeSimulated = 0; // in hours

    // --- DOM Elements ---
    const rawContainer = document.getElementById('raw-blocks');
    const dsContainer = document.getElementById('downsampled-blocks');
    const logPanel = document.getElementById('log-panel');
    const engineStatus = document.getElementById('compactor-status');

    const btnGenerate = document.getElementById('btn-generate');
    const btnCompact = document.getElementById('btn-compact');
    const btnReset = document.getElementById('btn-reset');

    const chkDownsampling = document.getElementById('flag-downsampling');
    const selRetentionRaw = document.getElementById('flag-retention-raw');

    // --- Gamification Hook ---
    const btnComplete = document.getElementById('mark-complete-btn');
    if (window.ThanosApp && window.ThanosApp.state.isCompleted('compactor')) {
        btnComplete.textContent = "✓ Completed";
        btnComplete.disabled = true;
    }
    btnComplete.addEventListener('click', () => {
        if (window.ThanosApp) {
            window.ThanosApp.markLabComplete('compactor');
            btnComplete.textContent = "✓ Completed";
            btnComplete.disabled = true;
        }
    });

    // --- Utilities ---
    function log(msg, level = 'info') {
        const line = document.createElement('div');
        line.textContent = `level=${level} msg="${msg}"`;
        if (level === 'warn') line.style.color = 'yellow';
        if (level === 'error') line.style.color = 'red';
        logPanel.appendChild(line);
        logPanel.scrollTop = logPanel.scrollHeight;
    }

    function renderBlocks() {
        rawContainer.innerHTML = '';
        dsContainer.innerHTML = '';

        blocks.forEach(b => {
            const el = document.createElement('div');
            el.className = `ts-block res-${b.res}`;
            el.id = `block-${b.id}`;
            el.innerHTML = `
                <div>ID: ${b.id}</div>
                <div class="res">${b.res === 'raw' ? '0s (Raw)' : b.res}</div>
                <div class="size">${b.duration}h span</div>
            `;

            if (b.res === 'raw') {
                rawContainer.appendChild(el);
            } else {
                dsContainer.appendChild(el);
            }
        });
    }

    const delay = ms => new Promise(res => setTimeout(res, ms));

    // --- Actions ---

    // 1. Ingest (Simulate Sidecar uploading)
    btnGenerate.addEventListener('click', () => {
        const newBlock = {
            id: blockIdCounter++,
            res: 'raw',
            duration: 2, // 2h block
            timestamp: timeSimulated
        };
        blocks.push(newBlock);
        timeSimulated += 2;
        log(`Uploaded new 2h raw block. ID: ${newBlock.id}`);
        renderBlocks();
    });

    // 2. Compaction Cycle
    btnCompact.addEventListener('click', async () => {
        btnCompact.disabled = true;
        btnGenerate.disabled = true;
        engineStatus.textContent = "Scanning bucket...";
        log("Starting compaction cycle...", "info");

        await delay(1000);

        // A. Compaction: Find raw blocks to merge (4 x 2h = 8h)
        const rawBlocks = blocks.filter(b => b.res === 'raw' && b.duration === 2);

        if (rawBlocks.length >= 4) {
            engineStatus.textContent = "Compacting 2h blocks...";
            log(`Found ${rawBlocks.length} overlapping 2h blocks. Merging 4 of them into an 8h block...`);

            // Highlight merging blocks
            for(let i=0; i<4; i++) {
                document.getElementById(`block-${rawBlocks[i].id}`).classList.add('compacting');
            }

            await delay(1500);

            // Remove the 4 old blocks
            const blocksToRemove = rawBlocks.slice(0, 4).map(b => b.id);
            blocks = blocks.filter(b => !blocksToRemove.includes(b.id));

            // Create 1 new 8h block
            const newBlock = {
                id: blockIdCounter++,
                res: 'raw',
                duration: 8,
                timestamp: rawBlocks[0].timestamp // keep oldest timestamp
            };
            blocks.push(newBlock);
            log(`Successfully compacted into 8h block ID: ${newBlock.id}`);
            renderBlocks();
        } else {
            log("No compactable groups found (need at least 4x 2h blocks).", "info");
        }

        await delay(1000);

        // B. Downsampling
        if (chkDownsampling.checked) {
            engineStatus.textContent = "Downsampling...";
            const raw8hBlocks = blocks.filter(b => b.res === 'raw' && b.duration >= 8);

            for (const b of raw8hBlocks) {
                // Check if downsampled version already exists
                const has5m = blocks.some(ds => ds.res === '5m' && ds.timestamp === b.timestamp);
                if (!has5m && b.duration >= 8) { // Simulate downsampling rule
                    log(`Downsampling block ID: ${b.id} to 5m resolution...`);
                    document.getElementById(`block-${b.id}`).classList.add('compacting');
                    await delay(1000);
                    blocks.push({
                        id: blockIdCounter++,
                        res: '5m',
                        duration: b.duration,
                        timestamp: b.timestamp
                    });
                    document.getElementById(`block-${b.id}`).classList.remove('compacting');
                    renderBlocks();
                }
            }
        } else {
            log("Downsampling skipped (--downsampling.disable is set).", "warn");
        }

        await delay(1000);

        // C. Retention
        engineStatus.textContent = "Applying Retention...";
        const retentionLimit = parseInt(selRetentionRaw.value);
        if (retentionLimit > 0) {
            const initialCount = blocks.length;
            // A block is older than retention if current time - block timestamp > retention
            blocks = blocks.filter(b => {
                if (b.res !== 'raw') return true; // Only applying to raw in this simulation
                const age = timeSimulated - b.timestamp;
                if (age > retentionLimit) {
                    log(`Deleting raw block ID: ${b.id} (Age: ${age}h exceeds retention ${retentionLimit}h)`, "warn");
                    return false;
                }
                return true;
            });
            if (blocks.length !== initialCount) {
                renderBlocks();
            } else {
                log("No blocks exceed retention limits.");
            }
        } else {
            log("Retention disabled (--retention.resolution-raw=0s).");
        }

        engineStatus.textContent = "Idle";
        log("Compaction cycle finished.");
        btnCompact.disabled = false;
        btnGenerate.disabled = false;
    });

    // 3. Reset
    btnReset.addEventListener('click', () => {
        blocks = [];
        blockIdCounter = 1;
        timeSimulated = 0;
        logPanel.innerHTML = '<div>level=info msg="Compactor simulator ready"</div>';
        renderBlocks();
    });

    // --- Unlock Advanced Controls Logic ---
    function checkPrerequisites() {
        if (window.ThanosApp &&
            window.ThanosApp.state.isCompleted('tsdb') &&
            window.ThanosApp.state.isCompleted('object-storage')) {
            const advContainer = document.getElementById('advanced-controls');
            if (advContainer) {
                advContainer.style.opacity = '1';
                advContainer.style.pointerEvents = 'auto';
                const lockMsg = document.getElementById('advanced-lock-msg');
                if (lockMsg) lockMsg.style.display = 'none';
            }
        }
    }

    // Run check initially
    checkPrerequisites();

    // Initial render
    renderBlocks();
});
