document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const btnCutBlock = document.getElementById('btn-cut-block');
    const btnQuery = document.getElementById('btn-query');
    const flagObjstore = document.getElementById('flag-objstore');
    const flagPromUrl = document.getElementById('flag-prom-url');

    const localBlocksContainer = document.getElementById('local-blocks');
    const bucketBlocksContainer = document.getElementById('bucket-blocks');
    const logPanel = document.getElementById('log-panel');
    const queryIndicator = document.getElementById('query-indicator');

    // State
    let blockIdCounter = 1;
    let isUploading = false;

    // Utility: Append to Log
    function logMsg(level, msg) {
        const div = document.createElement('div');
        div.textContent = `level=${level} msg="${msg}"`;
        if (level === 'error' || level === 'warn') {
            div.style.color = 'var(--danger-color)';
        }
        logPanel.appendChild(div);
        logPanel.scrollTop = logPanel.scrollHeight;
    }

    // Helper: Generate ULID like string
    function generateULID() {
        const chars = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
        let id = '';
        for(let i=0; i<8; i++) id += chars.charAt(Math.floor(Math.random() * chars.length));
        return '01' + id;
    }

    // --- Action: Simulate Query ---
    btnQuery.addEventListener('click', () => {
        if (!flagPromUrl.checked) {
            logMsg('error', 'Store API query failed: --prometheus.url not configured or unreachable');
            queryIndicator.textContent = "Query Failed!";
            queryIndicator.style.background = "var(--danger-color)";
        } else {
            logMsg('info', 'Store API: Received query, proxying to Prometheus at localhost:9090');
            queryIndicator.textContent = "Query Success!";
            queryIndicator.style.background = "var(--success-color)";
        }

        // Show indicator
        queryIndicator.classList.add('active');

        // Hide after short delay
        setTimeout(() => {
            queryIndicator.classList.remove('active');
        }, 1500);
    });

    // --- Action: Cut New Block ---
    btnCutBlock.addEventListener('click', () => {
        const blockId = generateULID();
        logMsg('info', `Prometheus created new local block: ${blockId}`);

        // Create local block DOM element
        const blockEl = document.createElement('div');
        blockEl.className = 'tsdb-block';
        blockEl.id = `local-${blockId}`;
        blockEl.innerHTML = `
            <div>${blockId}</div>
            <div class="size">~64MB</div>
            <div class="status">Uploading...</div>
        `;
        localBlocksContainer.appendChild(blockEl);

        // Sidecar watches and processes
        processNewBlock(blockId, blockEl);
    });

    function processNewBlock(blockId, blockEl) {
        if (!flagObjstore.checked) {
            logMsg('warn', `Sidecar detected block ${blockId} but --objstore.config-file is missing. Not uploading.`);
            return;
        }

        // Simulate watcher delay
        setTimeout(() => {
            if (isUploading) {
                 logMsg('info', `Sidecar enqueued block ${blockId} for upload.`);
                 // Simple queue visualizer logic could go here
            }

            isUploading = true;
            blockEl.classList.add('uploading');
            logMsg('info', `Sidecar starting upload for block: ${blockId}`);

            // Simulate upload time
            setTimeout(() => {
                completeUpload(blockId, blockEl);
            }, 2500);

        }, 500); // 500ms delay to detect
    }

    function completeUpload(blockId, blockEl) {
        // Stop animation on local
        blockEl.classList.remove('uploading');
        blockEl.classList.add('uploaded');
        blockEl.querySelector('.status').style.display = 'none';

        logMsg('info', `Successfully uploaded block ${blockId} to object storage`);

        // Add to Bucket container
        const bucketEl = document.createElement('div');
        bucketEl.className = 'obj-block';
        bucketEl.innerHTML = `
            <div>${blockId}</div>
            <div class="size">~64MB</div>
        `;
        bucketBlocksContainer.appendChild(bucketEl);

        isUploading = false;
    }

    // --- Completion Hook ---
    const labId = 'sidecar';
    const btnComplete = document.getElementById('mark-complete-btn');
    if (window.ThanosApp && window.ThanosApp.state.isCompleted(labId)) {
        btnComplete.textContent = "✓ Completed";
        btnComplete.disabled = true;
    }
    btnComplete.addEventListener('click', () => {
        if (window.ThanosApp) {
            window.ThanosApp.markLabComplete(labId);
            btnComplete.textContent = "✓ Completed";
            btnComplete.disabled = true;
        }
    });

    logMsg('info', 'Sidecar initialized and watching data directory.');
});
