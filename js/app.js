// Core App Logic & State Management

const LABS = [
    { id: 'tsdb', title: 'TSDB Internals', description: 'Understand blocks, WAL, head block, and PromQL basics.', url: 'labs/tsdb.html' },
    { id: 'sidecar', title: 'Sidecar', description: 'Read Prometheus data, upload to object storage, serve StoreAPI.', url: 'labs/sidecar.html' },
    { id: 'store', title: 'Store Gateway', description: 'Serve historical data from object storage with block indexing.', url: 'labs/store.html' },
    { id: 'compactor', title: 'Compactor', description: 'Compact, downsample, and apply retention to TSDB blocks.', url: 'labs/compactor.html' },
    { id: 'query', title: 'Query', description: 'Stateless PromQL engine, fanout, and result deduplication.', url: 'labs/query.html' },
    // { id: 'ruler', title: 'Ruler', description: 'Evaluate recording/alerting rules against Thanos Query.', url: 'labs/ruler.html' },
    // { id: 'receive', title: 'Receive', description: 'Remote Write API implementation and local buffering.', url: 'labs/receive.html' },
    { id: 'downsampling', title: 'Downsampling', description: 'Detailed dive into 5m and 1h resolution creation.', url: 'labs/downsampling.html' },
    { id: 'retention', title: 'Retention & Deletion', description: 'How tombstones and retention policies are applied.', url: 'labs/retention.html' },
];

class AppState {
    constructor() {
        this.completedLabs = JSON.parse(localStorage.getItem('thanos_completed_labs') || '[]');
    }

    markCompleted(labId) {
        if (!this.completedLabs.includes(labId)) {
            this.completedLabs.push(labId);
            this.save();
        }
    }

    isCompleted(labId) {
        return this.completedLabs.includes(labId);
    }

    save() {
        localStorage.setItem('thanos_completed_labs', JSON.stringify(this.completedLabs));
    }

    getCompletionCount() {
        return this.completedLabs.length;
    }
}

const appState = new AppState();

function updateProgressUI() {
    const textEl = document.getElementById('completion-text');
    const barEl = document.getElementById('progress-bar');

    if (textEl && barEl) {
        const count = appState.getCompletionCount();
        const total = LABS.length;
        const percentage = (count / total) * 100;

        textEl.textContent = `${count} / ${total} Labs Completed`;
        barEl.style.width = `${percentage}%`;
    }
}

function renderLabGrid() {
    const gridEl = document.getElementById('lab-grid');
    if (!gridEl) return;

    gridEl.innerHTML = '';

    LABS.forEach(lab => {
        const isCompleted = appState.isCompleted(lab.id);

        const card = document.createElement('div');
        card.className = `lab-card ${isCompleted ? 'completed' : ''}`;

        card.innerHTML = `
            <h3>${lab.title}</h3>
            <span class="status ${isCompleted ? 'completed' : 'pending'}">
                ${isCompleted ? '✓ Completed' : 'Pending'}
            </span>
            <p>${lab.description}</p>
            <a href="${lab.url}" class="btn">${isCompleted ? 'Review Lab' : 'Start Lab'}</a>
        `;

        gridEl.appendChild(card);
    });
}

// Expose globally for lab pages
window.ThanosApp = {
    state: appState,
    markLabComplete: (labId) => {
        appState.markCompleted(labId);
        updateProgressUI();
    }
};

document.addEventListener('DOMContentLoaded', () => {
    updateProgressUI();
    renderLabGrid();
});
