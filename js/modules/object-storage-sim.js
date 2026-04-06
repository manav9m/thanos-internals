document.addEventListener("DOMContentLoaded", () => {
    // DOM Elements
    const simCanvas = document.getElementById('sim-canvas');
    const terminal = document.getElementById('terminal');
    const statusText = document.querySelector('.sim-status');
    const providerSelect = document.getElementById('storage-provider');
    const labelsInput = document.getElementById('external-labels');

    const btnUpload = document.getElementById('btn-upload-block');
    const btnRead = document.getElementById('btn-read-block');
    const btnScenDeletion = document.getElementById('scen-deletion');
    const btnScenCorrupt = document.getElementById('scen-corrupt');
    const btnComplete = document.getElementById('mark-complete');

    // State
    let blocksInBucket = [];
    let isAnimating = false;

    // Helper: Log to terminal
    const log = (msg, type = 'info') => {
        const line = document.createElement('div');
        line.className = `log-line ${type}`;

        // Add timestamp
        const now = new Date();
        const timeStr = now.toTimeString().split(' ')[0];
        line.textContent = `[${timeStr}] ${msg}`;

        terminal.appendChild(line);
        terminal.scrollTop = terminal.scrollHeight;
    };

    const updateStatus = (msg) => {
        statusText.textContent = `Status: ${msg}`;
    };

    // Initialize SVG Canvas
    const initSVG = () => {
        simCanvas.innerHTML = `
            <svg width="100%" height="100%" viewBox="0 0 800 600" xmlns="http://www.w3.org/2000/svg">
                <defs>
                    <linearGradient id="bucketGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" style="stop-color:#34495e;stop-opacity:1" />
                        <stop offset="100%" style="stop-color:#2c3e50;stop-opacity:1" />
                    </linearGradient>
                    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                        <feGaussianBlur stdDeviation="5" result="blur" />
                        <feComposite in="SourceGraphic" in2="blur" operator="over" />
                    </filter>
                </defs>

                <!-- Cloud/Bucket representation -->
                <rect x="50" y="200" width="700" height="350" rx="15" fill="url(#bucketGrad)" stroke="#bdc3c7" stroke-width="2"/>
                <text x="400" y="230" fill="#ecf0f1" font-size="20" font-family="monospace" text-anchor="middle" font-weight="bold" id="bucket-label">Object Storage Bucket (S3)</text>
                <text x="400" y="250" fill="#95a5a6" font-size="14" font-family="monospace" text-anchor="middle">Immutable Blob Storage</text>

                <line x1="50" y1="265" x2="750" y2="265" stroke="#7f8c8d" stroke-width="1" stroke-dasharray="5,5"/>

                <!-- Groups for animations -->
                <g id="upload-anim-layer"></g>
                <g id="blocks-layer"></g>
                <g id="read-anim-layer"></g>
            </svg>
        `;
        renderBlocks();
    };

    const generateULID = () => {
        const chars = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
        let ulid = '';
        for(let i=0; i<26; i++) {
            ulid += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return ulid;
    };

    const renderBlocks = () => {
        const layer = document.getElementById('blocks-layer');
        if (!layer) return;
        layer.innerHTML = '';

        blocksInBucket.forEach((block, index) => {
            // Grid layout inside bucket: 3 blocks per row max
            const col = index % 3;
            const row = Math.floor(index / 3);
            const x = 90 + col * 220;
            const y = 290 + row * 110;

            const isDeleted = block.hasDeletionMark;

            // Block Group
            const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
            g.setAttribute("id", `block-${block.ulid}`);
            g.style.transition = "opacity 0.5s ease";

            // Main Directory/Block container
            const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            rect.setAttribute("x", x);
            rect.setAttribute("y", y);
            rect.setAttribute("width", 200);
            rect.setAttribute("height", 90);
            rect.setAttribute("rx", "5");
            rect.setAttribute("fill", isDeleted ? "#e74c3c" : "#3498db");
            rect.setAttribute("fill-opacity", isDeleted ? "0.3" : "0.8");
            rect.setAttribute("stroke", isDeleted ? "#c0392b" : "#2980b9");
            rect.setAttribute("stroke-width", "2");

            // ULID Text
            const textUlid = document.createElementNS("http://www.w3.org/2000/svg", "text");
            textUlid.setAttribute("x", x + 100);
            textUlid.setAttribute("y", y + 20);
            textUlid.setAttribute("fill", "#fff");
            textUlid.setAttribute("font-size", "12");
            textUlid.setAttribute("font-family", "monospace");
            textUlid.setAttribute("text-anchor", "middle");
            textUlid.textContent = block.ulid;

            // Files inside block
            const drawFile = (fx, fy, name, icon) => {
                const fg = document.createElementNS("http://www.w3.org/2000/svg", "g");
                const fRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
                fRect.setAttribute("x", fx);
                fRect.setAttribute("y", fy);
                fRect.setAttribute("width", 80);
                fRect.setAttribute("height", 20);
                fRect.setAttribute("rx", "2");
                fRect.setAttribute("fill", "#2c3e50");

                const fText = document.createElementNS("http://www.w3.org/2000/svg", "text");
                fText.setAttribute("x", fx + 40);
                fText.setAttribute("y", fy + 14);
                fText.setAttribute("fill", "#ecf0f1");
                fText.setAttribute("font-size", "10");
                fText.setAttribute("font-family", "monospace");
                fText.setAttribute("text-anchor", "middle");
                fText.textContent = name;

                fg.appendChild(fRect);
                fg.appendChild(fText);
                return fg;
            };

            g.appendChild(rect);
            g.appendChild(textUlid);

            // meta.json
            g.appendChild(drawFile(x + 10, y + 35, "meta.json"));
            // index
            g.appendChild(drawFile(x + 110, y + 35, "index"));
            // chunks dir
            g.appendChild(drawFile(x + 10, y + 60, "chunks/"));

            if (isDeleted) {
                g.appendChild(drawFile(x + 110, y + 60, "deletion-mark"));
            }

            layer.appendChild(g);
        });
    };

    // Handlers
    providerSelect.addEventListener('change', (e) => {
        const val = e.target.value;
        const lbl = document.getElementById('bucket-label');
        if (lbl) {
            lbl.textContent = `Object Storage Bucket (${val})`;
            log(`Storage provider switched to ${val}.`, 'info');
        }
    });

    btnUpload.addEventListener('click', () => {
        if (isAnimating) return;
        if (blocksInBucket.length >= 6) {
            log("Bucket visualization full. Clearing blocks to make space...", "warn");
            blocksInBucket = [];
            renderBlocks();
        }

        isAnimating = true;
        updateStatus("Uploading TSDB Block...");

        const provider = providerSelect.value;
        const labels = labelsInput.value;
        const ulid = generateULID();

        log(`Starting block upload to ${provider}...`, "info");

        const animLayer = document.getElementById('upload-anim-layer');
        animLayer.innerHTML = `
            <g id="upload-group" transform="translate(400, 50)">
                <rect x="-60" y="-30" width="120" height="60" rx="5" fill="#f1c40f" opacity="0.9"/>
                <text x="0" y="0" fill="#2c3e50" font-size="12" font-family="monospace" text-anchor="middle" font-weight="bold">TSDB Block</text>
                <text x="0" y="15" fill="#2c3e50" font-size="10" font-family="monospace" text-anchor="middle">Uploading...</text>
            </g>
        `;

        const group = document.getElementById('upload-group');
        let progress = 0;
        const animateUpload = setInterval(() => {
            progress += 5;
            const yPos = 50 + (progress * 1.5);
            group.setAttribute('transform', `translate(400, ${yPos})`);

            if (progress >= 100) {
                clearInterval(animateUpload);
                animLayer.innerHTML = '';

                blocksInBucket.push({
                    ulid: ulid,
                    labels: labels,
                    hasDeletionMark: false
                });

                renderBlocks();
                log(`Block ${ulid} uploaded successfully.`, "success");
                log(`meta.json generated with labels: {${labels}}`, "info");
                updateStatus("Ready");
                isAnimating = false;
            }
        }, 30);
    });

    btnRead.addEventListener('click', () => {
        if (isAnimating) return;
        if (blocksInBucket.length === 0) {
            log("No blocks in bucket to read.", "error");
            return;
        }

        isAnimating = true;
        updateStatus("Store Gateway reading blocks...");
        log("Simulating Store Gateway read API (Range GETs)...", "info");

        // Flash blocks to simulate reading
        const layer = document.getElementById('blocks-layer');
        let toggle = false;
        let flashes = 0;

        const flashAnim = setInterval(() => {
            Array.from(layer.children).forEach(g => {
                const rect = g.querySelector('rect');
                if(rect) {
                    // Skip if deletion marked
                    const isDel = rect.getAttribute("fill-opacity") === "0.3";
                    if(!isDel) {
                        rect.setAttribute("fill", toggle ? "#2ecc71" : "#3498db");
                    }
                }
            });
            toggle = !toggle;
            flashes++;

            if (flashes > 5) {
                clearInterval(flashAnim);
                Array.from(layer.children).forEach(g => {
                    const rect = g.querySelector('rect');
                    if(rect) {
                        const isDel = rect.getAttribute("fill-opacity") === "0.3";
                        if(!isDel) rect.setAttribute("fill", "#3498db");
                    }
                });
                log("Read successful. Blocks grouped by external labels.", "success");
                updateStatus("Ready");
                isAnimating = false;
            }
        }, 200);
    });

    btnScenDeletion.addEventListener('click', () => {
        if (isAnimating) return;
        if (blocksInBucket.length === 0) {
            log("Please upload a block first to run the deletion scenario.", "error");
            return;
        }

        isAnimating = true;
        updateStatus("Scenario: Immutable Deletion");
        log("SCENARIO: Compactor or user requested deletion of a block.", "info");
        log("Because Object Storage files are IMMUTABLE in Thanos, the block is NOT deleted immediately.", "warn");

        const targetBlockIndex = blocksInBucket.findIndex(b => !b.hasDeletionMark);
        if (targetBlockIndex === -1) {
            log("All blocks are already marked for deletion. Upload more.", "error");
            isAnimating = false;
            return;
        }

        const targetBlock = blocksInBucket[targetBlockIndex];

        setTimeout(() => {
            log(`Creating 'deletion-mark.json' for block ${targetBlock.ulid}...`, "info");
            targetBlock.hasDeletionMark = true;
            renderBlocks();
            log("Block marked for deletion. It will be ignored by readers and hard-deleted after the delay period.", "success");
            updateStatus("Ready");
            isAnimating = false;
        }, 1500);
    });

    btnScenCorrupt.addEventListener('click', () => {
        if (isAnimating) return;
        isAnimating = true;
        updateStatus("Scenario: Missing Index");
        log("SCENARIO: Attempting to read a block where 'index' file failed to upload or is corrupted.", "warn");

        setTimeout(() => {
            log("Store Gateway sync process discovers block...", "info");
            setTimeout(() => {
                log("ERROR: ObjectStorage: Failed to fetch index for block.", "error");
                log("Thanos ignores blocks with missing critical files (like index or meta.json) to prevent partial reads.", "info");
                updateStatus("Ready");
                isAnimating = false;
            }, 1000);
        }, 1000);
    });

    if (btnComplete) {
        btnComplete.addEventListener('click', () => {
            if (window.ThanosApp && typeof window.ThanosApp.markLabComplete === 'function') {
                window.ThanosApp.markLabComplete('object-storage');
                btnComplete.innerHTML = '<i class="fas fa-check-double"></i> Completed';
                btnComplete.style.background = '#27ae60';
                log("Lab marked as complete!", "success");
            } else {
                log("Global app framework not found. Cannot save progress.", "error");
            }
        });
    }

    // Boot
    initSVG();
    log("Object Storage simulation initialized. Provider: S3.", "info");
});
