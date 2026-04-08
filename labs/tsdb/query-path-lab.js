(function(){
  "use strict";

  document.addEventListener("DOMContentLoaded", function(){
    var data = window.TSDBLabData;
    var scenario = data.queryScenario;
    var runButton = document.getElementById("run-guided-query");
    var nextButton = document.getElementById("next-step");
    var prevButton = document.getElementById("prev-step");
    var stepsEl = document.getElementById("query-steps");
    var detailEl = document.getElementById("query-step-detail");
    var visualEl = document.getElementById("query-visual");
    var resultEl = document.getElementById("query-result");
    var timer = null;
    var current = -1;

    var steps = [
      {
        title: "Read TOC (52 bytes)",
        note: "Seek to fileSize - 52 and decode the six section refs plus CRC32.",
        focus: "toc",
        extra: "Example TOC starts at byte " + data.toc.Start + "."
      },
      {
        title: 'Lookup postings offset for job="api-server"',
        note: "Use the postings offset table to find where the postings list for the first matcher begins.",
        focus: "postings-table",
        extra: 'Posting resolves to IDs [' + scenario.postingsLeft.ids.join(", ") + "]."
      },
      {
        title: 'Lookup postings offset for env="prod"',
        note: "Resolve the second matcher the same way.",
        focus: "postings-table",
        extra: 'Posting resolves to IDs [' + scenario.postingsRight.ids.join(", ") + "]."
      },
      {
        title: "Read both postings lists",
        note: "Each postings list is a sorted list of series IDs for one label pair.",
        focus: "postings",
        extra: "The two sorted arrays are now ready for an AND operation."
      },
      {
        title: "Intersect the postings lists",
        note: "Use a two-pointer merge over the two sorted arrays.",
        focus: "postings",
        extra: "Intersection result = [" + scenario.intersection.join(", ") + "]."
      },
      {
        title: "Jump to the matching series entries",
        note: "For each series ID, compute absoluteOffset = seriesID * 16 and read that series entry.",
        focus: "series",
        extra: scenario.series.map(function(entry){
          return entry.id + " -> " + entry.abs;
        }).join(" | ")
      },
      {
        title: "Filter chunks by time range",
        note: "Keep chunks where chunk.mint <= T2 and chunk.maxt >= T1.",
        focus: "series",
        extra: "Window " + window.TSDBTrack.formatMs(scenario.t1) + " to " + window.TSDBTrack.formatMs(scenario.t2) + "."
      },
      {
        title: "Decode chunk refs",
        note: "Split each surviving chunk ref into segment sequence and in-file offset.",
        focus: "postings-table",
        extra: scenario.survivingChunks.slice(0, 4).map(function(item){
          var decoded = window.TSDBTrack.decodeChunkRef(item.chunk.ref);
          return item.seriesId + " -> " + decoded.file + ":" + decoded.offset;
        }).join(" | ")
      },
      {
        title: "Return lazy iterators",
        note: "Prometheus yields series and chunk iterators. Chunk bytes are still read lazily.",
        focus: "toc",
        extra: scenario.series.length + " matching series, " + scenario.survivingChunks.length + " surviving chunk refs."
      }
    ];

    function renderStepList(){
      stepsEl.innerHTML = steps.map(function(step, idx){
        var classes = ["step"];
        if (idx < current) classes.push("done");
        if (idx === current) classes.push("current");
        return [
          '<div class="' + classes.join(" ") + '">',
          "<small>Step " + (idx + 1) + "</small>",
          '<div style="margin-top:6px;font-weight:700">' + step.title + "</div>",
          "</div>"
        ].join("");
      }).join("");
    }

    function renderVisual(){
      visualEl.innerHTML = data.sections.map(function(section){
        var isActive = current >= 0 && section.id === steps[current].focus;
        return [
          '<div class="section-band ' + section.band + (isActive ? " active" : "") + '">',
          '<div class="band-head"><span>' + section.label + "</span><span>" + section.size + " B</span></div>",
          "<small>start = " + section.start + "</small>",
          "</div>"
        ].join("");
      }).join("");
    }

    function renderResult(){
      resultEl.innerHTML = scenario.series.map(function(entry){
        var kept = entry.chunks.filter(function(chunk){
          return chunk.mint <= scenario.t2 && chunk.maxt >= scenario.t1;
        });
        return [
          '<div class="check-item">',
          "<strong>seriesID " + entry.id + "</strong><br>",
          '<span class="hint">' + entry.labelText + "</span><br>",
          '<span class="hint">Surviving chunks: ' + kept.map(function(chunk){
            return chunk.file + ":" + chunk.offset;
          }).join(", ") + "</span>",
          "</div>"
        ].join("");
      }).join("");
    }

    function showStep(index){
      current = index;
      renderStepList();
      renderVisual();

      if (index < 0) {
        detailEl.innerHTML = [
          "<h3>Click Run Guided Query</h3>",
          "<p>This page walks the exact path from a label selector to chunk refs in the chunks directory.</p>",
          "<p><strong>Scenario:</strong> " + scenario.selector + " over " + window.TSDBTrack.formatMs(scenario.t1) + " to " + window.TSDBTrack.formatMs(scenario.t2) + "</p>"
        ].join("");
        return;
      }

      var step = steps[index];
      detailEl.innerHTML = [
        "<h3>" + step.title + "</h3>",
        "<p>" + step.note + "</p>",
        '<div class="note"><strong>Example detail:</strong> ' + step.extra + "</div>"
      ].join("");
    }

    function stopRun(){
      if (timer) {
        window.clearInterval(timer);
        timer = null;
      }
    }

    runButton.addEventListener("click", function(){
      stopRun();
      showStep(-1);
      current = 0;
      showStep(0);
      timer = window.setInterval(function(){
        if (current >= steps.length - 1) {
          stopRun();
          return;
        }
        showStep(current + 1);
      }, 1100);
    });

    nextButton.addEventListener("click", function(){
      stopRun();
      if (current < steps.length - 1) {
        showStep(current + 1);
      }
    });

    prevButton.addEventListener("click", function(){
      stopRun();
      if (current > 0) {
        showStep(current - 1);
      } else {
        showStep(-1);
      }
    });

    renderResult();
    showStep(-1);
  });
})();
