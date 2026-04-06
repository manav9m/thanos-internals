class DownsamplingSimulation {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.logger = document.getElementById('log-panel');
        this.statusText = document.getElementById('sim-status');

        this.svgNS = "http://www.w3.org/2000/svg";

        // Data models
        this.rawPoints = [];
        this.aggr5m = [];
        this.aggr1h = [];

        // UI State
        this.currentState = 'raw'; // raw, 5m, 1h

        this.initData();
        this.initSVG();
        this.setupBindings();
        this.drawRaw();
    }

    log(msg, type = 'info') {
        const div = document.createElement('div');
        const color = type === 'error' ? 'var(--danger-color)' :
                      type === 'warn' ? 'var(--warning-color)' :
                      type === 'success' ? 'var(--success-color)' : 'var(--text-main)';
        div.style.color = color;
        div.textContent = `[${new Date().toISOString().split('T')[1].slice(0,8)}] ${msg}`;
        this.logger.appendChild(div);
        this.logger.scrollTop = this.logger.scrollHeight;
    }

    initData() {
        // Generate 30 raw data points.
        // Let's pretend 30 points = 15 minutes (1 point every 30s).
        // To make it fit 1h downsample visually in a tiny lab, we will pretend
        // these 30 points actually represent 30 minutes (1 min scrape) to make the math easier,
        // so 3 x 10-point groups for 5m? No, wait.
        // 5m resolution = 1 point per 5 minutes.
        // If we have 30 points spanning 15 minutes (30s interval):
        // 5m bucket = 10 points. So we get 3 AggrChunks for the 5m pass.
        // For the 1h pass, we group those 3 AggrChunks into 1 final AggrChunk.

        let currentValue = 100;
        for (let i = 0; i < 30; i++) {
            currentValue = currentValue + (Math.random() * 20 - 10); // Random walk
            this.rawPoints.push({
                index: i,
                timeOffset: i * 30, // seconds
                value: parseFloat(currentValue.toFixed(2))
            });
        }
    }

    initSVG() {
        this.container.innerHTML = `
            <svg id="ds-svg" width="100%" height="100%" viewBox="0 0 800 400" preserveAspectRatio="xMidYMid meet">
                <!-- Axes -->
                <line x1="50" y1="350" x2="750" y2="350" stroke="var(--border-color)" stroke-width="2"/>
                <line x1="50" y1="50" x2="50" y2="350" stroke="var(--border-color)" stroke-width="2"/>

                <text x="400" y="380" fill="var(--text-muted)" text-anchor="middle" font-size="12">Time →</text>
                <text x="20" y="200" fill="var(--text-muted)" text-anchor="middle" font-size="12" transform="rotate(-90 20,200)">Value →</text>

                <!-- Data Groups -->
                <g id="raw-layer"></g>
                <g id="ds5m-layer" opacity="0"></g>
                <g id="ds1h-layer" opacity="0"></g>
            </svg>
        `;
        this.svg = document.getElementById('ds-svg');
        this.rawLayer = document.getElementById('raw-layer');
        this.ds5mLayer = document.getElementById('ds5m-layer');
        this.ds1hLayer = document.getElementById('ds1h-layer');
    }

    setupBindings() {
        this.btn5m = document.getElementById('btn-ds-5m');
        this.btn1h = document.getElementById('btn-ds-1h');
        this.btnReset = document.getElementById('btn-reset');

        this.btn5m.addEventListener('click', () => this.run5mPass());
        this.btn1h.addEventListener('click', () => this.run1hPass());
        this.btnReset.addEventListener('click', () => this.reset());
    }

    getY(val) {
        // Map 0-200 to 330-70 Y axis
        return 330 - ((val / 200) * 260);
    }
    getX(index, total) {
        // Map 0-total to 70-730 X axis
        return 70 + ((index / Math.max(1, total - 1)) * 660);
    }

    drawRaw() {
        this.rawLayer.innerHTML = '';
        this.rawPoints.forEach((pt, i) => {
            const x = this.getX(i, 30);
            const y = this.getY(pt.value);

            const circle = document.createElementNS(this.svgNS, 'circle');
            circle.setAttribute('cx', x);
            circle.setAttribute('cy', y);
            circle.setAttribute('r', '4');
            circle.setAttribute('fill', 'var(--primary-color)');

            // Tooltip via title
            const title = document.createElementNS(this.svgNS, 'title');
            title.textContent = `Raw Sample\nTime: +${pt.timeOffset}s\nValue: ${pt.value}`;
            circle.appendChild(title);

            this.rawLayer.appendChild(circle);
        });

        // Draw path connecting them
        let d = `M ${this.getX(0, 30)} ${this.getY(this.rawPoints[0].value)}`;
        for(let i=1; i<30; i++) {
            d += ` L ${this.getX(i, 30)} ${this.getY(this.rawPoints[i].value)}`;
        }
        const path = document.createElementNS(this.svgNS, 'path');
        path.setAttribute('d', d);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', 'var(--primary-color)');
        path.setAttribute('stroke-width', '1.5');
        path.setAttribute('opacity', '0.5');
        this.rawLayer.prepend(path);
    }

    run5mPass() {
        if (this.currentState !== 'raw') return;
        this.currentState = '5m';

        this.btn5m.disabled = true;
        this.statusText.textContent = 'State: Downsampling to 5m resolution...';
        this.log('Initiating 5m downsampling pass. Grouping 30s samples into 5m blocks.');

        // Logic: 3 buckets of 10 points (30s * 10 = 300s = 5m)
        this.aggr5m = [];
        for (let b = 0; b < 3; b++) {
            const chunk = this.rawPoints.slice(b * 10, (b + 1) * 10);
            const vals = chunk.map(c => c.value);
            const sum = vals.reduce((a,b)=>a+b, 0);

            this.aggr5m.push({
                bucket: b,
                count: chunk.length,
                sum: sum,
                min: Math.min(...vals),
                max: Math.max(...vals),
                avg: sum / chunk.length,
                xPos: this.getX((b * 10) + 4.5, 30) // Center of the 10 points
            });
        }

        this.ds5mLayer.innerHTML = '';
        this.ds5mLayer.style.opacity = '1';

        // Use GSAP to animate raw points merging into 5m chunks
        const tl = gsap.timeline({
            onComplete: () => {
                this.statusText.textContent = 'State: 5m Resolution (3 AggrChunks created)';
                this.btn1h.disabled = false;
            }
        });

        // Fade out the connecting raw path
        tl.to('#raw-path', { opacity: 0, duration: 0.5 });

        this.aggr5m.forEach((aggr, i) => {
            // Draw the chunk but hide it initially
            const group = this.drawAggrChunk(this.ds5mLayer, aggr, 'var(--warning-color)', '5m AggrChunk', 50, `ds5m-chunk-${i}`);
            gsap.set(group, { opacity: 0, scale: 0.5, transformOrigin: "center center" });

            // Gather the 10 points for this bucket
            const pointsToAnimate = [];
            for (let j = i * 10; j < (i + 1) * 10; j++) {
                pointsToAnimate.push(`#raw-pt-${j}`);
            }

            // Animate points moving to the center of the new 5m chunk
            tl.to(pointsToAnimate, {
                attr: { cx: aggr.xPos, cy: this.getY(aggr.avg) },
                opacity: 0,
                duration: 0.8,
                stagger: 0.05,
                ease: "power2.inOut"
            }, "-=0.2"); // Overlap slightly

            // Reveal the new AggrChunk
            tl.to(group, {
                opacity: 1,
                scale: 1,
                duration: 0.5,
                ease: "back.out(1.7)",
                onStart: () => {
                    this.log(`Created 5m AggrChunk ${i+1}/3: { count: ${aggr.count}, min: ${aggr.min.toFixed(2)}, max: ${aggr.max.toFixed(2)}, sum: ${aggr.sum.toFixed(2)} }`, 'success');
                }
            }, "-=0.4");
        });
    }

    run1hPass() {
        if (this.currentState !== '5m') return;
        this.currentState = '1h';

        this.btn1h.disabled = true;
        this.statusText.textContent = 'State: Downsampling to 1h resolution...';
        this.log('Initiating 1h downsampling pass. Merging 5m AggrChunks.');

        // Logic: Merge the 3 5m chunks into one 1h chunk
        const count = this.aggr5m.reduce((acc, a) => acc + a.count, 0);
        const sum = this.aggr5m.reduce((acc, a) => acc + a.sum, 0);
        const min = Math.min(...this.aggr5m.map(a => a.min));
        const max = Math.max(...this.aggr5m.map(a => a.max));

        this.aggr1h = [{
            count: count,
            sum: sum,
            min: min,
            max: max,
            avg: sum / count,
            xPos: this.getX(14.5, 30) // Center of all data
        }];

        this.ds1hLayer.innerHTML = '';
        this.ds1hLayer.style.opacity = '1';

        const tl = gsap.timeline({
            onComplete: () => {
                this.statusText.textContent = 'State: 1h Resolution (1 Final AggrChunk)';
            }
        });

        // 1. Move all 3 5m chunks to the center
        const finalX = this.aggr1h[0].xPos;
        const finalY = this.getY(this.aggr1h[0].avg);

        // We use dummy DOM elements we assigned IDs to
        const chunksToMove = ['#ds5m-chunk-0', '#ds5m-chunk-1', '#ds5m-chunk-2'];

        chunksToMove.forEach(selector => {
            tl.to(selector, {
                x: (i, target) => finalX - target.getBoundingClientRect().width/2 - target.getBBox().x,
                y: (i, target) => finalY - target.getBBox().y - target.getBBox().height/2, // Not exact, GSAP SVG transform origin needs explicit care
                opacity: 0,
                scale: 0.1,
                duration: 1,
                ease: "power2.inOut"
            }, "mergeStart");
        });

        // Add proper GSAP SVG handling: to be robust, just animate the inner x/y of the group, or better:
        // Just fade and collapse them and expand the new one.
        tl.clear(); // Reset timeline to do it cleanly via transform strings

        tl.to(chunksToMove, {
            svgOrigin: `${finalX} ${finalY}`, // Scale towards final center
            scale: 0,
            opacity: 0,
            duration: 1.2,
            stagger: 0.1,
            ease: "power2.inOut"
        }, "start");


        const group = this.drawAggrChunk(this.ds1hLayer, this.aggr1h[0], 'var(--danger-color)', '1h AggrChunk', 80, 'ds1h-final');
        gsap.set(group, { opacity: 0, scale: 0, transformOrigin: "center center" });

        tl.to(group, {
            opacity: 1,
            scale: 1,
            duration: 0.8,
            ease: "elastic.out(1, 0.5)",
            onStart: () => {
                this.log(`Created 1h AggrChunk (Merged): { count: ${count}, min: ${min.toFixed(2)}, max: ${max.toFixed(2)}, sum: ${sum.toFixed(2)} }`, 'error');
            }
        }, "-=0.4");
    }

    drawAggrChunk(layer, aggr, color, label, size = 50, id = '') {
        const y = this.getY(aggr.avg);
        const x = aggr.xPos;

        const g = document.createElementNS(this.svgNS, 'g');
        if (id) g.setAttribute('id', id);

        // We use standard transformOrigin logic by applying a CSS property manually if needed,
        // but GSAP handles transformOrigin well if we set it.
        g.style.transformOrigin = `${x}px ${y}px`;

        // Bounding rect for visual chunking
        const rect = document.createElementNS(this.svgNS, 'rect');
        rect.setAttribute('x', x - size);
        rect.setAttribute('y', y - size/2);
        rect.setAttribute('width', size*2);
        rect.setAttribute('height', size);
        rect.setAttribute('fill', color);
        rect.setAttribute('fill-opacity', '0.2');
        rect.setAttribute('stroke', color);
        rect.setAttribute('stroke-width', '2');
        rect.setAttribute('rx', '4');

        // Min/Max line indicator (whisker)
        const whisker = document.createElementNS(this.svgNS, 'line');
        whisker.setAttribute('x1', x);
        whisker.setAttribute('x2', x);
        whisker.setAttribute('y1', this.getY(aggr.max));
        whisker.setAttribute('y2', this.getY(aggr.min));
        whisker.setAttribute('stroke', color);
        whisker.setAttribute('stroke-width', '2');
        whisker.setAttribute('stroke-dasharray', '4,4');

        // Avg Point
        const circle = document.createElementNS(this.svgNS, 'circle');
        circle.setAttribute('cx', x);
        circle.setAttribute('cy', y);
        circle.setAttribute('r', '6');
        circle.setAttribute('fill', color);

        // Label
        const text = document.createElementNS(this.svgNS, 'text');
        text.setAttribute('x', x);
        text.setAttribute('y', y - (size/2) - 10);
        text.setAttribute('fill', 'var(--text-main)');
        text.setAttribute('font-size', '12');
        text.setAttribute('text-anchor', 'middle');
        text.textContent = label;

        // Tooltip
        const title = document.createElementNS(this.svgNS, 'title');
        title.textContent = `AggrChunk Data:\nCount: ${aggr.count}\nSum: ${aggr.sum.toFixed(2)}\nMin: ${aggr.min.toFixed(2)}\nMax: ${aggr.max.toFixed(2)}`;
        rect.appendChild(title);

        g.appendChild(whisker);
        g.appendChild(rect);
        g.appendChild(circle);
        g.appendChild(text);

        layer.appendChild(g);
        return g;
    }

    reset() {
        this.currentState = 'raw';
        this.btn5m.disabled = false;
        this.btn1h.disabled = true;
        this.statusText.textContent = 'State: Raw Data (15m span, 30s scrape interval)';

        // Kill any active GSAP animations
        gsap.killTweensOf("*");

        this.rawLayer.style.opacity = '1';
        this.ds5mLayer.style.opacity = '0';
        this.ds1hLayer.style.opacity = '0';

        this.ds5mLayer.innerHTML = '';
        this.ds1hLayer.innerHTML = '';

        this.initData(); // Regen new random walk
        this.drawRaw();

        this.log('Simulation reset to initial raw data state.');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new DownsamplingSimulation('sim-canvas');

    // Wire up completion button
    const markCompleteBtn = document.getElementById('markCompleteBtn');
    if (markCompleteBtn && window.ThanosApp) {
        if (window.ThanosApp.isLabCompleted('downsampling')) {
            markCompleteBtn.textContent = '✓ Lab Completed';
            markCompleteBtn.classList.add('completed');
            markCompleteBtn.disabled = true;
        }

        markCompleteBtn.addEventListener('click', () => {
            window.ThanosApp.markLabComplete('downsampling');
            markCompleteBtn.textContent = '✓ Lab Completed';
            markCompleteBtn.classList.add('completed');
            markCompleteBtn.disabled = true;
        });
    }
});