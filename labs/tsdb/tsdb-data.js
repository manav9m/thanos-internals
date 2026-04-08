(function(){
  "use strict";

  var MINUTE = 60000;
  var HALF_HOUR = 30 * MINUTE;

  var series = [
    {
      id: 80,
      labels: {
        "__name__": "http_requests_total",
        "env": "prod",
        "instance": "api-001",
        "job": "api-server",
        "region": "us-east-1",
        "status": "200"
      },
      chunks: [
        { mint: 0, maxt: 30 * MINUTE, ref: 8 },
        { mint: 30 * MINUTE, maxt: 60 * MINUTE, ref: 4096 },
        { mint: 60 * MINUTE, maxt: 90 * MINUTE, ref: 8192 },
        { mint: 90 * MINUTE, maxt: 120 * MINUTE, ref: 12288 }
      ]
    },
    {
      id: 84,
      labels: {
        "__name__": "http_requests_total",
        "env": "prod",
        "instance": "api-002",
        "job": "api-server",
        "region": "us-east-1",
        "status": "200"
      },
      chunks: [
        { mint: 0, maxt: 30 * MINUTE, ref: 16384 },
        { mint: 30 * MINUTE, maxt: 60 * MINUTE, ref: 20480 },
        { mint: 60 * MINUTE, maxt: 90 * MINUTE, ref: 24576 },
        { mint: 90 * MINUTE, maxt: 120 * MINUTE, ref: 28672 }
      ]
    },
    {
      id: 88,
      labels: {
        "__name__": "http_requests_total",
        "env": "prod",
        "instance": "api-003",
        "job": "api-server",
        "region": "us-west-2",
        "status": "500"
      },
      chunks: [
        { mint: 30 * MINUTE, maxt: 60 * MINUTE, ref: 32768 },
        { mint: 60 * MINUTE, maxt: 90 * MINUTE, ref: 36864 },
        { mint: 90 * MINUTE, maxt: 120 * MINUTE, ref: 40960 },
        { mint: 120 * MINUTE, maxt: 150 * MINUTE, ref: 45056 }
      ]
    },
    {
      id: 92,
      labels: {
        "__name__": "http_requests_total",
        "env": "staging",
        "instance": "api-004",
        "job": "api-server",
        "region": "us-east-1",
        "status": "200"
      },
      chunks: [
        { mint: 0, maxt: 30 * MINUTE, ref: 49152 },
        { mint: 30 * MINUTE, maxt: 60 * MINUTE, ref: 53248 },
        { mint: 60 * MINUTE, maxt: 90 * MINUTE, ref: 57344 }
      ]
    },
    {
      id: 96,
      labels: {
        "__name__": "http_requests_total",
        "env": "prod",
        "instance": "batch-001",
        "job": "batch-worker",
        "region": "us-west-2",
        "status": "200"
      },
      chunks: [
        { mint: 30 * MINUTE, maxt: 60 * MINUTE, ref: 61440 },
        { mint: 60 * MINUTE, maxt: 90 * MINUTE, ref: 65536 },
        { mint: 90 * MINUTE, maxt: 120 * MINUTE, ref: 69632 }
      ]
    },
    {
      id: 100,
      labels: {
        "__name__": "http_requests_total",
        "env": "staging",
        "instance": "batch-002",
        "job": "batch-worker",
        "region": "us-west-2",
        "status": "500"
      },
      chunks: [
        { mint: 0, maxt: 30 * MINUTE, ref: 4294967424 },
        { mint: 30 * MINUTE, maxt: 60 * MINUTE, ref: 4294971520 }
      ]
    },
    {
      id: 104,
      labels: {
        "__name__": "up",
        "env": "prod",
        "instance": "query-001",
        "job": "query-frontend",
        "region": "eu-west-1",
        "status": "200"
      },
      chunks: [
        { mint: 0, maxt: 30 * MINUTE, ref: 4294975616 },
        { mint: 30 * MINUTE, maxt: 60 * MINUTE, ref: 4294979712 }
      ]
    },
    {
      id: 108,
      labels: {
        "__name__": "up",
        "env": "staging",
        "instance": "query-002",
        "job": "query-frontend",
        "region": "eu-west-1",
        "status": "500"
      },
      chunks: [
        { mint: 30 * MINUTE, maxt: 60 * MINUTE, ref: 4294983808 },
        { mint: 60 * MINUTE, maxt: 90 * MINUTE, ref: 4294987904 }
      ]
    }
  ];

  function labelPairs(labels){
    return Object.keys(labels).sort().map(function(name){
      return { name: name, value: labels[name] };
    });
  }

  function formatLabels(labels){
    return labelPairs(labels).map(function(pair){
      return pair.name + '="' + pair.value + '"';
    }).join(", ");
  }

  series.forEach(function(entry){
    entry.abs = entry.id * 16;
    entry.labelPairs = labelPairs(entry.labels);
    entry.labelText = formatLabels(entry.labels);
    entry.entryBytes = 96;
    entry.chunks.forEach(function(chunk){
      var seq = Math.floor(chunk.ref / 4294967296);
      chunk.file = String(seq + 1).padStart(6, "0");
      chunk.offset = chunk.ref - (seq * 4294967296);
    });
  });

  var symbolSet = {};
  series.forEach(function(entry){
    entry.labelPairs.forEach(function(pair){
      symbolSet[pair.name] = true;
      symbolSet[pair.value] = true;
    });
  });
  var symbols = Object.keys(symbolSet).sort();
  var symbolIndex = {};
  symbols.forEach(function(symbol, idx){
    symbolIndex[symbol] = idx;
  });

  var postingsMap = {};
  series.forEach(function(entry){
    entry.labelPairs.forEach(function(pair){
      var key = pair.name + "\n" + pair.value;
      if (!postingsMap[key]) {
        postingsMap[key] = { name: pair.name, value: pair.value, ids: [] };
      }
      postingsMap[key].ids.push(entry.id);
    });
  });

  var allPostings = { name: "", value: "", ids: series.map(function(entry){ return entry.id; }) };
  var postings = Object.keys(postingsMap).map(function(key){
    return postingsMap[key];
  }).sort(function(a, b){
    if (a.name === b.name) {
      return a.value.localeCompare(b.value);
    }
    return a.name.localeCompare(b.name);
  });

  var postingsBase = 2688;
  var tableBase;
  var currentOffset = postingsBase;
  var postingsWithAll = [allPostings].concat(postings).map(function(posting){
    var sectionSize = 12 + posting.ids.length * 4;
    var copy = {
      name: posting.name,
      value: posting.value,
      ids: posting.ids.slice(),
      sectionOffset: currentOffset,
      sectionSize: sectionSize
    };
    currentOffset += sectionSize;
    return copy;
  });

  tableBase = currentOffset;
  var tableOffset = tableBase;
  postingsWithAll.forEach(function(posting){
    posting.tableOffset = tableOffset;
    posting.tableBytes = 22 + posting.name.length + posting.value.length;
    tableOffset += posting.tableBytes;
  });

  var fileSize = tableOffset + 52;
  var tocOffset = fileSize - 52;

  var sections = [
    { id: "header", label: "Header", start: 0, size: 5, band: "band-header" },
    { id: "symbols", label: "Symbol Table", start: 5, size: 731, band: "band-symbols" },
    { id: "series", label: "Series Region", start: 1024, size: 1664, band: "band-series" },
    { id: "label-index", label: "Label Index (deprecated, empty)", start: 2688, size: 0, band: "band-empty" },
    { id: "postings", label: "Postings", start: postingsBase, size: tableBase - postingsBase, band: "band-postings" },
    { id: "label-offsets", label: "Label Offset Table (deprecated, empty)", start: tableBase, size: 0, band: "band-empty" },
    { id: "postings-table", label: "Postings Offset Table", start: tableBase, size: tocOffset - tableBase, band: "band-offsets" },
    { id: "toc", label: "TOC (last 52 bytes)", start: tocOffset, size: 52, band: "band-toc" }
  ];

  var sparseValues = [];
  for (var i = 1; i <= 64; i += 1) {
    sparseValues.push("api-" + String(i).padStart(3, "0"));
  }

  var queryScenario = {
    selector: '{job="api-server", env="prod"}',
    t1: 45 * MINUTE,
    t2: 135 * MINUTE,
    postingsLeft: postings.find(function(posting){
      return posting.name === "job" && posting.value === "api-server";
    }),
    postingsRight: postings.find(function(posting){
      return posting.name === "env" && posting.value === "prod";
    }),
    intersection: [80, 84, 88]
  };

  queryScenario.series = queryScenario.intersection.map(function(id){
    return series.find(function(entry){ return entry.id === id; });
  });
  queryScenario.survivingChunks = [];
  queryScenario.series.forEach(function(entry){
    entry.chunks.forEach(function(chunk){
      if (chunk.mint <= queryScenario.t2 && chunk.maxt >= queryScenario.t1) {
        queryScenario.survivingChunks.push({ seriesId: entry.id, chunk: chunk });
      }
    });
  });

  window.TSDBLabData = {
    minute: MINUTE,
    halfHour: HALF_HOUR,
    series: series,
    symbols: symbols,
    symbolIndex: symbolIndex,
    postings: postings,
    postingsWithAll: postingsWithAll,
    sections: sections,
    toc: {
      Symbols: 5,
      Series: 1024,
      LabelIndices: 2688,
      LabelIndicesTable: tableBase,
      Postings: postingsBase,
      PostingsTable: tableBase,
      CRC32: "0x91AC3F02",
      Start: tocOffset,
      FileSize: fileSize
    },
    block: {
      ulid: "01EM6Q6A1YPX4G9TEB20J22B2R",
      files: [
        {
          id: "chunks",
          path: "chunks/",
          title: "chunks/",
          summary: "Compressed sample bytes. Chunk files do not store labels.",
          detail: "Chunk segment files contain len, encoding, data, and CRC32 for each chunk. Time filtering does not happen here; it happens from metadata stored in the index."
        },
        {
          id: "index",
          path: "index",
          title: "index",
          summary: "The lookup map used by this lab.",
          detail: "The index stores the symbol table, series metadata, postings lists, and the TOC at EOF. Prometheus uses it to answer label queries and jump to chunk refs."
        },
        {
          id: "meta",
          path: "meta.json",
          title: "meta.json",
          summary: "Block identity and time range.",
          detail: "meta.json records the ULID, minTime, maxTime, stats, and compaction metadata for the block."
        },
        {
          id: "tombstones",
          path: "tombstones",
          title: "tombstones",
          summary: "Deletion markers.",
          detail: "Tombstones store deleted time ranges for series references. Query execution must skip samples covered by these deletion ranges."
        }
      ]
    },
    glossary: [
      { term: "time series", definition: "One metric stream over time, usually identified by a metric name plus a set of labels." },
      { term: "block", definition: "A folder on disk that groups a time range of immutable TSDB data." },
      { term: "label", definition: 'A key/value pair such as job="api-server" or env="prod".' },
      { term: "posting", definition: "A series ID inside an inverted index list for one label pair." },
      { term: "chunk", definition: "A compressed batch of samples stored in a chunk segment file." },
      { term: "chunk ref", definition: "A uint64 that tells Prometheus which chunk file and byte offset to seek." }
    ],
    sparseCacheDemo: {
      label: "instance",
      values: sparseValues,
      cached: [sparseValues[0], sparseValues[32], sparseValues[63]]
    },
    queryScenario: queryScenario,
    exampleNote: "These pages use one small example block. The byte offsets are from the example block; the file rules and formulas match the real Prometheus TSDB format."
  };
})();
