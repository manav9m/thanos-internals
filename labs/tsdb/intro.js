(function(){
  "use strict";

  document.addEventListener("DOMContentLoaded", function(){
    var data = window.TSDBLabData;
    var glossary = document.getElementById("glossary-list");
    var facts = document.getElementById("example-facts");

    if (glossary) {
      glossary.innerHTML = data.glossary.map(function(item){
        return '<div class="mini-card"><dt>' + item.term + '</dt><dd>' + item.definition + "</dd></div>";
      }).join("");
    }

    if (facts) {
      facts.innerHTML = [
        { title: "Example block", value: data.block.ulid },
        { title: "Series in the example", value: String(data.series.length) },
        { title: "Unique symbols", value: String(data.symbols.length) },
        { title: "Entry point", value: "last 52 bytes of index" }
      ].map(function(item){
        return '<div class="summary-card"><div class="hint">' + item.title + '</div><div style="margin-top:6px;font-weight:700">' + item.value + "</div></div>";
      }).join("");
    }

    var note = document.getElementById("example-note");
    if (note) {
      note.textContent = data.exampleNote;
    }
  });
})();
