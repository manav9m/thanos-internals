// TSDB Internals Simulation Logic

document.addEventListener('DOMContentLoaded', () => {
    // --- State ---
    let state = {
        headChunks: [], // active chunks in memory
        mmapChunks: 0,  // count of flushed chunks on disk
        walRecords: 0,  // count of WAL appends
        blocks: 0,      // count of persistent blocks
        isCrashed: false,
        chunkIdCounter: 1
    };

    const CHUNK_MAX_SAMPLES = 4; // Simulated small capacity for fast visual feedback

    // --- DOM Elements ---
    const headContainer = document.getElementById('head-chunks');
    const walContainer = document.getElementById('wal-records');
    const mmapContainer = document.getElementById('mmap-chunks');
    const blocksContainer = document.getElementById('persistent-blocks');
    const logPanel = document.getElementById('log-panel');

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
    function log(msg, level = 'info') {
        const line = document.createElement('div');
        line.textContent = `level=${level} msg="${msg}"`;
        if (level === 'warn') line.style.color = 'yellow';
        if (level === 'error') line.style.color = 'red';
        logPanel.appendChild(line);
        logPanel.scrollTop = logPanel.scrollHeight;
    }

    const delay = ms => new Promise(res => setTimeout(res, ms));

    function renderState() {
        // Render Head Chunks
        headContainer.innerHTML = '';
        state.headChunks.forEach(chunk => {
            const el = document.createElement('div');
            el.className = `memory-chunk ${chunk.samples >= CHUNK_MAX_SAMPLES ? 'full' : ''}`;
            el.innerHTML = `${chunk.samples}/${CHUNK_MAX_SAMPLES}`;
            headContainer.appendChild(el);
        });

        // Render WAL
        walContainer.innerHTML = '';
        for (let i = 0; i < state.walRecords; i++) {
            const el = document.createElement('div');
            el.className = 'wal-record';
            el.textContent = 'Rec';
            walContainer.appendChild(el);
        }

        // Render MMAP
        mmapContainer.innerHTML = '';
        for (let i = 0; i < state.mmapChunks; i++) {
            const el = document.createElement('div');
            el.className = 'mmap-chunk';
            el.textContent = 'mmap';
            mmapContainer.appendChild(el);
        }

        // Render Blocks
        blocksContainer.innerHTML = '';
        for (let i = 0; i < state.blocks; i++) {
            const el = document.createElement('div');
            el.className = 'persistent-block';
            el.innerHTML = `<div>Block ${i+1}</div><div class="size">2h span</div>`;
            blocksContainer.appendChild(el);
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

        log(`Appended samples to Head chunk ID:${activeChunk.id}. Written to WAL.`);
        renderState();

        // Check for mmap condition
        if (activeChunk.samples >= CHUNK_MAX_SAMPLES) {
            log(`Chunk ID:${activeChunk.id} is full. Memory-mapping to disk...`);
            await delay(500); // UI visual delay
            if(state.isCrashed) return; // safety

            // Move from head to mmap (in a real TSDB, head holds multiple chunks, but we simplify visually)
            state.mmapChunks++;
            // Remove full chunks from RAM to simulate memory clearing
            state.headChunks = state.headChunks.filter(c => c.samples < CHUNK_MAX_SAMPLES);

            log(`Chunk memory-mapped. RAM freed.`);
            renderState();
        }
    });

    // 2. Cut Block
    btnCut.addEventListener('click', async () => {
        if (state.isCrashed) return;

        if (state.mmapChunks === 0 && state.headChunks.length === 0) {
            log("No data to cut into a block.", "warn");
            return;
        }

        btnScrape.disabled = true;
        btnCut.disabled = true;

        log("2h elapsed. Cutting new persistent block...");
        await delay(1000);
        if(state.isCrashed) return;

        // Take all mmap chunks + flush active head to form a block
        const chunksCompacted = state.mmapChunks + state.headChunks.length;

        state.blocks++;
        state.mmapChunks = 0;
        state.headChunks = [];
        state.walRecords = 0; // WAL is truncated

        log(`Block created with ${chunksCompacted} chunks. WAL truncated.`);
        renderState();

        btnScrape.disabled = false;
        btnCut.disabled = false;
    });

    // 3. Crash
    btnCrash.addEventListener('click', () => {
        if (state.isCrashed) return;
        state.isCrashed = true;

        log("PROCESS CRASHED! Memory lost.", "error");

        // Lose RAM contents
        state.headChunks = [];
        // MMAP chunks are strictly on disk, but TSDB needs to rebuild index.
        // For visual simplicity, we'll keep mmap on disk but clear RAM.

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
        log("Starting TSDB. Replaying WAL...", "info");

        await delay(1000);

        // Replay WAL logic (rebuild head chunks based on WAL records)
        let recordsToProcess = state.walRecords;
        let recoveredChunks = [];

        while(recordsToProcess > 0) {
            let samplesInChunk = Math.min(recordsToProcess, CHUNK_MAX_SAMPLES);
            recoveredChunks.push({ id: state.chunkIdCounter++, samples: samplesInChunk });
            recordsToProcess -= samplesInChunk;
        }

        state.headChunks = recoveredChunks;

        log(`WAL replay complete. Recovered ${state.walRecords} records into memory.`);

        state.isCrashed = false;
        renderState();

        btnScrape.disabled = false;
        btnCut.disabled = false;
        btnCrash.disabled = false;
    });

    // Initial render
    renderState();
});
