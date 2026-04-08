(function(){
  "use strict";

  var TRACK_KEY = "thanos_tsdb_track_progress_v1";
  var pages = [
    { id: "intro", title: "Start Here", file: "index.html", blurb: "Glossary, big picture, and the recommended order for learning the track." },
    { id: "block", title: "Lab 1: Block Basics", file: "block-basics.html", blurb: "Understand the four things inside a block folder and what each one does." },
    { id: "toc", title: "Lab 2: TOC Navigation", file: "toc-lab.html", blurb: "See how Prometheus starts with the last 52 bytes and jumps to the right section." },
    { id: "postings", title: "Lab 3: Postings", file: "postings-lab.html", blurb: "Turn label pairs into sorted series-ID lists and intersect them." },
    { id: "query", title: "Lab 4: Query Path", file: "query-path-lab.html", blurb: "Walk one exact query from matchers to surviving chunk refs." },
    { id: "chunk", title: "Lab 5: Chunk Refs", file: "chunk-ref-lab.html", blurb: "Decode the final uint64 jump into chunk file name and byte offset." }
  ];

  function loadProgress(){
    try {
      var parsed = JSON.parse(localStorage.getItem(TRACK_KEY) || "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (err) {
      return {};
    }
  }

  function saveProgress(progress){
    localStorage.setItem(TRACK_KEY, JSON.stringify(progress));
  }

  function formatMs(ms){
    var totalMinutes = Math.round(ms / 60000);
    var hours = Math.floor(totalMinutes / 60);
    var minutes = totalMinutes % 60;
    return hours + "h " + String(minutes).padStart(2, "0") + "m";
  }

  function decodeChunkRef(ref){
    var big = typeof ref === "bigint" ? ref : BigInt(ref);
    var segmentSeq = Number(big >> 32n);
    var offset = Number(big & 0xFFFFFFFFn);
    return {
      segmentSeq: segmentSeq,
      offset: offset,
      file: String(segmentSeq + 1).padStart(6, "0")
    };
  }

  function activePage(){
    return document.body.getAttribute("data-page") || "intro";
  }

  function renderTrackNav(){
    var nav = document.getElementById("track-nav");
    if (!nav) return;

    var current = activePage();
    var progress = loadProgress();

    nav.innerHTML = pages.map(function(page){
      var classes = ["track-link"];
      if (page.id === current) classes.push("active");
      if (progress[page.id]) classes.push("done");
      return '<a class="' + classes.join(" ") + '" href="' + page.file + '">' + page.title + "</a>";
    }).join("");
  }

  function renderProgress(){
    var progress = loadProgress();
    var count = pages.filter(function(page){ return progress[page.id]; }).length;
    var total = pages.length;
    var percent = total ? (count / total) * 100 : 0;

    var fill = document.getElementById("track-progress-fill");
    var copy = document.getElementById("track-progress-copy");
    if (fill) fill.style.width = percent + "%";
    if (copy) copy.textContent = count + " / " + total + " pages completed in this TSDB track";
  }

  function renderFooterNav(){
    var current = activePage();
    var index = pages.findIndex(function(page){ return page.id === current; });
    var prev = document.getElementById("prev-link");
    var next = document.getElementById("next-link");

    if (prev) {
      if (index > 0) {
        prev.href = pages[index - 1].file;
        prev.textContent = "Previous: " + pages[index - 1].title;
      } else {
        prev.style.display = "none";
      }
    }

    if (next) {
      if (index >= 0 && index < pages.length - 1) {
        next.href = pages[index + 1].file;
        next.textContent = "Next: " + pages[index + 1].title;
      } else {
        next.href = "index.html";
        next.textContent = "Back To TSDB Track";
      }
    }
  }

  function wireCompleteButton(){
    var button = document.getElementById("page-complete");
    if (!button) return;

    var current = activePage();
    var progress = loadProgress();

    if (progress[current]) {
      button.textContent = "Page completed";
      button.disabled = true;
      return;
    }

    button.addEventListener("click", function(){
      var latest = loadProgress();
      latest[current] = true;
      saveProgress(latest);
      renderTrackNav();
      renderProgress();

      button.textContent = "Page completed";
      button.disabled = true;

      var count = pages.filter(function(page){ return latest[page.id]; }).length;
      if (count === pages.length && window.ThanosApp && typeof window.ThanosApp.markLabComplete === "function") {
        window.ThanosApp.markLabComplete("tsdb");
      }
    });
  }

  function renderTrackCards(){
    var container = document.getElementById("track-cards");
    if (!container) return;

    var progress = loadProgress();
    container.innerHTML = pages.map(function(page, index){
      var status = progress[page.id] ? "Completed" : "Open page";
      var className = "lab-card" + (progress[page.id] ? " is-done" : "");
      return [
        '<div class="' + className + '">',
        '<div class="pill">Step ' + (index + 1) + "</div>",
        "<h3>" + page.title + "</h3>",
        '<p class="muted">' + page.blurb + "</p>",
        '<p class="hint" style="margin:10px 0 0">' + status + "</p>",
        '<a class="btn primary" href="' + page.file + '">Open</a>',
        "</div>"
      ].join("");
    }).join("");
  }

  function renderPageTitle(){
    var title = document.getElementById("page-title");
    if (!title) return;
    var current = activePage();
    var page = pages.find(function(entry){ return entry.id === current; });
    if (page) title.textContent = page.title;
  }

  document.addEventListener("DOMContentLoaded", function(){
    renderTrackNav();
    renderProgress();
    renderTrackCards();
    renderFooterNav();
    renderPageTitle();
    wireCompleteButton();
  });

  window.TSDBTrack = {
    pages: pages,
    loadProgress: loadProgress,
    saveProgress: saveProgress,
    formatMs: formatMs,
    decodeChunkRef: decodeChunkRef
  };
})();
