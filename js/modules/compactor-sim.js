// Compactor Simulation Logic
document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const bucketRaw = document.getElementById('bucket-raw');
    const bucketDownsampled = document.getElementById('bucket-downsampled');
    const logPanel = document.getElementById('log-panel');
    const statusEl = document.getElementById('compactor-status');

    // Buttons
    const btnIngest = document.getElementById('btn-ingest');
    const btnIngestDiff = document.getElementById('btn-ingest-diff');
    const btnRun = document.getElementById('btn-run');
    const btnMulti = document.getElementById('btn-multi');
    const btnReset = document.getElementById('btn-reset');

    // Controls
    const flagDownsampling = document.getElementById('flag-downsampling');
    const flagRetention = document.getElementById('flag-retention');

    // State
    let blocks = [];
    let blockCounter = 0;
    let globalTimeHours = 0; // Simulated time to track age for retention
    let isRunning = false;

    // Helper: Logging
    function log(msg, type = 'info') {
        const time = new Date().toISOString().substring(11, 19);
        const div = document.createElement('div');
        div.className = type;
        div.textContent = `[${time}] level=${type} msg="${msg}"`;
        logPanel.appendChild(div);
        logPanel.scrollTop = logPanel.scrollHeight;
    }

    // Helper: Update Status
    function setStatus(msg, color = 'var(--success-color)') {
        statusEl.textContent = msg;
        statusEl.style.color = color;
    }

    // Helper: Render Blocks
    function renderBlocks() {
        // Clear containers
        const rawTitle = bucketRaw.querySelector('.bucket-label');
        const downTitle = bucketDownsampled.querySelector('.bucket-label');

        bucketRaw.innerHTML = '';
        bucketRaw.appendChild(rawTitle);

        bucketDownsampled.innerHTML = '';
        bucketDownsampled.appendChild(downTitle);

        blocks.forEach(b => {
            const el = document.createElement('div');
            el.className = `ts-block res-${b.res} ${b.animClass || ''}`;
            el.id = `block-${b.id}`;

            const labelStr = `cluster="${b.labels.cluster}"`;

            el.innerHTML = `
                <div class="ext-label" title="${labelStr}">${labelStr}</div>
                <div class="duration">${b.duration}h</div>
                <div class="res">${b.res}</div>
            `;

            if (b.res === 'raw') {
                bucketRaw.appendChild(el);
            } else {
                bucketDownsampled.appendChild(el);
            }
        });
    }

    // Action: Ingest Block
    function ingestBlock(clusterLabel) {
        if (isRunning) return;

        blockCounter++;
        const newBlock = {
            id: blockCounter,
            res: 'raw',
            duration: 2,
            labels: { cluster: clusterLabel },
            createdAt: globalTimeHours, // Age tracking
            animClass: ''
        };

        blocks.push(newBlock);
        globalTimeHours += 2; // Advance simulated time

        log(`Sidecar uploaded 2h raw block (ext_labels: cluster=${clusterLabel})`, 'info');
        renderBlocks();
        checkCompletion();
    }

    // Core: Run Compaction Cycle
    async function runCompactor() {
        if (isRunning) return;
        isRunning = true;

        btnRun.disabled = true;
        btnIngest.disabled = true;
        btnIngestDiff.disabled = true;

        setStatus('[Active] Scanning Object Storage...', 'var(--warning-color)');
        log('Starting compaction cycle. Scanning bucket for blocks...', 'info');
        await sleep(1000);

        // 1. Group by External Labels
        log('Grouping blocks by external labels...', 'info');
        const groups = {};
        blocks.forEach(b => {
            if (b.res === 'raw') {
                const key = b.labels.cluster;
                if (!groups[key]) groups[key] = [];
                groups[key].push(b);
            }
        });

        await sleep(1000);

        // 2. Compaction (Merging)
        for (const [cluster, groupBlocks] of Object.entries(groups)) {
            // If we have 4 or more 2h blocks for a cluster, merge them into an 8h block
            const smallBlocks = groupBlocks.filter(b => b.duration === 2);

            if (smallBlocks.length >= 4) {
                log(`Found ${smallBlocks.length} overlapping 2h blocks for cluster="${cluster}". Merging...`, 'info');

                // Animate selection
                smallBlocks.forEach(b => {
                    const idx = blocks.findIndex(x => x.id === b.id);
                    if (idx > -1) blocks[idx].animClass = 'compacting';
                });
                renderBlocks();

                setStatus(`[Active] Merging blocks (cluster="${cluster}")...`, 'var(--warning-color)');
                await sleep(2000);

                // Remove the old blocks
                const idsToRemove = smallBlocks.map(b => b.id);
                blocks = blocks.filter(b => !idsToRemove.includes(b.id));

                // Create merged block
                blockCounter++;
                const mergedDuration = smallBlocks.length * 2;
                // Inherit the oldest creation time to properly simulate age
                const oldestAge = Math.min(...smallBlocks.map(b => b.createdAt));

                const mergedBlock = {
                    id: blockCounter,
                    res: 'raw',
                    duration: mergedDuration,
                    labels: { cluster: cluster },
                    createdAt: oldestAge,
                    animClass: 'compacting'
                };

                blocks.push(mergedBlock);
                renderBlocks();
                log(`Successfully merged into ${mergedDuration}h raw block.`, 'info');

                await sleep(1000);
                mergedBlock.animClass = '';
                renderBlocks();
            } else {
                log(`Not enough blocks for compaction on cluster="${cluster}" (Found ${smallBlocks.length}, need 4).`, 'info');
            }
        }

        // 3. Downsampling
        if (flagDownsampling.checked) {
            setStatus('[Active] Evaluating downsampling requirements...', 'var(--warning-color)');
            log('Checking for blocks eligible for downsampling...', 'info');
            await sleep(1500);

            let downsampledCount = 0;
            // Downsample blocks that are 8h or larger and don't have downsampled equivalents
            const largeBlocks = blocks.filter(b => b.res === 'raw' && b.duration >= 8);

            for (const b of largeBlocks) {
                // Check if 5m already exists for this exact time range
                const has5m = blocks.some(db => db.res === '5m' && db.createdAt === b.createdAt && db.labels.cluster === b.labels.cluster);
                if (!has5m) {
                    log(`Generating 5m downsampled block for 8h raw data (cluster="${b.labels.cluster}")...`, 'info');

                    const idx = blocks.findIndex(x => x.id === b.id);
                    blocks[idx].animClass = 'compacting';
                    renderBlocks();

                    await sleep(1500);

                    blockCounter++;
                    blocks.push({
                        id: blockCounter,
                        res: '5m',
                        duration: b.duration,
                        labels: { ...b.labels },
                        createdAt: b.createdAt,
                        animClass: 'compacting'
                    });

                    blocks[idx].animClass = '';
                    renderBlocks();

                    await sleep(500);
                    blocks[blocks.length-1].animClass = '';
                    downsampledCount++;
                }
            }
            if (downsampledCount === 0) {
                log('No blocks require downsampling at this time.', 'info');
            } else {
                renderBlocks();
            }
        } else {
            log('Downsampling skipped (--downsampling.disable is set).', 'warn');
        }

        // 4. Retention & Deletion
        const retentionRawHours = parseInt(flagRetention.value, 10);
        if (retentionRawHours > 0) {
            setStatus('[Active] Enforcing retention policies...', 'var(--warning-color)');
            log(`Checking raw blocks against ${retentionRawHours}h retention policy...`, 'info');
            await sleep(1000);

            const toDelete = blocks.filter(b => b.res === 'raw' && (globalTimeHours - b.createdAt) > retentionRawHours);

            if (toDelete.length > 0) {
                log(`Found ${toDelete.length} raw blocks older than retention limit. Proceeding with deletion.`, 'warn');

                toDelete.forEach(b => {
                    const idx = blocks.findIndex(x => x.id === b.id);
                    blocks[idx].animClass = 'deleting';
                });
                renderBlocks();

                await sleep(1500);

                const deleteIds = toDelete.map(b => b.id);
                blocks = blocks.filter(b => !deleteIds.includes(b.id));
                log('Old blocks permanently deleted from Object Storage.', 'info');
                renderBlocks();
            } else {
                log('No blocks exceed retention limits.', 'info');
            }
        }

        setStatus('[Idle] Waiting for execution...', 'var(--success-color)');
        log('Compaction cycle complete.', 'info');

        btnRun.disabled = false;
        btnIngest.disabled = false;
        btnIngestDiff.disabled = false;
        isRunning = false;
        checkCompletion();
    }

    // Helper: Delay
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Event Listeners
    btnIngest.addEventListener('click', () => ingestBlock('eu-west-1'));
    btnIngestDiff.addEventListener('click', () => ingestBlock('us-east-2'));

    btnRun.addEventListener('click', () => {
        runCompactor();
    });

    btnMulti.addEventListener('click', () => {
        if (isRunning) return;
        log('FATAL: Attempting to start second Compactor instance!', 'err');
        log('FATAL: lock acquisition failed: bucket is already locked by another Compactor. Halting.', 'err');
        setStatus('[ERROR] Singleton lock failed', 'var(--danger-color)');
    });

    btnReset.addEventListener('click', () => {
        if (isRunning) return;
        blocks = [];
        globalTimeHours = 0;
        blockCounter = 0;
        log('Storage bucket reset.', 'info');
        setStatus('[Idle] Waiting for execution...', 'var(--success-color)');
        renderBlocks();
    });

    // Gamification Integration
    function checkCompletion() {
        const hasMerged = blocks.some(b => b.duration >= 8 && b.res === 'raw');
        const hasDownsampled = blocks.some(b => b.res === '5m');

        if (hasMerged && hasDownsampled && window.ThanosApp) {
            document.getElementById('mark-complete-btn').classList.add('pulse');
        }
    }

    if (window.ThanosApp) {
        const completeBtn = document.getElementById('mark-complete-btn');
        completeBtn.addEventListener('click', () => {
            window.ThanosApp.markLabComplete('compactor');
            completeBtn.textContent = 'Completed ✓';
            completeBtn.classList.remove('primary', 'pulse');
            completeBtn.classList.add('success');
            completeBtn.disabled = true;
        });

        if (window.ThanosApp.state.completedLabs.includes('compactor')) {
            completeBtn.textContent = 'Completed ✓';
            completeBtn.classList.remove('primary');
            completeBtn.classList.add('success');
            completeBtn.disabled = true;
        }
    }

    // Init
    log('Compactor node initialized and observing bucket.', 'info');
    renderBlocks();
});
