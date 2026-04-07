document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const btnScrape = document.getElementById('btn-scrape');
    const btnCutBlock = document.getElementById('btn-cut-block');
    const btnQuery = document.getElementById('btn-query');

    const flagExtLabels = document.getElementById('flag-ext-labels');
    const flagObjstore = document.getElementById('flag-objstore');
    const archLabels = document.getElementById('arch-labels');

    const chunkBars = [
        document.getElementById('chunk1'),
        document.getElementById('chunk2'),
        document.getElementById('chunk3')
    ];
    const localBlocksContainer = document.getElementById('local-blocks');
    const bucketBlocksContainer = document.getElementById('bucket-blocks');
    const terminal = document.getElementById('terminal');
    const queryIndicator = document.getElementById('query-indicator');

    // State
    let scrapeCount = 0;
    let isUploading = false;
    let localBlockQueue = [];

    // Helper: Generate ULID
    function generateULID() {
        const chars = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
        let id = '';
        for(let i=0; i<8; i++) id += chars.charAt(Math.floor(Math.random() * chars.length));
        return '01' + id;
    }

    // Helper: Log to terminal
    function logMsg(msg, isError = false, isWarn = false) {
        const div = document.createElement('div');
        const timestamp = new Date().toISOString().substring(11, 19);

        let color = '#2ecc71'; // Success/Info green
        if (isError) color = '#e74c3c'; // Red
        if (isWarn) color = '#f1c40f'; // Yellow

        div.innerHTML = `<span style="color: #888">[${timestamp}]</span> <span style="color: ${color}">${msg}</span>`;
        terminal.appendChild(div);
        terminal.scrollTop = terminal.scrollHeight;
    }

    // Initialize UI
    logMsg('Starting Thanos Sidecar...');
    logMsg('Connected to Prometheus HTTP API (StoreAPI ready).');

    // Toggle External Labels
    flagExtLabels.addEventListener('change', (e) => {
        if (e.target.checked) {
            archLabels.classList.add('active');
            logMsg('Prometheus external_labels configured: cluster="prod", replica="0"');
        } else {
            archLabels.classList.remove('active');
            logMsg('CRITICAL: Prometheus external_labels missing! Uploads will be rejected.', true);
        }
    });

    // Initial setup based on default checked state
    if (flagExtLabels.checked) {
        archLabels.classList.add('active');
    }

    // --- Action: Simulate Scrape (Live Data) ---
    btnScrape.addEventListener('click', () => {
        if (scrapeCount >= 3) {
            logMsg('Head block full. Simulating 2 hours elapsed. Ready to cut.', false, true);
            return;
        }

        scrapeCount++;
        chunkBars[scrapeCount - 1].style.width = '100%';
        logMsg(`Prometheus: Ingested scrape ${scrapeCount}/3 into RAM (Head Block).`);

        if (scrapeCount === 3) {
            btnCutBlock.disabled = false;
            btnScrape.disabled = true;
            btnCutBlock.classList.add('primary');
            btnScrape.classList.remove('primary');
            logMsg('Prometheus: 2 hours elapsed. Head Block is ready to be cut.');
        }
    });

    // --- Action: Cut Block (2h elapsed) ---
    btnCutBlock.addEventListener('click', () => {
        const blockId = generateULID();
        logMsg(`Prometheus: Cutting Head Block to persistent disk... ULID: ${blockId}`);

        // Reset Head Block
        scrapeCount = 0;
        chunkBars.forEach(bar => bar.style.width = '0%');
        btnCutBlock.disabled = true;
        btnScrape.disabled = false;
        btnScrape.classList.add('primary');
        btnCutBlock.classList.remove('primary');

        // Create local block DOM
        const blockEl = document.createElement('div');
        blockEl.className = 'tsdb-block';
        blockEl.id = `local-${blockId}`;
        blockEl.innerHTML = `
            <div>${blockId}</div>
            <div class="size">~64MB</div>
            <div class="status">Uploading...</div>
        `;
        localBlocksContainer.appendChild(blockEl);

        localBlockQueue.push({ id: blockId, element: blockEl });

        // Trigger Sidecar Detection
        setTimeout(() => processQueue(), 1000);
    });

    // --- Action: Query StoreAPI ---
    btnQuery.addEventListener('click', () => {
        logMsg('StoreAPI: Received Query Request.');

        queryIndicator.classList.add('active');

        setTimeout(() => {
            if (scrapeCount > 0) {
                 logMsg(`Sidecar proxied query to Prometheus. Returned live data from Head Block.`);
            } else {
                 logMsg(`Sidecar proxied query to Prometheus. Head Block empty (no live data).`);
            }
            queryIndicator.classList.remove('active');
        }, 1200);
    });

    // --- Core Logic: Process Upload Queue ---
    function processQueue() {
        if (isUploading || localBlockQueue.length === 0) return;

        const currentBlock = localBlockQueue[0];

        logMsg(`Sidecar: Detected new complete block ${currentBlock.id} on disk.`);

        // Validation 1: External Labels
        if (!flagExtLabels.checked) {
            logMsg(`Sidecar Error: Cannot upload block ${currentBlock.id}. No external_labels configured!`, true);
            currentBlock.element.querySelector('.status').textContent = 'Failed (Labels)';
            currentBlock.element.querySelector('.status').style.color = '#e74c3c';
            currentBlock.element.querySelector('.status').style.display = 'block';
            currentBlock.element.style.borderColor = '#e74c3c';

            // Remove from queue so it stops trying, but keep on local disk
            localBlockQueue.shift();
            return;
        }

        // Validation 2: Object Storage
        if (!flagObjstore.checked) {
            logMsg(`Sidecar Warning: Block ${currentBlock.id} ready, but object storage disabled. Queueing locally.`, false, true);
            currentBlock.element.querySelector('.status').textContent = 'Queued';
            currentBlock.element.querySelector('.status').style.display = 'block';
            return;
        }

        // Proceed to upload
        isUploading = true;
        currentBlock.element.classList.add('uploading');
        currentBlock.element.querySelector('.status').textContent = 'Uploading...';
        logMsg(`Sidecar: Uploading block ${currentBlock.id} to object storage...`);

        setTimeout(() => {
            completeUpload(currentBlock);
        }, 2500);
    }

    function completeUpload(blockObj) {
        // Stop animation
        blockObj.element.classList.remove('uploading');
        blockObj.element.classList.add('uploaded');
        blockObj.element.querySelector('.status').style.display = 'none';

        logMsg(`Sidecar: Successfully uploaded block ${blockObj.id}. Data is now globally available.`);

        // Add to Bucket
        const bucketEl = document.createElement('div');
        bucketEl.className = 'obj-block';
        bucketEl.innerHTML = `
            <div>${blockObj.id}</div>
            <div class="size">~64MB</div>
        `;
        bucketBlocksContainer.appendChild(bucketEl);

        // Remove from queue and process next
        localBlockQueue.shift();
        isUploading = false;

        if (localBlockQueue.length > 0) {
            setTimeout(() => processQueue(), 500);
        }
    }

    // Watcher for Object Storage toggle (if turned back on, process queue)
    flagObjstore.addEventListener('change', (e) => {
        if (e.target.checked && localBlockQueue.length > 0) {
            logMsg('Object storage re-enabled. Processing local queue...');
            // Reset status text for queued blocks
            localBlockQueue.forEach(b => {
                 if(b.element.querySelector('.status').textContent === 'Queued') {
                     b.element.querySelector('.status').style.display = 'none';
                 }
            });
            processQueue();
        }
    });

    // --- Completion Hook ---
    const labId = 'sidecar';
    const btnComplete = document.getElementById('mark-complete-btn');
    if (window.ThanosApp && window.ThanosApp.state.isCompleted(labId)) {
        btnComplete.textContent = "✓ Completed";
        btnComplete.disabled = true;
        btnComplete.classList.remove('primary');
    }
    btnComplete.addEventListener('click', () => {
        if (window.ThanosApp) {
            window.ThanosApp.markLabComplete(labId);
            btnComplete.textContent = "✓ Completed";
            btnComplete.disabled = true;
            btnComplete.classList.remove('primary');
        }
    });
});