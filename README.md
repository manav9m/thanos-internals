# Thanos Internals Lab

An interactive, pure-frontend learning environment for exploring Thanos internals.

## Architecture & Structure
This project is built using strictly HTML, CSS, and Vanilla JavaScript. It relies on no build tools, bundlers, or external frameworks, allowing it to be hosted immediately on GitHub Pages.

*   `index.html`: The main dashboard mapping out all available labs.
*   `js/app.js`: Contains state management using `localStorage` to track completion.
*   `css/styles.css`: Uses CSS Variables to enforce a consistent "dark mode" terminal aesthetic.
*   `labs/`: Contains individual interactive modules.

## How to Extend and Create New Labs

We have fully implemented the **Compactor Lab** (`labs/compactor.html` & `js/modules/compactor-sim.js`). Other labs have placeholder templates created.

To implement a new lab (e.g., `query.html`):

1.  **HTML Structure**:
    Open the template in `labs/query.html`.
    Update the Title and `<h2>` tag.
    Fill out the `.lab-sidebar` with accurate, documentation-backed theory. Include a "Configuration Playground" section, "Scenarios", and "References" linking to `thanos.io`.
2.  **Simulation UI**:
    Inside `.simulation-canvas`, design the visual components (using raw HTML/CSS divs or SVG).
    For Thanos Query, you might create nodes for "Query Component", "Store Gateway 1", "Sidecar 1", and visualize arrows/data-flow for the fan-out mechanism.
3.  **Simulation Logic**:
    Create a new file `js/modules/query-sim.js`.
    Link it at the bottom of the HTML file `<script src="../js/modules/query-sim.js"></script>`.
    Write a state machine. Use `setTimeout` (or async `delay` functions) and CSS classes (e.g., `.active`, `.fetching`) to animate the process when a user clicks a button in the `.controls-panel`.
4.  **Logging**:
    Emulate standard Thanos Go logging (`level=info msg="..."`) in a `.log-panel` to provide technical feedback on what the system is doing behind the scenes.
5.  **Completion**:
    Ensure the "Mark Lab Complete" button invokes `window.ThanosApp.markLabComplete('query')`. (The template already handles this dynamically).

## Constraints Reminder
*   **Pure Vanilla JS**: Do not add React, Vue, Vite, or Webpack.
*   **Strict Accuracy**: Behavior modeled in the simulations *must* reflect official docs. Do not hallucinate behavior (e.g., if you don't know the exact retry backoff, don't simulate it without a disclaimer).
*   **Visual First**: The simulation is the core feature. Make it animated and clear.
