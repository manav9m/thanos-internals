class RetentionSimulation {
    constructor() {
        this.blocks = [];
        this.timeDays = 0;
        this.maxDays = 28; // Represents the timeline width

        // DOM Elements
        this.laneRaw = document.getElementById('lane-raw');
        this.lane5m = document.getElementById('lane-5m');
        this.lane1h = document.getElementById('lane-1h');
        this.retentionZoneRaw = document.getElementById('retention-zone-raw');
        this.logPanel = document.getElementById('log-panel');

        this.retentionZone5m = document.getElementById('retention-zone-5m');
        this.retentionZone1h = document.getElementById('retention-zone-1h');

        // Controls
        this.flagRetentionRaw = document.getElementById('flag-retention-raw');
        this.flagRetention5m = document.getElementById('flag-retention-5m');
        this.flagRetention1h = document.getElementById('flag-retention-1h');
        this.flagDeleteDelay = document.getElementById('flag-delete-delay');
        this.btnIngest = document.getElementById('btn-ingest');
        this.btnAdvance = document.getElementById('btn-advance');
        this.btnReset = document.getElementById('btn-reset');

        this.initEventListeners();
        this.updateRetentionZones();
    }

    initEventListeners() {
        this.btnIngest.addEventListener('click', () => this.ingestBlock());
        this.btnAdvance.addEventListener('click', () => this.advanceTime());
        this.btnReset.addEventListener('click', () => this.reset());
        this.flagRetentionRaw.addEventListener('change', () => this.updateRetentionZones());
        this.flagRetention5m.addEventListener('change', () => this.updateRetentionZones());
        this.flagRetention1h.addEventListener('change', () => this.updateRetentionZones());
    }

    log(msg, level="info") {
        const div = document.createElement('div');
        div.textContent = `level=${level} ts=${this.timeDays}d msg="${msg}"`;
        if (level === "error") div.style.color = "var(--danger-color)";
        if (level === "warn") div.style.color = "var(--warning-color)";

        this.logPanel.appendChild(div);
        this.logPanel.scrollTop = this.logPanel.scrollHeight;
    }

    updateRetentionZones() {
        const updateZone = (flagElement, zoneElement) => {
            const retentionDays = parseInt(flagElement.value);
            if (retentionDays === 999) {
                zoneElement.style.display = 'none';
            } else {
                zoneElement.style.display = 'block';
                // Calculate width based on maxDays (28)
                const leftPercent = (retentionDays / this.maxDays) * 100;
                const widthPercent = 100 - leftPercent;

                zoneElement.style.left = `${Math.min(leftPercent, 100)}%`;
                zoneElement.style.width = `${Math.max(widthPercent, 0)}%`;
            }
        };

        updateZone(this.flagRetentionRaw, this.retentionZoneRaw);
        updateZone(this.flagRetention5m, this.retentionZone5m);
        updateZone(this.flagRetention1h, this.retentionZone1h);
    }

    createBlockElement(block) {
        const el = document.createElement('div');
        el.className = `ts-block res-${block.res}`;
        el.id = `block-${block.id}`;

        const resText = block.res === 'raw' ? '0s' : block.res === '5m' ? '5m' : '1h';
        el.innerHTML = `
            <div>${resText}</div>
            <div class="age">${block.age}d</div>
            <div class="deletion-mark">X</div>
        `;

        // Initial position (left = 0)
        gsap.set(el, { x: 0, y: 15 }); // y offset to center in lane

        if (block.res === 'raw') this.laneRaw.appendChild(el);
        if (block.res === '5m') this.lane5m.appendChild(el);
        if (block.res === '1h') this.lane1h.appendChild(el);

        return el;
    }

    ingestBlock() {
        const id = Math.random().toString(36).substr(2, 5);
        const block = {
            id: id,
            res: 'raw',
            age: 0,
            markedForDeletion: false,
            deletionMarkedAt: null
        };

        this.blocks.push(block);
        block.element = this.createBlockElement(block);

        // Animate entrance
        gsap.from(block.element, { scale: 0, opacity: 0, duration: 0.5, ease: "back.out(1.7)" });
        this.log(`Ingested new raw block ${id}`);
    }

    advanceTime() {
        this.timeDays += 1;
        this.log(`Advanced time to ${this.timeDays}d`);

        const retentionRaw = parseInt(this.flagRetentionRaw.value);
        const retention5m = parseInt(this.flagRetention5m.value);
        const retention1h = parseInt(this.flagRetention1h.value);
        const deleteDelay = parseInt(this.flagDeleteDelay.value);

        const getRetentionLimit = (res) => {
            if (res === 'raw') return retentionRaw;
            if (res === '5m') return retention5m;
            if (res === '1h') return retention1h;
            return 999;
        };

        // Downsampling thresholds (fixed for simulation)
        const downsample5mThreshold = 2; // e.g., 40h
        const downsample1hThreshold = 10; // e.g., 10d

        const tl = gsap.timeline();

        // Process blocks backwards to allow safe removal
        for (let i = this.blocks.length - 1; i >= 0; i--) {
            const block = this.blocks[i];
            block.age += 1;

            // Update age text
            block.element.querySelector('.age').textContent = `${block.age}d`;

            // Calculate new X position (percentage of parent container width)
            // 0d -> 0%, 28d -> 100%
            const parentWidth = this.laneRaw.clientWidth;
            const targetX = (block.age / this.maxDays) * parentWidth;

            // Only move if within visible bounds
            if (targetX <= parentWidth + 100) {
                 tl.to(block.element, { x: targetX, duration: 0.5, ease: "power1.inOut" }, 0);
            }

            // Downsampling logic (simulating creation of new blocks)
            if (block.res === 'raw' && block.age === downsample5mThreshold) {
                // Check if raw data is retained long enough to downsample
                if (retentionRaw >= downsample5mThreshold) {
                    this.createDownsampledBlock(block, '5m');
                } else {
                    this.log(`Warning: Raw block ${block.id} was deleted before downsampling to 5m could occur.`, "warn");
                }
            }
            if (block.res === '5m' && block.age === downsample1hThreshold) {
                // Check if 5m data is retained long enough to downsample
                if (retention5m >= downsample1hThreshold) {
                    this.createDownsampledBlock(block, '1h');
                } else {
                    this.log(`Warning: 5m block for ${block.id} was deleted before downsampling to 1h could occur.`, "warn");
                }
            }

            // Retention & Deletion Logic (Apply to all resolutions independently)
            const retentionLimit = getRetentionLimit(block.res);

            if (!block.markedForDeletion && block.age > retentionLimit) {
                // Mark for deletion
                block.markedForDeletion = true;
                block.deletionMarkedAt = block.age;

                const markEl = block.element.querySelector('.deletion-mark');
                tl.to(markEl, { scale: 1, opacity: 1, duration: 0.3, ease: "back.out(2)" }, 0.5);
                this.log(`Block ${block.id} (${block.res}) exceeded retention limit (${retentionLimit}d). Uploading deletion-mark.json.`);
            }

            if (block.markedForDeletion) {
                const daysSinceMark = block.age - block.deletionMarkedAt;
                if (daysSinceMark >= deleteDelay) {
                    // Actually delete
                    tl.to(block.element, {
                        scale: 0,
                        opacity: 0,
                        duration: 0.5,
                        onComplete: () => {
                            if (block.element && block.element.parentNode) {
                                block.element.parentNode.removeChild(block.element);
                            }
                        }
                    }, 0.8);

                    this.log(`Block ${block.id} (${block.res}) delete-delay (${deleteDelay}d) expired. Deleting files from object storage.`, "warn");
                    this.blocks.splice(i, 1);
                }
            }
        }
    }

    createDownsampledBlock(sourceBlock, newRes) {
        const newId = `${sourceBlock.id}-${newRes}`;
        const newBlock = {
            id: newId,
            res: newRes,
            age: sourceBlock.age,
            markedForDeletion: false,
            deletionMarkedAt: null
        };

        this.blocks.push(newBlock);
        newBlock.element = this.createBlockElement(newBlock);

        // Start position
        const parentWidth = this.laneRaw.clientWidth;
        const startX = (newBlock.age / this.maxDays) * parentWidth;
        gsap.set(newBlock.element, { x: startX, y: -50, opacity: 0 }); // Start slightly higher

        // Animate entrance
        gsap.to(newBlock.element, { y: 15, opacity: 1, duration: 0.5, ease: "power2.out" });
        this.log(`Downsampled block ${sourceBlock.id} to ${newRes} resolution.`);
    }

    reset() {
        this.blocks.forEach(b => {
            if (b.element && b.element.parentNode) {
                b.element.parentNode.removeChild(b.element);
            }
        });
        this.blocks = [];
        this.timeDays = 0;
        this.logPanel.innerHTML = '<div>level=info msg="Simulator reset"</div>';
        this.updateRetentionZone();
    }
}

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    window.retentionSim = new RetentionSimulation();

    // Add gamification hook
    const btnComplete = document.getElementById('mark-complete-btn');
    const labId = 'retention';

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
});
