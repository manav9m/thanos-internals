# Phase 1: Pre-Work & System Architecture

## 1. Deep Architectural Breakdown of Thanos

### Components
*   **Sidecar**: Deployed alongside Prometheus. Reads the Prometheus data directory. Uploads TSDB blocks to Object Storage. Acts as a StoreAPI endpoint to serve Prometheus's local data to Thanos Query.
*   **Store Gateway**: Connects to the Object Storage bucket. Serves historical data via StoreAPI. Loads block indexes (and caches them) to perform fast queries without downloading full chunks.
*   **Compactor**: Singleton component per bucket. Scans Object Storage for TSDB blocks. Compacts multiple smaller blocks (e.g., 2h) into larger ones (e.g., 8h, 2d). Performs downsampling (creating 5m and 1h resolution blocks). Applies retention policies.
*   **Query (Querier)**: Stateless, horizontally scalable query engine. Implements PromQL. Connects to StoreAPIs (Sidecar, Store Gateway, Receive) to fetch data. Performs query fanout, deduplication, and concurrent fetching.
*   **Ruler**: Evaluates recording and alerting rules against a Thanos Query endpoint. Can upload its own generated blocks to Object Storage (via its own Sidecar-like logic).
*   **Receive**: Implements the Prometheus Remote Write API. Receives data pushed from Prometheus instances. Uses a local TSDB to buffer data, then uploads blocks to Object Storage. Useful for environments where Sidecar/pull model is impossible.

### Data Flow
1.  **Ingestion**: Prometheus scrapes metrics -> stores in local TSDB (Head block, WAL).
2.  **Upload**: Once a TSDB block is finalized (typically 2h), Thanos Sidecar uploads it to Object Storage.
3.  **Compaction & Downsampling**: Thanos Compactor periodically scans the bucket, merges 2h blocks into larger blocks, and creates downsampled versions.
4.  **Querying**: User hits Thanos Query -> Query fans out request to Sidecars (for recent data) and Store Gateways (for historical data in Object Storage) -> Deduplicates results -> Returns PromQL response.

### TSDB Internals
*   **Head Block & WAL**: In-memory data structures. The Write-Ahead-Log (WAL) ensures durability against crashes.
*   **Blocks**: Persistent, immutable directories containing chunks (compressed time series data), an index (label to series mappings), and metadata (`meta.json`).
*   **Tombstones**: Records of deleted data, applied during query time or purged during compaction.

## 2. Learning System Design

### Concept: "Thanos Internals Lab"
A gamified, interactive environment where users explore components through structured modules.

*   **Gamification/Progression**:
    *   Use `localStorage` to track `completedLabs` (array of strings).
    *   Dashboard visualizes completion (e.g., circular progress bars, glowing indicators for completed modules).
    *   "Unlock" mechanism: Advanced interactions within a lab are visually highlighted as "Recommended after Lab X", though hard locks are avoided to maintain accessibility.
*   **UI/UX**:
    *   Dark theme: Deep blues/grays (`#0d1117`, `#161b22`) for an engineering aesthetic, similar to terminal environments or modern docs.
    *   Split-pane layout for Labs: Left pane for narrative/theory/docs, Right pane for the Interactive Simulation.
    *   Interactive Visualizer: Uses pure DOM elements and CSS transitions (or simple canvas/SVG) to simulate data flows.

## 3. Website Structure Plan

```text
/ (root)
  index.html                 # Dashboard & Progress Tracker
  /css/
    styles.css               # Core styling, dark theme, layout, animations
  /js/
    app.js                   # Gamification, state management, localStorage
    ui.js                    # Generic UI components (tooltips, modals)
    modules/
      compactor-sim.js       # Phase 3: Interactive simulation logic for Compactor
  /labs/
    compactor.html           # Phase 3: Fully implemented Compactor Lab
    sidecar.html             # Phase 4: Template
    store.html               # Phase 4: Template
    query.html               # Phase 4: Template
    ruler.html               # Phase 4: Template
    receive.html             # Phase 4: Template
    tsdb.html                # Phase 4: Template
    downsampling.html        # Phase 4: Template
    retention.html           # Phase 4: Template
    object-storage.html      # Phase 4: Template
  /assets/
    /icons/                  # SVG icons for components
```
