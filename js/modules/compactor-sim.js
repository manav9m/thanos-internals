// ═══════════════════════════════════════════════════════
// Thanos Compactor Lab — Full Simulation Engine
// Accurate to thanos.io/tip/components/compact.md
// ═══════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {

// ─── CONSTANTS ───
// Prometheus TSDB compaction range progression (in hours)
const COMPACTION_RANGES = [2, 6, 24, 48, 96, 192, 336];
const DS_5M_THRESHOLD_H = 40;   // 40 hours for 5m downsampling
const DS_1H_THRESHOLD_H = 240;  // 10 days = 240 hours for 1h downsampling

// ─── DOM REFS ───
const laneRawBlocks = document.getElementById('lane-raw-blocks');
const lane5mBlocks = document.getElementById('lane-5m-blocks');
const lane1hBlocks = document.getElementById('lane-1h-blocks');
const rawCount = document.getElementById('raw-count');
const ds5mCount = document.getElementById('ds5m-count');
const ds1hCount = document.getElementById('ds1h-count');
const overlay5m = document.getElementById('overlay-5m');
const overlay1h = document.getElementById('overlay-1h');
const logPanel = document.getElementById('log-panel');
const cliOutput = document.getElementById('cli-output');
const timeSlider = document.getElementById('time-slider');
const timeDisplay = document.getElementById('time-display');
const retWarning = document.getElementById('retention-warning');
const singletonErr = document.getElementById('singleton-error');
const dsStatusLabel = document.getElementById('ds-status-label');

// Buttons
const btnUploadRaw = document.getElementById('btn-upload-raw');
const btnUploadDiff = document.getElementById('btn-upload-diff');
const btnUploadReplica = document.getElementById('btn-upload-replica');
const btnCompact = document.getElementById('btn-compact');
const btnMultiErr = document.getElementById('btn-multi-error');
const btnReset = document.getElementById('btn-reset');
const btnCopyCli = document.getElementById('btn-copy-cli');

// Config controls
const cfgConsistency = document.getElementById('cfg-consistency-delay');
const cfgDsDisable = document.getElementById('cfg-downsampling-disable');
const cfgRetRaw = document.getElementById('cfg-ret-raw');
const cfgRet5m = document.getElementById('cfg-ret-5m');
const cfgRet1h = document.getElementById('cfg-ret-1h');
const cfgDeleteDelay = document.getElementById('cfg-delete-delay');
const cfgWaitInterval = document.getElementById('cfg-wait-interval');
const cfgCompactConc = document.getElementById('cfg-compact-conc');
const cfgDsConc = document.getElementById('cfg-ds-conc');

// ─── STATE ───
let blocks = [];         // all blocks (raw, 5m, 1h)
let blockIdCounter = 0;
let simTimeH = 0;        // simulated current time in hours
let isRunning = false;
let isHalted = false;    // singleton error halted state
let uploadTimeOffset = 0; // hours offset for sequential block uploads
let logTime = 0;

// ─── ULID GENERATOR (simplified) ───
function genULID() {
    const chars = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    let s = '';
    for (let i = 0; i < 10; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
}

// ─── LOGGING ───
function log(msg, type = 'info') {
    logTime++;
    const ts = String(Math.floor(logTime / 3600)).padStart(2, '0') + ':' +
               String(Math.floor((logTime % 3600) / 60)).padStart(2, '0') + ':' +
               String(logTime % 60).padStart(2, '0');
    const div = document.createElement('div');
    div.className = `log-line log-${type}`;
    div.textContent = `[${ts}] ${msg}`;
    logPanel.appendChild(div);
    logPanel.scrollTop = logPanel.scrollHeight;
}

// ─── PHASE INDICATOR ───
function setPhase(phase) {
    document.querySelectorAll('.phase-step').forEach(el => {
        el.classList.remove('active', 'done');
    });
    if (!phase) return;
    const steps = document.querySelectorAll('.phase-step');
    let found = false;
    steps.forEach(el => {
        if (el.dataset.phase === phase) {
            el.classList.add('active');
            found = true;
        } else if (!found) {
            el.classList.add('done');
        }
    });
}

// ─── HELPERS ───
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function hoursToHuman(h) {
    if (h < 24) return h + 'h';
    if (h < 48) return '1d';
    const d = Math.floor(h / 24);
    return d + 'd';
}

function getLevel(durationH) {
    for (let i = 0; i < COMPACTION_RANGES.length; i++) {
        if (durationH <= COMPACTION_RANGES[i]) return i + 1;
    }
    return COMPACTION_RANGES.length;
}

function labelKey(labels) {
    return Object.entries(labels).sort((a,b) => a[0].localeCompare(b[0])).map(([k,v]) => `${k}="${v}"`).join(', ');
}

function labelsMatch(a, b) { return labelKey(a) === labelKey(b); }

// ─── RENDER BLOCKS ───
function renderBlocks() {
    laneRawBlocks.innerHTML = '';
    lane5mBlocks.innerHTML = '';
    lane1hBlocks.innerHTML = '';

    let rCnt = 0, d5Cnt = 0, d1Cnt = 0;

    blocks.forEach(b => {
        const card = document.createElement('div');
        const level = getLevel(b.durationH);
        const levelClass = b.resolution === 'raw' ? `level-${Math.min(level, 4)}` : `res-${b.resolution}`;
        let classes = `block-card ${levelClass}`;
        if (b.animClass) classes += ` ${b.animClass}`;
        card.className = classes;

        const ageH = Math.max(0, simTimeH - b.minTime);
        const lk = labelKey(b.labels);

        let badgesHTML = '';
        if (b.resolution === 'raw') {
            badgesHTML += `<span class="bc-badge lvl">L${level}</span>`;
        } else {
            badgesHTML += `<span class="bc-badge res">${b.resolution}</span>`;
        }

        let extraHTML = '';
        if (b.deletionMark) {
            extraHTML = `<div class="bc-deletion">🗑 deletion-mark.json</div>`;
        }

        // Eligibility glow
        if (b.resolution === 'raw' && ageH >= DS_5M_THRESHOLD_H && !cfgDsDisable.checked) {
            const has5m = blocks.some(x => x.resolution === '5m' && x.minTime === b.minTime && x.maxTime === b.maxTime && labelsMatch(x.labels, b.labels));
            if (!has5m && !b.animClass) card.className += ' eligible-5m';
        }
        if (b.resolution === '5m' && ageH >= DS_1H_THRESHOLD_H && !cfgDsDisable.checked) {
            const has1h = blocks.some(x => x.resolution === '1h' && x.minTime === b.minTime && x.maxTime === b.maxTime && labelsMatch(x.labels, b.labels));
            if (!has1h && !b.animClass) card.className += ' eligible-1h';
        }

        card.innerHTML = `
            <div class="bc-labels" title="${lk}">${lk}</div>
            <div class="bc-time">${hoursToHuman(b.durationH)}</div>
            <div class="bc-meta">${badgesHTML}</div>
            <div class="bc-age">age: ${hoursToHuman(ageH)} | ${b.minTime}h–${b.maxTime}h</div>
            ${extraHTML}
        `;

        if (b.resolution === 'raw') { laneRawBlocks.appendChild(card); rCnt++; }
        else if (b.resolution === '5m') { lane5mBlocks.appendChild(card); d5Cnt++; }
        else { lane1hBlocks.appendChild(card); d1Cnt++; }
    });

    rawCount.textContent = rCnt + ' blocks';
    ds5mCount.textContent = d5Cnt + ' blocks';
    ds1hCount.textContent = d1Cnt + ' blocks';
}

// ─── CLI FLAGS ───
function updateCLI() {
    const cd = cfgConsistency.value;
    const rr = cfgRetRaw.value;
    const r5 = cfgRet5m.value;
    const r1 = cfgRet1h.value;
    const dd = cfgDeleteDelay.value;
    const wi = cfgWaitInterval.value;
    const cc = cfgCompactConc.value;
    const dc = cfgDsConc.value;
    const ds = cfgDsDisable.checked;

    let cmd = `thanos compact \\
  --data-dir=/var/thanos/compact \\
  --objstore.config-file=/etc/thanos/objstore.yaml \\
  --consistency-delay=${cd}m \\
  --retention.resolution-raw=${rr === '0' ? '0d' : hoursToHuman(parseInt(rr))} \\
  --retention.resolution-5m=${r5 === '0' ? '0d' : hoursToHuman(parseInt(r5))} \\
  --retention.resolution-1h=${r1 === '0' ? '0d' : hoursToHuman(parseInt(r1))} \\
  --delete-delay=${dd}h \\
  --wait \\
  --wait-interval=${wi}m \\
  --compact.concurrency=${cc} \\
  --downsample.concurrency=${dc}`;
    if (ds) cmd += ` \\\n  --downsampling.disable`;
    cliOutput.textContent = cmd;
}

// ─── RETENTION WARNING CHECK ───
function checkRetentionWarning() {
    const rawH = parseInt(cfgRetRaw.value);
    const dsDisabled = cfgDsDisable.checked;
    if (!dsDisabled && rawH > 0 && rawH < DS_5M_THRESHOLD_H) {
        retWarning.classList.add('visible');
    } else {
        retWarning.classList.remove('visible');
    }
}

// ─── DOWNSAMPLING OVERLAY ───
function updateDsOverlay() {
    const disabled = cfgDsDisable.checked;
    overlay5m.classList.toggle('visible', disabled);
    overlay1h.classList.toggle('visible', disabled);
    dsStatusLabel.textContent = disabled ? 'Disabled' : 'Enabled';
    dsStatusLabel.style.color = disabled ? 'var(--red)' : 'var(--green)';
}

// ─── UPLOAD BLOCK ───
function uploadBlock(labels) {
    if (isRunning || isHalted) return;
    blockIdCounter++;
    const ulid = genULID();
    const minTime = uploadTimeOffset;
    const maxTime = minTime + 2;
    uploadTimeOffset += 2;

    // Update slider if needed
    if (maxTime > simTimeH) {
        simTimeH = maxTime;
        timeSlider.value = simTimeH;
        updateTimeDisplay();
    }

    const block = {
        id: blockIdCounter,
        ulid: ulid,
        resolution: 'raw',
        durationH: 2,
        minTime: minTime,
        maxTime: maxTime,
        labels: { ...labels },
        compactionLevel: 1,
        animClass: '',
        deletionMark: false,
        deletionMarkTime: null
    };
    blocks.push(block);
    log(`Sidecar uploaded 2h raw block ${ulid} (${labelKey(labels)}) [${minTime}h–${maxTime}h]`);
    renderBlocks();
}

// ─── COMPACTION CYCLE ───
async function runCompactor() {
    if (isRunning || isHalted) return;
    isRunning = true;
    disableButtons(true);

    log('Compactor started. Mode: --wait --wait-interval=' + cfgWaitInterval.value + 'm');

    // Phase 1: Scan
    setPhase('scan');
    log('Scanning bucket...');
    await sleep(1200);

    const consistencyH = parseInt(cfgConsistency.value) / 60;
    // Filter blocks not too fresh
    const processable = blocks.filter(b => (simTimeH - b.maxTime) >= consistencyH);
    const skipped = blocks.length - processable.length;
    if (skipped > 0) log(`Skipping ${skipped} blocks younger than consistency-delay (${cfgConsistency.value}m).`, 'warn');

    // Group by external labels (raw blocks only for compaction)
    const groups = {};
    processable.filter(b => b.resolution === 'raw' && !b.deletionMark).forEach(b => {
        const key = labelKey(b.labels);
        if (!groups[key]) groups[key] = [];
        groups[key].push(b);
    });

    const groupKeys = Object.keys(groups);
    log(`Found ${processable.length} blocks across ${groupKeys.length} compaction group(s).`);
    groupKeys.forEach(k => log(`  Group: {${k}} → ${groups[k].length} blocks`));

    // Phase 2: Plan
    setPhase('plan');
    log('Planning compaction...');
    await sleep(1000);

    // Phase 3: Compact — using range ladder
    // Exhaustively compact ALL eligible groups at each level, then cascade up.
    // This mirrors real Thanos/Prometheus behavior: compact all 2h→6h first,
    // then all 6h→24h, then 24h→48h, etc. within a single cycle.
    setPhase('compact');
    for (const [grpKey, grpBlocks] of Object.entries(groups)) {
        const grpLabels = grpBlocks[0].labels;

        // Walk up the range ladder
        for (let ri = 1; ri < COMPACTION_RANGES.length; ri++) {
            const targetRange = COMPACTION_RANGES[ri];
            const sourceRange = COMPACTION_RANGES[ri - 1];
            const needed = Math.round(targetRange / sourceRange);

            // Keep compacting at this level until we can't anymore
            let mergedAny = true;
            while (mergedAny) {
                mergedAny = false;

                // Re-query candidates from current block state (important: blocks array mutates)
                const candidates = blocks.filter(b =>
                    b.resolution === 'raw' &&
                    !b.deletionMark &&
                    labelsMatch(b.labels, grpLabels) &&
                    b.durationH === sourceRange &&
                    (simTimeH - b.maxTime) >= consistencyH
                ).sort((a, b) => a.minTime - b.minTime);

                if (candidates.length < needed) break;

                // Take the first `needed` time-sorted blocks
                const toMerge = candidates.slice(0, needed);

                log(`Range ${hoursToHuman(sourceRange)}→${hoursToHuman(targetRange)}: blocks [${toMerge.map(b => b.ulid).join(', ')}] qualify (${toMerge.length} blocks fill ${hoursToHuman(targetRange)} window)`);

                // Animate compacting
                toMerge.forEach(b => { b.animClass = 'compacting'; });
                renderBlocks();
                await sleep(1500);

                // Compute merged block
                const newMin = Math.min(...toMerge.map(b => b.minTime));
                const newMax = Math.max(...toMerge.map(b => b.maxTime));
                const newUlid = genULID();
                const newLevel = getLevel(targetRange);

                // Remove sources
                const mergeIds = new Set(toMerge.map(b => b.id));
                blocks = blocks.filter(b => !mergeIds.has(b.id));

                // Add merged
                blockIdCounter++;
                blocks.push({
                    id: blockIdCounter,
                    ulid: newUlid,
                    resolution: 'raw',
                    durationH: targetRange,
                    minTime: newMin,
                    maxTime: newMax,
                    labels: { ...toMerge[0].labels },
                    compactionLevel: newLevel,
                    animClass: '',
                    deletionMark: false,
                    deletionMarkTime: null
                });

                log(`Compacted [${toMerge.map(b => b.ulid).join(', ')}] → new block ${newUlid} (${hoursToHuman(targetRange)}, L${newLevel})`, 'success');
                renderBlocks();
                await sleep(600);
                mergedAny = true;
            }
        }
    }

    // Phase 4: Downsampling 5m
    if (!cfgDsDisable.checked) {
        setPhase('ds5m');
        log('Checking downsampling eligibility (5m pass)...');
        await sleep(1000);

        let ds5Created = 0;
        const rawForDs = blocks.filter(b => b.resolution === 'raw' && !b.deletionMark);
        for (const b of rawForDs) {
            const age = simTimeH - b.minTime;
            if (age >= DS_5M_THRESHOLD_H) {
                const already = blocks.some(x => x.resolution === '5m' && x.minTime === b.minTime && x.maxTime === b.maxTime && labelsMatch(x.labels, b.labels));
                if (!already) {
                    log(`Block ${b.ulid} (age: ${Math.round(age)}h) qualifies for 5m downsampling (threshold: ${DS_5M_THRESHOLD_H}h)`);
                    b.animClass = 'compacting';
                    renderBlocks();
                    await sleep(1200);

                    blockIdCounter++;
                    blocks.push({
                        id: blockIdCounter,
                        ulid: genULID(),
                        resolution: '5m',
                        durationH: b.durationH,
                        minTime: b.minTime,
                        maxTime: b.maxTime,
                        labels: { ...b.labels },
                        compactionLevel: b.compactionLevel,
                        animClass: '',
                        deletionMark: false,
                        deletionMarkTime: null
                    });
                    b.animClass = '';
                    ds5Created++;
                    log(`Created 5m downsampled block for ${b.ulid}`, 'success');
                    renderBlocks();
                    await sleep(600);
                }
            }
        }
        if (ds5Created === 0) log('No blocks qualify for 5m downsampling.');

        // Phase 5: Downsampling 1h (from 5m blocks, NOT raw)
        setPhase('ds1h');
        log('Checking downsampling eligibility (1h pass — from 5m blocks)...');
        await sleep(1000);

        let ds1Created = 0;
        const fivemBlocks = blocks.filter(b => b.resolution === '5m' && !b.deletionMark);
        for (const b of fivemBlocks) {
            const age = simTimeH - b.minTime;
            if (age >= DS_1H_THRESHOLD_H) {
                const already = blocks.some(x => x.resolution === '1h' && x.minTime === b.minTime && x.maxTime === b.maxTime && labelsMatch(x.labels, b.labels));
                if (!already) {
                    log(`5m block (age: ${Math.round(age)}h / ${Math.round(age/24)}d) qualifies for 1h downsampling (threshold: ${DS_1H_THRESHOLD_H}h = 10d)`);
                    blockIdCounter++;
                    blocks.push({
                        id: blockIdCounter,
                        ulid: genULID(),
                        resolution: '1h',
                        durationH: b.durationH,
                        minTime: b.minTime,
                        maxTime: b.maxTime,
                        labels: { ...b.labels },
                        compactionLevel: b.compactionLevel,
                        animClass: '',
                        deletionMark: false,
                        deletionMarkTime: null
                    });
                    ds1Created++;
                    log(`Created 1h downsampled block (from 5m source)`, 'success');
                    renderBlocks();
                    await sleep(600);
                }
            }
        }
        if (ds1Created === 0) log(`No blocks qualify for 1h downsampling (threshold: 10 days / ${DS_1H_THRESHOLD_H}h).`);
    } else {
        log('Downsampling skipped (--downsampling.disable is set).', 'warn');
    }

    // Phase 6: Retention
    setPhase('retention');
    const retRawH = parseInt(cfgRetRaw.value);
    const ret5mH = parseInt(cfgRet5m.value);
    const ret1hH = parseInt(cfgRet1h.value);
    const deleteDelayH = parseInt(cfgDeleteDelay.value);

    log(`Applying retention: raw=${retRawH ? hoursToHuman(retRawH) : 'forever'}, 5m=${ret5mH ? hoursToHuman(ret5mH) : 'forever'}, 1h=${ret1hH ? hoursToHuman(ret1hH) : 'forever'}`);
    await sleep(1000);

    // Check each resolution
    function applyRetention(resolution, retH) {
        if (retH <= 0) return;
        blocks.filter(b => b.resolution === resolution && !b.deletionMark).forEach(b => {
            const blockAge = simTimeH - b.maxTime;
            if (blockAge > retH) {
                b.deletionMark = true;
                b.deletionMarkTime = simTimeH;
                log(`Marked ${resolution} block ${b.ulid} for deletion (maxTime age: ${Math.round(blockAge)}h > retention ${retH}h). deletion-mark.json written.`, 'warn');
            }
        });
    }
    applyRetention('raw', retRawH);
    applyRetention('5m', ret5mH);
    applyRetention('1h', ret1hH);

    // Process delete-delay: physically remove blocks where deletion mark is old enough
    const toPhysicallyDelete = blocks.filter(b => b.deletionMark && b.deletionMarkTime !== null && (simTimeH - b.deletionMarkTime) >= deleteDelayH);
    if (toPhysicallyDelete.length > 0) {
        toPhysicallyDelete.forEach(b => { b.animClass = 'deleting'; });
        renderBlocks();
        await sleep(1200);
        const delIds = new Set(toPhysicallyDelete.map(b => b.id));
        blocks = blocks.filter(b => !delIds.has(b.id));
        log(`Physically deleted ${toPhysicallyDelete.length} block(s) after delete-delay (${deleteDelayH}h).`, 'warn');
    } else {
        const pending = blocks.filter(b => b.deletionMark).length;
        if (pending > 0) log(`${pending} block(s) marked for deletion, awaiting delete-delay (${deleteDelayH}h).`);
        else log('No blocks marked for deletion.');
    }

    renderBlocks();

    // Done
    setPhase('done');
    log(`Compaction cycle complete. Next run in ${cfgWaitInterval.value}m.`, 'success');
    await sleep(800);
    setPhase('idle');

    isRunning = false;
    disableButtons(false);
}

// ─── BUTTONS ───
function disableButtons(disabled) {
    btnUploadRaw.disabled = disabled;
    btnUploadDiff.disabled = disabled;
    btnUploadReplica.disabled = disabled;
    btnCompact.disabled = disabled;
    btnMultiErr.disabled = disabled;
    btnReset.disabled = false; // always enabled
}

// ─── TIME DISPLAY ───
function updateTimeDisplay() {
    const h = parseInt(timeSlider.value);
    simTimeH = h;
    const days = Math.floor(h / 24);
    timeDisplay.textContent = `${h}h (${days}d)`;
    renderBlocks(); // re-render to update ages & eligibility
}

// ─── EVENT LISTENERS ───
btnUploadRaw.addEventListener('click', () => uploadBlock({ cluster: 'eu-west', replica: '0' }));
btnUploadDiff.addEventListener('click', () => uploadBlock({ cluster: 'us-east', replica: '0' }));
btnUploadReplica.addEventListener('click', () => {
    // Find most recent eu-west block to create HA pair
    const lastEu = [...blocks].reverse().find(b => b.labels.cluster === 'eu-west' && b.resolution === 'raw');
    const labels = { cluster: 'eu-west', replica: '1' };
    if (isRunning || isHalted) return;
    blockIdCounter++;
    const ulid = genULID();
    const minTime = lastEu ? lastEu.minTime : uploadTimeOffset;
    const maxTime = minTime + 2;

    blocks.push({
        id: blockIdCounter,
        ulid: ulid,
        resolution: 'raw',
        durationH: 2,
        minTime, maxTime,
        labels,
        compactionLevel: 1,
        animClass: '',
        deletionMark: false,
        deletionMarkTime: null
    });
    log(`Sidecar uploaded replica block ${ulid} ({cluster="eu-west", replica="1"}) [${minTime}h–${maxTime}h] — forms separate compaction group`);
    renderBlocks();
});

btnCompact.addEventListener('click', () => runCompactor());

btnMultiErr.addEventListener('click', () => {
    if (isRunning) return;
    isHalted = true;
    disableButtons(true);
    log('FATAL: Multiple compactors detected against the same bucket!', 'err');
    log('FATAL: Thanos Compactor is NOT concurrency-safe. Running multiple instances will cause data corruption.', 'err');
    log('FATAL: Compactor halted. Click "Reset Storage Bucket" to recover.', 'err');
    singletonErr.classList.add('visible');
    setPhase(null);
});

btnReset.addEventListener('click', () => {
    blocks = [];
    blockIdCounter = 0;
    simTimeH = 0;
    uploadTimeOffset = 0;
    logTime = 0;
    isRunning = false;
    isHalted = false;
    timeSlider.value = 0;
    updateTimeDisplay();
    logPanel.innerHTML = '';
    singletonErr.classList.remove('visible');
    setPhase('idle');
    disableButtons(false);
    log('Storage bucket reset. All blocks cleared.');
    renderBlocks();
});

btnCopyCli.addEventListener('click', () => {
    navigator.clipboard.writeText(cliOutput.textContent).then(() => {
        btnCopyCli.textContent = '✓ Copied';
        setTimeout(() => { btnCopyCli.textContent = 'Copy'; }, 1500);
    });
});

learnToggle.addEventListener('click', () => {
    learnToggle.classList.toggle('open');
    learnBody.classList.toggle('open');
});

timeSlider.addEventListener('input', updateTimeDisplay);

// Config change listeners
[cfgConsistency, cfgDsDisable, cfgRetRaw, cfgRet5m, cfgRet1h, cfgDeleteDelay, cfgWaitInterval, cfgCompactConc, cfgDsConc].forEach(el => {
    el.addEventListener('change', () => {
        updateCLI();
        checkRetentionWarning();
        updateDsOverlay();
        renderBlocks();
    });
});

// Gamification: Mark Complete
if (window.ThanosApp) {
    const completeBtn = document.getElementById('mark-complete-btn');
    if (completeBtn) {
        completeBtn.addEventListener('click', () => {
            window.ThanosApp.markLabComplete('compactor');
            completeBtn.textContent = 'Completed ✓';
            completeBtn.disabled = true;
            completeBtn.style.background = 'var(--green)';
        });
        if (window.ThanosApp.state && window.ThanosApp.state.completedLabs && window.ThanosApp.state.completedLabs.includes('compactor')) {
            completeBtn.textContent = 'Completed ✓';
            completeBtn.disabled = true;
            completeBtn.style.background = 'var(--green)';
        }
    }
}

// ─── INIT ───
setPhase('idle');
updateCLI();
checkRetentionWarning();
updateDsOverlay();
updateTimeDisplay();
log('Compactor node initialized and observing bucket.');
renderBlocks();

});
