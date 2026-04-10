(function () {
    window.QueryLabData = {
        replicaLabels: ["replica"],
        concepts: [
            {
                title: "Query API",
                body: "Querier exposes the Prometheus HTTP v1 API. Grafana and other clients send normal Prometheus queries here instead of talking to Sidecars or Store Gateways directly."
            },
            {
                title: "StoreAPI fanout",
                body: "Querier discovers the StoreAPI backends that might have data for the request, then sends concurrent selector requests to them. Backends can be Sidecars, Store Gateways, Rulers, Receivers, or even another Querier."
            },
            {
                title: "Deduplication",
                body: "If two returned series differ only by configured replica labels such as replica=A and replica=B, Querier can merge them into one logical series. If the labels differ in any other way, they stay separate."
            },
            {
                title: "Partial response",
                body: "If a selected store errors or times out, Querier can either abort the whole query or return available data with warnings. This is the accuracy-versus-availability tradeoff."
            },
            {
                title: "Downsampling",
                body: "Querier can ask Store Gateways for raw, 5m, or 1h data depending on max_source_resolution. Higher resolution values trade detail for fewer samples on long-range queries."
            },
            {
                title: "Stateless design",
                body: "Querier does not own TSDB blocks. Because it keeps no durable query state, you can run multiple Queriers behind a load balancer and scale them horizontally."
            }
        ],
        requestPath: [
            {
                title: "Client sends an HTTP query",
                body: "Grafana or another client calls the Prometheus-compatible Query API on Querier."
            },
            {
                title: "Querier discovers candidate stores",
                body: "It uses its connected endpoints, optional store filters, and the query shape to decide which StoreAPI backends should be asked."
            },
            {
                title: "Querier fans out selector requests",
                body: "The query is dissected into the selectors needed for evaluation, and those selects are sent concurrently to the chosen stores."
            },
            {
                title: "Stores reply with series or errors",
                body: "Each store returns raw or downsampled series data, or an error or timeout if it is unavailable."
            },
            {
                title: "Querier deduplicates and evaluates",
                body: "If dedup is enabled and replica labels are configured, overlapping HA replicas are merged before the PromQL engine finishes evaluation."
            },
            {
                title: "Querier returns one answer",
                body: "The final response goes back to the client as results, results plus warnings, or an error if the query cannot be completed."
            }
        ],
        scenarios: [
            {
                id: "global-view",
                badge: "Scenario 1",
                recommended: true,
                title: "Global view across three clusters",
                focus: "See the basic fanout path when all stores are healthy and no deduplication is needed.",
                goal: "Understand the easiest Query path: one request, several healthy stores, one normal answer.",
                howToUse: "Leave deduplication ON, partial response OFF, and max source resolution at 0. Then click Run guided query.",
                expectedOutput: "All three stores answer successfully. The result panel should show 3 returned series and no warnings.",
                whyItHappens: "Each store serves a different cluster. Because they are not replicas of the same series, deduplication does not merge them.",
                query: 'up{job="prometheus", env="prod"}',
                timeRange: "Last 15m",
                defaults: {
                    dedup: true,
                    partialResponse: false,
                    maxSourceResolution: "0",
                    storeFilter: ""
                },
                expectations: [
                    "Three Sidecars are selected because each one serves a different cluster.",
                    "All stores are healthy, so there are no warnings and no failures.",
                    "Deduplication is effectively a no-op because the returned series are different by cluster, not only by replica."
                ],
                stores: [
                    {
                        id: "eu1-sidecar",
                        name: "Sidecar EU1",
                        kind: "Sidecar",
                        address: "prom-eu1.thanos-sidecar:10901",
                        health: "up",
                        resolutions: ["raw"],
                        description: "Live Prometheus data for cluster eu1.",
                        series: [
                            {
                                metric: "up",
                                labels: {
                                    __name__: "up",
                                    job: "prometheus",
                                    env: "prod",
                                    cluster: "eu1"
                                },
                                value: "1"
                            }
                        ]
                    },
                    {
                        id: "us1-sidecar",
                        name: "Sidecar US1",
                        kind: "Sidecar",
                        address: "prom-us1.thanos-sidecar:10901",
                        health: "up",
                        resolutions: ["raw"],
                        description: "Live Prometheus data for cluster us1.",
                        series: [
                            {
                                metric: "up",
                                labels: {
                                    __name__: "up",
                                    job: "prometheus",
                                    env: "prod",
                                    cluster: "us1"
                                },
                                value: "1"
                            }
                        ]
                    },
                    {
                        id: "ap1-sidecar",
                        name: "Sidecar AP1",
                        kind: "Sidecar",
                        address: "prom-ap1.thanos-sidecar:10901",
                        health: "up",
                        resolutions: ["raw"],
                        description: "Live Prometheus data for cluster ap1.",
                        series: [
                            {
                                metric: "up",
                                labels: {
                                    __name__: "up",
                                    job: "prometheus",
                                    env: "prod",
                                    cluster: "ap1"
                                },
                                value: "1"
                            }
                        ]
                    }
                ]
            },
            {
                id: "ha-dedup",
                badge: "Scenario 2",
                title: "HA replicas with runtime deduplication",
                focus: "Watch Querier merge replica A and replica B only when the rest of the label set matches.",
                goal: "See what deduplication does when two stores return the same series from two replicas.",
                howToUse: "Start with deduplication ON. Run the query once, then switch deduplication OFF and run again to compare the result.",
                expectedOutput: "With dedup ON, the c1 replica pair should collapse into one logical series, so you should see 2 returned series. With dedup OFF, both replicas stay visible, so you should see 3 returned series.",
                whyItHappens: "The series differ only by the configured replica label, so Querier can treat them as one logical time series.",
                query: 'up{job="prometheus", env="prod"}',
                timeRange: "Last 15m",
                defaults: {
                    dedup: true,
                    partialResponse: false,
                    maxSourceResolution: "0",
                    storeFilter: ""
                },
                expectations: [
                    "Cluster c1 has two Sidecars that differ only by replica label.",
                    "With dedup enabled, those two raw series collapse into one logical series for cluster c1.",
                    "If you turn dedup off, both replicas stay visible in the returned result."
                ],
                stores: [
                    {
                        id: "c1-replica-a",
                        name: "Cluster C1 Replica A",
                        kind: "Sidecar",
                        address: "prom-c1-a.thanos-sidecar:10901",
                        health: "up",
                        resolutions: ["raw"],
                        description: "Replica A for cluster c1.",
                        series: [
                            {
                                metric: "up",
                                labels: {
                                    __name__: "up",
                                    job: "prometheus",
                                    env: "prod",
                                    cluster: "c1",
                                    replica: "A"
                                },
                                value: "1"
                            }
                        ]
                    },
                    {
                        id: "c1-replica-b",
                        name: "Cluster C1 Replica B",
                        kind: "Sidecar",
                        address: "prom-c1-b.thanos-sidecar:10901",
                        health: "up",
                        resolutions: ["raw"],
                        description: "Replica B for cluster c1.",
                        series: [
                            {
                                metric: "up",
                                labels: {
                                    __name__: "up",
                                    job: "prometheus",
                                    env: "prod",
                                    cluster: "c1",
                                    replica: "B"
                                },
                                value: "1"
                            }
                        ]
                    },
                    {
                        id: "c2-replica-a",
                        name: "Cluster C2 Replica A",
                        kind: "Sidecar",
                        address: "prom-c2-a.thanos-sidecar:10901",
                        health: "up",
                        resolutions: ["raw"],
                        description: "Separate cluster, so this should remain separate even when dedup is enabled.",
                        series: [
                            {
                                metric: "up",
                                labels: {
                                    __name__: "up",
                                    job: "prometheus",
                                    env: "prod",
                                    cluster: "c2",
                                    replica: "A"
                                },
                                value: "1"
                            }
                        ]
                    }
                ]
            },
            {
                id: "partial-response",
                badge: "Scenario 3",
                title: "One selected store fails",
                focus: "See the difference between aborting the query and returning partial data with warnings.",
                goal: "Learn the difference between a strict query and a query that is allowed to continue when one store fails.",
                howToUse: "Keep partial response ON for the first run. Then turn it OFF and run the same scenario again.",
                expectedOutput: "With partial response ON, the query should still return healthy data plus a warning, so you should see 2 returned series and 1 warning. With it OFF, the query should abort and return no series.",
                whyItHappens: "Partial response changes the failure policy. It decides whether Query can return what it already has or must stop immediately.",
                query: 'up{job="prometheus", env="prod"}',
                timeRange: "Last 6h",
                defaults: {
                    dedup: true,
                    partialResponse: true,
                    maxSourceResolution: "0",
                    storeFilter: ""
                },
                expectations: [
                    "Two stores are healthy and one Store Gateway is unavailable.",
                    "With partial response enabled, the query still returns data from healthy stores plus warnings.",
                    "Turn partial response off and rerun the scenario to see the whole query fail."
                ],
                stores: [
                    {
                        id: "eu1-live",
                        name: "Sidecar EU1",
                        kind: "Sidecar",
                        address: "prom-eu1.thanos-sidecar:10901",
                        health: "up",
                        resolutions: ["raw"],
                        description: "Healthy live data for cluster eu1.",
                        series: [
                            {
                                metric: "up",
                                labels: {
                                    __name__: "up",
                                    job: "prometheus",
                                    env: "prod",
                                    cluster: "eu1"
                                },
                                value: "1"
                            }
                        ]
                    },
                    {
                        id: "us1-live",
                        name: "Sidecar US1",
                        kind: "Sidecar",
                        address: "prom-us1.thanos-sidecar:10901",
                        health: "up",
                        resolutions: ["raw"],
                        description: "Healthy live data for cluster us1.",
                        series: [
                            {
                                metric: "up",
                                labels: {
                                    __name__: "up",
                                    job: "prometheus",
                                    env: "prod",
                                    cluster: "us1"
                                },
                                value: "1"
                            }
                        ]
                    },
                    {
                        id: "historical-store",
                        name: "Historical Store Gateway",
                        kind: "Store Gateway",
                        address: "store-historical.thanos-store:10901",
                        health: "down",
                        resolutions: ["raw", "5m", "1h"],
                        description: "This backend is intentionally unavailable in this scenario.",
                        series: [
                            {
                                metric: "up",
                                labels: {
                                    __name__: "up",
                                    job: "prometheus",
                                    env: "prod",
                                    cluster: "archive"
                                },
                                value: "1"
                            }
                        ]
                    }
                ]
            },
            {
                id: "downsampling",
                badge: "Scenario 4",
                title: "Long-range query with downsampled blocks",
                focus: "See how max_source_resolution changes what Store Gateways return on long time ranges.",
                goal: "Understand why a long query may use downsampled data instead of raw samples.",
                howToUse: "Start with max source resolution set to 1h. Then change it to 0 and rerun so you can compare raw versus downsampled reads.",
                expectedOutput: "At 1h resolution, Querier should prefer the downsampled data path when the store has it, and you should see 2 returned series. At 0, it should request raw data instead, which is what the scenario uses for comparison.",
                whyItHappens: "Downsampled blocks contain fewer samples, so they are cheaper to read for long time ranges.",
                query: 'http_requests_total{job="api", cluster=~"eu1|eu2"}',
                timeRange: "Last 30d",
                defaults: {
                    dedup: false,
                    partialResponse: false,
                    maxSourceResolution: "1h",
                    storeFilter: ""
                },
                expectations: [
                    "The query hits Store Gateways that can serve raw, 5m, or 1h data.",
                    "At 1h resolution, Querier can ask for 1h data instead of raw samples for this long-range read.",
                    "Change max source resolution to 0 and rerun to see the same stores return raw data."
                ],
                stores: [
                    {
                        id: "eu1-store",
                        name: "Store Gateway EU1",
                        kind: "Store Gateway",
                        address: "store-eu1.thanos-store:10901",
                        health: "up",
                        resolutions: ["raw", "5m", "1h"],
                        description: "Historical object-storage blocks for cluster eu1.",
                        series: [
                            {
                                metric: "http_requests_total",
                                labels: {
                                    __name__: "http_requests_total",
                                    job: "api",
                                    cluster: "eu1"
                                },
                                value: "matrix"
                            }
                        ]
                    },
                    {
                        id: "eu2-store",
                        name: "Store Gateway EU2",
                        kind: "Store Gateway",
                        address: "store-eu2.thanos-store:10901",
                        health: "up",
                        resolutions: ["raw", "5m", "1h"],
                        description: "Historical object-storage blocks for cluster eu2.",
                        series: [
                            {
                                metric: "http_requests_total",
                                labels: {
                                    __name__: "http_requests_total",
                                    job: "api",
                                    cluster: "eu2"
                                },
                                value: "matrix"
                            }
                        ]
                    }
                ]
            }
        ]
    };
}());
