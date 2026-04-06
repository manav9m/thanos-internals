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

        // Controls
        this.flagRetentionRaw = document.getElementById('flag-retention-raw');
        this.flagDeleteDelay = document.getElementById('flag-delete-delay');
        this.btnIngest = document.getElementById('btn-ingest');
        this.btnAdvance = document.getElementById('btn-advance');
        this.btnReset = document.getElementById('btn-reset');

        this.initEventListeners();
        this.updateRetentionZone();
    }

    initEventListeners() {
        this.btnIngest.addEventListener('click', () => this.ingestBlock());
        this.btnAdvance.addEventListener('click', () => this.advanceTime());
        this.btnReset.addEventListener('click', () => this.reset());
        this.flagRetentionRaw.addEventListener('change', () => this.updateRetentionZone());
    }

    log(msg, level="info") {
        const div = document.createElement('div');
        div.textContent = `level=${level} ts=${this.timeDays}d msg="${msg}"`;
        if (level === "error") div.style.color = "var(--danger-color)";
        if (level === "warn") div.style.color = "var(--warning-color)";

        this.logPanel.appendChild(div);
        this.logPanel.scrollTop = this.logPanel.scrollHeight;
    }

    updateRetentionZone() {
        const retentionDays = parseInt(this.flagRetentionRaw.value);
        if (retentionDays === 999) {
            this.retentionZoneRaw.style.display = 'none';
        } else {
            this.retentionZoneRaw.style.display = 'block';
            // Calculate width based on maxDays (28)
            // The zone should start from the right (oldest) and cover up to retention limit
            // X-axis: 0% is 0d, 100% is 28d
            const leftPercent = (retentionDays / this.maxDays) * 100;
            const widthPercent = 100 - leftPercent;

            // Note: The blocks age and move right.
            // So the retention zone is on the right side of the timeline.
            this.retentionZoneRaw.style.left = `${Math.min(leftPercent, 100)}%`;
            this.retentionZoneRaw.style.width = `${Math.max(widthPercent, 0)}%`;
        }
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
        const deleteDelay = parseInt(this.flagDeleteDelay.value);

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
                this.createDownsampledBlock(block, '5m');
            }
            if (block.res === '5m' && block.age === downsample1hThreshold) {
                this.createDownsampledBlock(block, '1h');
            }

            // Retention & Deletion Logic (Currently only simulating Raw retention)
            if (block.res === 'raw') {
                if (!block.markedForDeletion && block.age > retentionRaw) {
                    // Mark for deletion
                    block.markedForDeletion = true;
                    block.deletionMarkedAt = block.age;

                    const markEl = block.element.querySelector('.deletion-mark');
                    tl.to(markEl, { scale: 1, opacity: 1, duration: 0.3, ease: "back.out(2)" }, 0.5);
                    this.log(`Block ${block.id} exceeded retention limit (${retentionRaw}d). Uploading deletion-mark.json.`);
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

                        this.log(`Block ${block.id} delete-delay (${deleteDelay}d) expired. Deleting files from object storage.`, "warn");
                        this.blocks.splice(i, 1);
                    }
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
