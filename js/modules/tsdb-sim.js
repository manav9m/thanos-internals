// TSDB Internals Simulation Logic

document.addEventListener('DOMContentLoaded', () => {
    // --- State ---
    let state = {
        headChunks: [], // active chunks in memory
        walRecords: 0,  // count of WAL appends
        blocks: [],     // persistent blocks
        isCrashed: false,
        chunkIdCounter: 1
    };

    const CHUNK_MAX_SAMPLES = 4; // Simulated small capacity for fast visual feedback

    // --- DOM Elements ---
    const headContainer = document.getElementById('head-chunks');
    const walContainer = document.getElementById('wal-records');
    const blocksContainer = document.getElementById('persistent-blocks');
    const logPanel = document.getElementById('log-panel');
    const simStatus = document.getElementById('sim-status');

    const btnScrape = document.getElementById('btn-scrape');
    const btnCut = document.getElementById('btn-cut');
    const btnCrash = document.getElementById('btn-crash');
    const btnRecover = document.getElementById('btn-recover');

    // --- Gamification Hook ---
    const btnComplete = document.getElementById('mark-complete-btn');
    if (window.ThanosApp && window.ThanosApp.state.isCompleted('tsdb')) {
        btnComplete.textContent = "✓ Completed";
        btnComplete.disabled = true;
    }
    btnComplete.addEventListener('click', () => {
        if (window.ThanosApp) {
            window.ThanosApp.markLabComplete('tsdb');
            btnComplete.textContent = "✓ Completed";
            btnComplete.disabled = true;
        }
    });

    // --- Utilities ---
    function generateULID() {
        const chars = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
        let ulid = '01'; // Simulated timestamp prefix
        for(let i=0; i<24; i++) {
            ulid += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return ulid;
    }

    function getTimestamp() {
        const now = new Date();
        return `[${now.toTimeString().split(' ')[0]}]`;
    }

    function log(msg, level = 'info') {
        const line = document.createElement('div');
        line.textContent = `${getTimestamp()} ${msg}`;
        if (level === 'warn') line.style.color = 'var(--warning-color)';
        if (level === 'error') line.style.color = 'var(--danger-color)';
        logPanel.appendChild(line);
        logPanel.scrollTop = logPanel.scrollHeight;
    }

    const delay = ms => new Promise(res => setTimeout(res, ms));

    function renderState() {
        // Render Head Chunks
        headContainer.innerHTML = '';
        if (state.headChunks.length === 0) {
             headContainer.innerHTML = '<span style="color:var(--text-muted); font-size:0.8rem; font-style:italic;">Empty</span>';
        } else {
            state.headChunks.forEach(chunk => {
                const el = document.createElement('div');
                el.className = `memory-chunk ${chunk.samples >= CHUNK_MAX_SAMPLES ? 'full' : ''}`;
                el.innerHTML = `${chunk.samples}/${CHUNK_MAX_SAMPLES}`;
                headContainer.appendChild(el);
            });
        }

        // Render WAL
        walContainer.innerHTML = '';
        if (state.walRecords === 0) {
             walContainer.innerHTML = '<span style="color:var(--text-muted); font-size:0.8rem; font-style:italic;">Empty</span>';
        } else {
            for (let i = 0; i < state.walRecords; i++) {
                const el = document.createElement('div');
                el.className = 'wal-record';
                el.textContent = 'WAL Rec';
                walContainer.appendChild(el);
            }
        }

        // Render Blocks
        blocksContainer.innerHTML = '';
        if (state.blocks.length === 0) {
            blocksContainer.innerHTML = '<span style="color:var(--text-muted); font-size:0.8rem; font-style:italic;">No blocks cut yet.</span>';
        } else {
            state.blocks.forEach(block => {
                const el = document.createElement('div');
                el.className = 'persistent-block';
                el.innerHTML = `
                    <div class="ulid">${block.ulid}</div>
                    <div class="file">📁 chunks/</div>
                    <div class="file">📄 index</div>
                    <div class="file">📄 meta.json</div>
                `;
                blocksContainer.appendChild(el);
            });
        }
    }

    // --- Actions ---

    // 1. Scrape (Ingest)
    btnScrape.addEventListener('click', async () => {
        if (state.isCrashed) return;

        // Ensure we have an active chunk
        if (state.headChunks.length === 0 || state.headChunks[state.headChunks.length - 1].samples >= CHUNK_MAX_SAMPLES) {
            state.headChunks.push({ id: state.chunkIdCounter++, samples: 0 });
        }

        const activeChunk = state.headChunks[state.headChunks.length - 1];
        activeChunk.samples++;
        state.walRecords++;

        log(`Scraped metrics. Appended to Head (RAM) and written to WAL (Disk).`);
        renderState();
    });

    // 2. Cut Block
    btnCut.addEventListener('click', async () => {
        if (state.isCrashed) return;

        if (state.headChunks.length === 0) {
            log("Head block is empty. No data to cut.", "warn");
            return;
        }

        btnScrape.disabled = true;
        btnCut.disabled = true;

        log("2h elapsed. Compacting Head Block to disk...");
        simStatus.textContent = "Compacting...";
        simStatus.style.color = "var(--warning-color)";
        await delay(1000);
        if(state.isCrashed) return;

        const newBlock = { ulid: generateULID() };
        state.blocks.push(newBlock);

        const oldWalCount = state.walRecords;

        state.headChunks = [];
        state.walRecords = 0; // WAL is truncated
        state.chunkIdCounter = 1;

        log(`Created immutable Block ${newBlock.ulid} (contains index, chunks, meta.json).`);
        log(`Truncated old WAL (${oldWalCount} records deleted).`);

        simStatus.textContent = "Running";
        simStatus.style.color = "";

        renderState();

        btnScrape.disabled = false;
        btnCut.disabled = false;
    });

    // 3. Crash
    btnCrash.addEventListener('click', () => {
        if (state.isCrashed) return;
        state.isCrashed = true;

        log("CRITICAL: Process Crashed! Memory lost.", "error");
        simStatus.textContent = "CRASHED";
        simStatus.style.color = "var(--danger-color)";

        // Lose RAM contents
        state.headChunks = [];

        renderState();

        btnScrape.disabled = true;
        btnCut.disabled = true;
        btnCrash.disabled = true;
        btnRecover.disabled = false;
    });

    // 4. Recover
    btnRecover.addEventListener('click', async () => {
        if (!state.isCrashed) return;

        btnRecover.disabled = true;
        log("Starting Prometheus TSDB...", "info");
        simStatus.textContent = "Recovering...";
        simStatus.style.color = "var(--warning-color)";

        await delay(800);

        if (state.walRecords > 0) {
            log(`Found WAL on disk. Replaying ${state.walRecords} records to rebuild memory state...`, "info");
            await delay(1200);

            // Replay WAL logic
            let recordsToProcess = state.walRecords;
            let recoveredChunks = [];
            state.chunkIdCounter = 1;

            while(recordsToProcess > 0) {
                let samplesInChunk = Math.min(recordsToProcess, CHUNK_MAX_SAMPLES);
                recoveredChunks.push({ id: state.chunkIdCounter++, samples: samplesInChunk });
                recordsToProcess -= samplesInChunk;
            }

            state.headChunks = recoveredChunks;
            log(`WAL replay complete. Head block fully rebuilt.`);
        } else {
             log("No WAL found (or empty). Starting clean.", "info");
        }

        state.isCrashed = false;
        simStatus.textContent = "Running";
        simStatus.style.color = "";

        renderState();

        btnScrape.disabled = false;
        btnCut.disabled = false;
        btnCrash.disabled = false;
    });

    // Initial render
    renderState();
});
