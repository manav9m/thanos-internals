(function () {
    const data = window.QueryLabData;
    if (!data) {
        return;
    }

    const scenarios = data.scenarios.slice();
    const scenarioMap = new Map(scenarios.map((scenario) => [scenario.id, scenario]));
    const lastStepIndex = 6;
    const autoplayDelayMs = 1000;

    const state = {
        scenarioId: scenarios[0].id,
        controls: Object.assign({}, scenarios[0].defaults),
        stepIndex: 0,
        autoplayTimer: null
    };

    const els = {};

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function getScenario() {
        return scenarioMap.get(state.scenarioId);
    }

    function formatLabels(labels) {
        const entries = Object.keys(labels)
            .filter((key) => key !== "__name__")
            .sort()
            .map((key) => `${key}="${labels[key]}"`);
        return entries.join(", ");
    }

    function formatSeries(series) {
        const name = series.labels.__name__ || series.metric || "series";
        const body = formatLabels(series.labels);
        return body ? `${name}{${body}}` : name;
    }

    function canonicalSeriesKey(labels) {
        const copy = {};
        Object.keys(labels).sort().forEach((key) => {
            copy[key] = labels[key];
        });
        return JSON.stringify(copy);
    }

    function stripReplicaLabels(labels) {
        const copy = Object.assign({}, labels);
        data.replicaLabels.forEach((label) => {
            delete copy[label];
        });
        return copy;
    }

    function addressMatchesFilter(address, filterValue) {
        const pattern = filterValue.trim();
        if (!pattern) {
            return true;
        }

        try {
            return new RegExp(pattern, "i").test(address);
        } catch (error) {
            return address.toLowerCase().indexOf(pattern.toLowerCase()) !== -1;
        }
    }

    function chooseResolution(store, maxSourceResolution) {
        const resolutions = store.resolutions || ["raw"];
        if (maxSourceResolution === "1h") {
            if (resolutions.indexOf("1h") !== -1) {
                return "1h";
            }
            if (resolutions.indexOf("5m") !== -1) {
                return "5m";
            }
            return "raw";
        }

        if (maxSourceResolution === "5m") {
            if (resolutions.indexOf("5m") !== -1) {
                return "5m";
            }
            return "raw";
        }

        return "raw";
    }

    function deduplicateSeries(rawSeries) {
        const groups = new Map();
        rawSeries.forEach((series) => {
            const dedupedLabels = stripReplicaLabels(series.labels);
            const key = canonicalSeriesKey(dedupedLabels);
            const existing = groups.get(key);
            if (existing) {
                existing.sources.push(series.sourceName);
                existing.addresses.push(series.sourceAddress);
                if (series.labels.replica) {
                    existing.replicas.push(series.labels.replica);
                }
                return;
            }

            groups.set(key, {
                metric: series.metric,
                labels: dedupedLabels,
                value: series.value,
                sources: [series.sourceName],
                addresses: [series.sourceAddress],
                replicas: series.labels.replica ? [series.labels.replica] : [],
                resolution: series.resolution
            });
        });
        return Array.from(groups.values());
    }

    function computeAnalysis() {
        const scenario = getScenario();
        const selectedStores = scenario.stores.map((store) => {
            const selected = addressMatchesFilter(store.address, state.controls.storeFilter);
            const responseState = !selected ? "skipped" : (store.health === "up" ? "success" : "error");
            return Object.assign({}, store, {
                selected: selected,
                responseState: responseState,
                chosenResolution: responseState === "success" ? chooseResolution(store, state.controls.maxSourceResolution) : null
            });
        });

        const rawSeries = [];
        selectedStores.forEach((store) => {
            if (store.responseState !== "success") {
                return;
            }

            store.series.forEach((series) => {
                rawSeries.push({
                    metric: series.metric,
                    labels: Object.assign({}, series.labels),
                    value: series.value,
                    sourceName: store.name,
                    sourceAddress: store.address,
                    sourceKind: store.kind,
                    resolution: store.chosenResolution
                });
            });
        });

        const finalSeries = state.controls.dedup ? deduplicateSeries(rawSeries) : rawSeries.map((series) => ({
            metric: series.metric,
            labels: Object.assign({}, series.labels),
            value: series.value,
            sources: [series.sourceName],
            addresses: [series.sourceAddress],
            replicas: series.labels.replica ? [series.labels.replica] : [],
            resolution: series.resolution
        }));

        const selectedCount = selectedStores.filter((store) => store.selected).length;
        const successStores = selectedStores.filter((store) => store.responseState === "success");
        const failedStores = selectedStores.filter((store) => store.responseState === "error");
        const warnings = [];
        let status = "success";
        let statusText = "Query returned a full result set.";

        if (selectedCount === 0) {
            status = "warning";
            statusText = "No stores matched the optional store filter, so the result is empty.";
            warnings.push("No store matched the current store filter.");
        } else if (failedStores.length > 0 && state.controls.partialResponse) {
            status = "warning";
            statusText = "Query returned available data plus warnings from failed stores.";
            failedStores.forEach((store) => {
                warnings.push(`${store.name} did not answer; Querier kept going because partial response is enabled.`);
            });
        } else if (failedStores.length > 0 && !state.controls.partialResponse) {
            status = "error";
            statusText = "Query aborted because at least one selected store failed and partial response is disabled.";
        }

        const returnedSeries = status === "error" ? [] : finalSeries;
        const mergedSeriesCount = rawSeries.length - finalSeries.length;
        const downsampledStores = successStores.filter((store) => store.chosenResolution && store.chosenResolution !== "raw");

        return {
            scenario: scenario,
            selectedStores: selectedStores,
            rawSeries: rawSeries,
            finalSeries: finalSeries,
            returnedSeries: returnedSeries,
            successStores: successStores,
            failedStores: failedStores,
            selectedCount: selectedCount,
            status: status,
            statusText: statusText,
            warnings: warnings,
            mergedSeriesCount: mergedSeriesCount,
            downsampledStores: downsampledStores
        };
    }

    function buildSteps(analysis) {
        const params = [
            `dedup=${state.controls.dedup}`,
            `partial_response=${state.controls.partialResponse}`,
            `max_source_resolution=${state.controls.maxSourceResolution}`
        ];
        if (state.controls.storeFilter.trim()) {
            params.push(`storeMatch[]={__address__=~"${state.controls.storeFilter.trim()}"}`);
        }

        const selectedNames = analysis.selectedStores
            .filter((store) => store.selected)
            .map((store) => store.name)
            .join(", ");

        const fanoutFacts = analysis.selectedStores
            .filter((store) => store.selected)
            .map((store) => `${store.name}: request sent to ${store.address}${store.responseState === "success" ? ` using ${store.chosenResolution} data` : ""}.`);

        const responseFacts = analysis.selectedStores
            .filter((store) => store.selected)
            .map((store) => {
                if (store.responseState === "success") {
                    return `${store.name} replied successfully with ${store.series.length} series at ${store.chosenResolution} resolution.`;
                }
                return `${store.name} failed or timed out.`;
            });

        const dedupFact = !state.controls.dedup
            ? "Deduplication is disabled, so every returned series stays separate."
            : analysis.mergedSeriesCount > 0
                ? `Deduplication merged ${analysis.mergedSeriesCount} overlapping replica series using replica label(s): ${data.replicaLabels.join(", ")}.`
                : "Deduplication is enabled, but it had nothing to merge because no two series differed only by replica label.";

        const evaluationFact = analysis.status === "error"
            ? "PromQL evaluation stops because the gather stage did not produce an acceptable input set."
            : `PromQL evaluation runs on ${analysis.returnedSeries.length} input series or matrices returned from the gather and dedup stages.`;

        return [
            {
                title: "Receive QueryAPI request",
                subtitle: "Client -> Querier",
                summary: "Querier accepts one Prometheus-compatible HTTP request.",
                facts: [
                    `Query: ${analysis.scenario.query}`,
                    `Range: ${analysis.scenario.timeRange}`,
                    `Parameters: ${params.join(" | ")}`
                ],
                eventTitle: "Request received",
                eventBody: `Querier received a Query API request for ${analysis.scenario.query}.`,
                focus: { client: true, querier: true, http: true }
            },
            {
                title: "Select candidate stores",
                subtitle: "Querier chooses endpoints",
                summary: "Querier decides which connected StoreAPI backends should be asked for this request.",
                facts: [
                    `Configured endpoints in scenario: ${analysis.scenario.stores.length}.`,
                    analysis.selectedCount > 0
                        ? `Selected stores: ${selectedNames}.`
                        : "No stores were selected because the optional store filter excluded every address."
                ],
                eventTitle: "Stores selected",
                eventBody: analysis.selectedCount > 0
                    ? `Querier selected ${analysis.selectedCount} candidate store(s) for fanout.`
                    : "Querier found no store that matched the current filter.",
                focus: { querier: true, stores: true }
            },
            {
                title: "Fan out concurrent StoreAPI selects",
                subtitle: "Querier -> StoreAPI",
                summary: "Selector requests are sent concurrently to the chosen stores.",
                facts: analysis.selectedCount > 0 ? fanoutFacts : ["No fanout happens because no store was selected."],
                eventTitle: "Fanout started",
                eventBody: analysis.selectedCount > 0
                    ? "Querier sent concurrent selector requests to the chosen StoreAPI backends."
                    : "Fanout stage was skipped.",
                focus: { querier: true, stores: true, grpc: true }
            },
            {
                title: "Gather responses",
                subtitle: "Stores reply",
                summary: "Stores answer with series data, downsampled data, or an error.",
                facts: analysis.selectedCount > 0 ? responseFacts : ["There were no selected stores to answer."],
                eventTitle: "Responses gathered",
                eventBody: analysis.failedStores.length > 0
                    ? `${analysis.successStores.length} store(s) replied successfully and ${analysis.failedStores.length} failed.`
                    : `${analysis.successStores.length} store(s) replied successfully.`,
                focus: { stores: true, grpc: true, grpcError: analysis.failedStores.length > 0 }
            },
            {
                title: "Deduplicate or keep raw series",
                subtitle: "Querier post-processes",
                summary: "Querier merges HA replicas only when they differ only by configured replica labels.",
                facts: [
                    `Raw series received: ${analysis.rawSeries.length}.`,
                    `Series after dedup stage: ${analysis.finalSeries.length}.`,
                    dedupFact
                ],
                eventTitle: "Dedup stage finished",
                eventBody: dedupFact,
                focus: { querier: true }
            },
            {
                title: "Evaluate PromQL",
                subtitle: "PromQL engine runs",
                summary: "After enough data is gathered, Querier evaluates the PromQL expression.",
                facts: [
                    evaluationFact,
                    analysis.downsampledStores.length > 0
                        ? `Downsampled data was used from: ${analysis.downsampledStores.map((store) => store.name).join(", ")}.`
                        : "Only raw data was used in this run."
                ],
                eventTitle: "PromQL evaluation",
                eventBody: analysis.status === "error"
                    ? "Evaluation did not continue because the query had to abort."
                    : "Querier evaluated the expression on the gathered input set.",
                focus: { querier: true }
            },
            {
                title: "Return result, warnings, or error",
                subtitle: "Querier -> Client",
                summary: "Querier sends the final response back to the client.",
                facts: [
                    `Outcome: ${analysis.statusText}`,
                    analysis.warnings.length > 0 ? `Warnings: ${analysis.warnings.join(" ")}` : "Warnings: none.",
                    `Returned series count: ${analysis.returnedSeries.length}.`
                ],
                eventTitle: "Response returned",
                eventBody: analysis.statusText,
                focus: { client: true, querier: true, http: true, httpError: analysis.status === "error" }
            }
        ];
    }

    function renderConcepts() {
        els.conceptGrid.innerHTML = data.concepts.map((concept) => `
            <article class="mini-card">
                <h3>${escapeHtml(concept.title)}</h3>
                <p>${escapeHtml(concept.body)}</p>
            </article>
        `).join("");
    }

    function renderRequestPath() {
        els.requestPath.innerHTML = data.requestPath.map((item, index) => `
            <div class="path-item">
                <div class="path-number">${index + 1}</div>
                <div>
                    <strong>${escapeHtml(item.title)}</strong>
                    <p>${escapeHtml(item.body)}</p>
                </div>
            </div>
        `).join("");
    }

    function renderScenarioCards(analysis) {
        els.scenarioGrid.innerHTML = scenarios.map((scenario) => {
            const activeClass = scenario.id === state.scenarioId ? "active" : "";
            return `
                <article class="scenario-card ${activeClass}">
                    <div class="scenario-card-header">
                        <div>
                            <div class="scenario-badge">${escapeHtml(scenario.badge)}</div>
                            <h3>${escapeHtml(scenario.title)}</h3>
                        </div>
                        <div class="scenario-meta">
                            <span class="pill">${escapeHtml(scenario.timeRange)}</span>
                            <span class="pill">${escapeHtml(`${scenario.stores.length} stores`)}</span>
                            ${scenario.recommended ? '<span class="pill ok">Recommended first</span>' : ""}
                        </div>
                    </div>
                    <p class="scenario-focus">${escapeHtml(scenario.focus)}</p>
                    <div class="scenario-detail">
                        <strong>What to do</strong>
                        <p>${escapeHtml(scenario.howToUse)}</p>
                    </div>
                    <div class="scenario-detail">
                        <strong>Expected output</strong>
                        <p>${escapeHtml(scenario.expectedOutput)}</p>
                    </div>
                    <div class="scenario-detail">
                        <strong>Why this happens</strong>
                        <p>${escapeHtml(scenario.whyItHappens)}</p>
                    </div>
                    <p class="scenario-copy"><code>${escapeHtml(scenario.query)}</code></p>
                    <div class="scenario-actions">
                        <span class="muted">${scenario.id === analysis.scenario.id ? "Loaded in lab" : "Click load, then run the query"}</span>
                        <button class="btn ghost scenario-load" data-scenario-id="${escapeHtml(scenario.id)}">Load scenario into lab</button>
                    </div>
                </article>
            `;
        }).join("");
    }

    function renderScenarioIntro(analysis) {
        els.scenarioIntro.innerHTML = `
            <h4>${escapeHtml(analysis.scenario.badge)}: ${escapeHtml(analysis.scenario.title)}</h4>
            <p>${escapeHtml(analysis.scenario.focus)}</p>
            <div class="scenario-detail-stack">
                <div class="scenario-detail">
                    <strong>Goal</strong>
                    <p>${escapeHtml(analysis.scenario.goal)}</p>
                </div>
                <div class="scenario-detail">
                    <strong>How to run it</strong>
                    <p>${escapeHtml(analysis.scenario.howToUse)}</p>
                </div>
                <div class="scenario-detail">
                    <strong>Expected output</strong>
                    <p>${escapeHtml(analysis.scenario.expectedOutput)}</p>
                </div>
                <div class="scenario-detail">
                    <strong>Why it happens</strong>
                    <p>${escapeHtml(analysis.scenario.whyItHappens)}</p>
                </div>
            </div>
        `;
    }

    function renderExpectations(analysis) {
        const behavior = [
            `Selected stores right now: ${analysis.selectedCount}.`,
            `Raw series right now: ${analysis.rawSeries.length}.`,
            `Returned series right now: ${analysis.returnedSeries.length}.`
        ];
        els.expectationPanel.innerHTML = `
            <div class="summary-box">
                <h4>Before you run it</h4>
                <p>${escapeHtml(analysis.scenario.goal)}</p>
                <ul class="result-list">
                    <li>${escapeHtml(analysis.scenario.howToUse)}</li>
                    <li>${escapeHtml(analysis.scenario.expectedOutput)}</li>
                    <li>${escapeHtml(analysis.scenario.whyItHappens)}</li>
                </ul>
            </div>
            <div class="summary-box">
                <h4>Live behavior with current controls</h4>
                <ul class="expectation-list">
                    ${behavior.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
                </ul>
            </div>
        `;
    }

    function nodeCardClass(baseClass, store, steps, currentStep) {
        let className = `node-card ${baseClass}`;
        const focus = steps[currentStep].focus;

        if (store) {
            if (store.selected) {
                className += " selected";
            } else {
                className += " muted";
            }
            if (store.responseState === "success" && currentStep >= 3) {
                className += " success";
            }
            if (store.responseState === "error" && currentStep >= 3) {
                className += " error";
            }
            if (focus.stores && store.selected) {
                className += " active";
            }
        } else if ((baseClass === "client" && focus.client) || (baseClass === "querier" && focus.querier)) {
            className += " active";
        }

        return className;
    }

    function renderTopology(analysis, steps) {
        const currentStep = state.stepIndex;
        const focus = steps[currentStep].focus;
        const httpClass = focus.http ? `flow-connector ${focus.httpError ? "error" : "active"}` : "flow-connector";
        const grpcClass = focus.grpc ? `flow-connector ${focus.grpcError ? "error" : "active"}` : "flow-connector";
        const storeIntro = analysis.selectedCount > 0
            ? `
                <div class="summary-box store-stack-header">
                    <h4>Stores Querier contacted</h4>
                    <p>These are the backends in the fanout. A green card means the store answered. A red card means it failed.</p>
                </div>
            `
            : `
                <div class="empty-state store-stack-header">
                    No stores matched the current filter, so Querier had nobody to ask.
                </div>
            `;

        const storeMarkup = analysis.selectedStores.map((store) => `
            <div class="${nodeCardClass("store", store, steps, currentStep)}">
                <h4>${escapeHtml(store.name)}</h4>
                <p>${escapeHtml(store.description)}</p>
                <div class="store-meta">
                    <span class="pill">${escapeHtml(store.kind)}</span>
                    <span class="pill ${store.health === "up" ? "ok" : "error"}">${escapeHtml(store.health)}</span>
                    <span class="pill ${store.selected ? "ok" : ""}">${store.selected ? "selected" : "filtered out"}</span>
                    ${store.chosenResolution ? `<span class="pill warn">${escapeHtml(store.chosenResolution)}</span>` : ""}
                </div>
            </div>
        `).join("");

        els.topologyView.innerHTML = `
            <div class="topology-grid">
                <div class="node-column">
                    <div class="${nodeCardClass("client", null, steps, currentStep)}">
                        <h4>Client / Grafana</h4>
                        <p>Sends one Query API request to Querier.</p>
                    </div>
                </div>

                <div class="connector-column">
                    <div class="${httpClass}">
                        <strong>HTTP QueryAPI</strong>
                    </div>
                </div>

                <div class="node-column">
                    <div class="${nodeCardClass("querier", null, steps, currentStep)}">
                        <h4>Thanos Querier</h4>
                        <p>Finds candidate stores, sends fanout requests, optionally deduplicates, then evaluates PromQL.</p>
                        <div class="store-meta">
                            <span class="pill">${escapeHtml(`selected=${analysis.selectedCount}`)}</span>
                            <span class="pill">${escapeHtml(`raw=${analysis.rawSeries.length}`)}</span>
                            <span class="pill">${escapeHtml(`returned=${analysis.returnedSeries.length}`)}</span>
                        </div>
                    </div>
                </div>

                <div class="connector-column">
                    <div class="${grpcClass}">
                        <strong>gRPC StoreAPI fanout</strong>
                    </div>
                </div>

                <div class="store-stack">
                    ${storeIntro}
                    ${storeMarkup}
                </div>
            </div>
        `;
    }

    function renderStepper(steps) {
        els.stepper.innerHTML = steps.map((step, index) => {
            const classes = ["step-card"];
            if (index === state.stepIndex) {
                classes.push("current");
            } else if (index < state.stepIndex) {
                classes.push("done");
            }
            return `
                <article class="${classes.join(" ")}" data-step-index="${index}">
                    <small>Step ${index + 1}</small>
                    <strong>${escapeHtml(step.title)}</strong>
                    <p>${escapeHtml(step.subtitle)}</p>
                </article>
            `;
        }).join("");
    }

    function renderStepDetail(steps) {
        const step = steps[state.stepIndex];
        els.stepDetail.innerHTML = `
            <div class="step-detail-card">
                <h4>${escapeHtml(step.title)}</h4>
                <p>${escapeHtml(step.summary)}</p>
                <ul class="detail-facts">
                    ${step.facts.map((fact) => `<li>${escapeHtml(fact)}</li>`).join("")}
                </ul>
            </div>
        `;
    }

    function renderResult(analysis) {
        const statusClass = analysis.status === "success" ? "success" : (analysis.status === "warning" ? "warning" : "error");
        const expectedMarkup = `
            <div class="summary-box">
                <h4>Expected for this scenario</h4>
                <p>${escapeHtml(analysis.scenario.expectedOutput)}</p>
            </div>
        `;
        const warningMarkup = analysis.warnings.length > 0
            ? `
                <div class="summary-box">
                    <h4>Warnings</h4>
                    <ul class="result-list">
                        ${analysis.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}
                    </ul>
                </div>
            `
            : "";

        const seriesMarkup = analysis.returnedSeries.length > 0
            ? `
                <div class="summary-box">
                    <h4>Returned series</h4>
                    <div class="series-stack">
                        ${analysis.returnedSeries.map((series) => `
                            <div class="series-card">
                                <strong>${escapeHtml(formatSeries(series))}</strong>
                                <p>Sources: ${escapeHtml(series.sources.join(", "))}</p>
                                <p>Resolution used: ${escapeHtml(series.resolution || "raw")}</p>
                            </div>
                        `).join("")}
                    </div>
                </div>
            `
            : `
                <div class="empty-state">
                    No series are returned in the current outcome.
                </div>
            `;

        els.resultPanel.innerHTML = `
            <div class="result-status ${statusClass}">${escapeHtml(analysis.statusText)}</div>
            <div class="summary-box">
                <h4>Query summary</h4>
                <div class="summary-meta">
                    <span class="pill">${escapeHtml(`selected stores=${analysis.selectedCount}`)}</span>
                    <span class="pill">${escapeHtml(`healthy stores=${analysis.successStores.length}`)}</span>
                    <span class="pill">${escapeHtml(`failed stores=${analysis.failedStores.length}`)}</span>
                    <span class="pill">${escapeHtml(`returned series=${analysis.returnedSeries.length}`)}</span>
                </div>
            </div>
            ${expectedMarkup}
            ${warningMarkup}
            ${seriesMarkup}
        `;
    }

    function renderEventLog(steps) {
        els.eventLog.innerHTML = steps.map((step, index) => {
            const classes = ["event-entry"];
            if (index === state.stepIndex) {
                classes.push("current");
            } else if (index < state.stepIndex) {
                classes.push("done");
            } else {
                classes.push("pending");
            }
            return `
                <article class="${classes.join(" ")}">
                    <h4>Step ${index + 1}. ${escapeHtml(step.eventTitle)}</h4>
                    <p>${escapeHtml(step.eventBody)}</p>
                </article>
            `;
        }).join("");
    }

    function updateControlInputs() {
        const scenario = getScenario();
        els.queryField.value = scenario.query;
        els.rangeField.value = scenario.timeRange;
        els.dedupToggle.checked = state.controls.dedup;
        els.partialToggle.checked = state.controls.partialResponse;
        els.resolutionSelect.value = state.controls.maxSourceResolution;
        els.storeFilterInput.value = state.controls.storeFilter;
    }

    function updateCompletionState() {
        if (!window.ThanosApp || !els.markCompleteBtn || !els.completionState) {
            return;
        }

        const completed = window.ThanosApp.state.isCompleted("query");
        els.completionState.textContent = completed ? "Lab completed" : "Lab pending";
        els.completionState.className = `state-pill ${completed ? "completed" : "pending"}`;
        els.markCompleteBtn.disabled = completed;
        els.markCompleteBtn.textContent = completed ? "Lab Completed" : "Mark Lab Complete";
    }

    function syncControlsFromInputs() {
        state.controls = {
            dedup: els.dedupToggle.checked,
            partialResponse: els.partialToggle.checked,
            maxSourceResolution: els.resolutionSelect.value,
            storeFilter: els.storeFilterInput.value
        };
    }

    function stopAutoplay() {
        if (state.autoplayTimer) {
            clearInterval(state.autoplayTimer);
            state.autoplayTimer = null;
        }
    }

    function setStep(index) {
        state.stepIndex = Math.max(0, Math.min(lastStepIndex, index));
        render();
    }

    function loadScenario(scenarioId, shouldScroll) {
        const scenario = scenarioMap.get(scenarioId);
        if (!scenario) {
            return;
        }

        stopAutoplay();
        state.scenarioId = scenarioId;
        state.controls = Object.assign({}, scenario.defaults);
        state.stepIndex = 0;
        updateControlInputs();
        render();

        if (shouldScroll) {
            const target = document.getElementById("query-playground");
            if (target) {
                target.scrollIntoView({ behavior: "smooth", block: "start" });
            }
        }
    }

    function runAutoplay() {
        stopAutoplay();
        state.stepIndex = 0;
        render();

        state.autoplayTimer = setInterval(() => {
            if (state.stepIndex >= lastStepIndex) {
                stopAutoplay();
                return;
            }
            state.stepIndex += 1;
            render();
        }, autoplayDelayMs);
    }

    function render() {
        const analysis = computeAnalysis();
        const steps = buildSteps(analysis);

        renderScenarioCards(analysis);
        renderScenarioIntro(analysis);
        renderExpectations(analysis);
        renderTopology(analysis, steps);
        renderStepper(steps);
        renderStepDetail(steps);
        renderResult(analysis);
        renderEventLog(steps);

        els.prevStepBtn.disabled = state.stepIndex === 0;
        els.nextStepBtn.disabled = state.stepIndex === lastStepIndex;
    }

    function cacheElements() {
        [
            "conceptGrid",
            "requestPath",
            "scenarioGrid",
            "scenarioIntro",
            "queryField",
            "rangeField",
            "dedupToggle",
            "partialToggle",
            "resolutionSelect",
            "storeFilterInput",
            "runScenarioBtn",
            "prevStepBtn",
            "nextStepBtn",
            "resetScenarioBtn",
            "expectationPanel",
            "topologyView",
            "stepper",
            "stepDetail",
            "resultPanel",
            "eventLog",
            "markCompleteBtn",
            "completionState"
        ].forEach((id) => {
            els[id] = document.getElementById(id);
        });
    }

    function bindEvents() {
        els.scenarioGrid.addEventListener("click", (event) => {
            const button = event.target.closest("[data-scenario-id]");
            if (!button) {
                return;
            }
            loadScenario(button.getAttribute("data-scenario-id"), true);
        });

        els.runScenarioBtn.addEventListener("click", () => {
            syncControlsFromInputs();
            runAutoplay();
        });

        els.prevStepBtn.addEventListener("click", () => {
            stopAutoplay();
            syncControlsFromInputs();
            setStep(state.stepIndex - 1);
        });

        els.nextStepBtn.addEventListener("click", () => {
            stopAutoplay();
            syncControlsFromInputs();
            setStep(state.stepIndex + 1);
        });

        els.resetScenarioBtn.addEventListener("click", () => {
            loadScenario(state.scenarioId, false);
        });

        [els.dedupToggle, els.partialToggle, els.resolutionSelect, els.storeFilterInput].forEach((input) => {
            input.addEventListener("input", () => {
                stopAutoplay();
                syncControlsFromInputs();
                render();
            });
            input.addEventListener("change", () => {
                stopAutoplay();
                syncControlsFromInputs();
                render();
            });
        });

        els.stepper.addEventListener("click", (event) => {
            const card = event.target.closest("[data-step-index]");
            if (!card) {
                return;
            }
            stopAutoplay();
            syncControlsFromInputs();
            setStep(Number(card.getAttribute("data-step-index")));
        });

        if (els.markCompleteBtn && window.ThanosApp) {
            els.markCompleteBtn.addEventListener("click", () => {
                window.ThanosApp.markLabComplete("query");
                updateCompletionState();
            });
        }
    }

    document.addEventListener("DOMContentLoaded", function () {
        cacheElements();
        renderConcepts();
        renderRequestPath();
        updateControlInputs();
        render();
        bindEvents();
        updateCompletionState();
    });
}());
