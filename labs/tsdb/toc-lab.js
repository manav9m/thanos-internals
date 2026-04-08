(function(){
  "use strict";

  document.addEventListener("DOMContentLoaded", function(){
    var data = window.TSDBLabData;
    var stack = document.getElementById("section-stack");
    var detail = document.getElementById("toc-detail");
    var buttons = Array.prototype.slice.call(document.querySelectorAll("[data-action]"));
    var activeId = "toc";

    function renderSections(){
      stack.innerHTML = data.sections.map(function(section){
        var info = section.id === "toc" ? "Always at fileSize - 52" : section.size + " bytes";
        return [
          '<div class="section-band ' + section.band + '" data-section="' + section.id + '">',
          '<div class="band-head"><span>' + section.label + "</span><span>" + info + "</span></div>",
          "<small>" + "start = " + section.start + "</small>",
          "</div>"
        ].join("");
      }).join("");

      Array.prototype.slice.call(stack.querySelectorAll("[data-section]")).forEach(function(node){
        node.addEventListener("click", function(){
          activate(node.getAttribute("data-section"));
        });
      });
    }

    function activate(id){
      activeId = id;
      Array.prototype.slice.call(stack.querySelectorAll("[data-section]")).forEach(function(node){
        node.classList.toggle("active", node.getAttribute("data-section") === id);
      });

      if (id === "toc") {
        detail.innerHTML = [
          "<h3>TOC: the first thing the reader touches</h3>",
          "<p>The reader seeks to <code>fileSize - 52</code>, reads the six refs plus CRC32, and then knows where every major section starts.</p>",
          '<table class="table"><thead><tr><th>Field</th><th>Value</th></tr></thead><tbody>',
          "<tr><td>ref(symbols)</td><td>" + data.toc.Symbols + "</td></tr>",
          "<tr><td>ref(series)</td><td>" + data.toc.Series + "</td></tr>",
          "<tr><td>ref(label indices start)</td><td>" + data.toc.LabelIndices + "</td></tr>",
          "<tr><td>ref(label offset table)</td><td>" + data.toc.LabelIndicesTable + "</td></tr>",
          "<tr><td>ref(postings start)</td><td>" + data.toc.Postings + "</td></tr>",
          "<tr><td>ref(postings offset table)</td><td>" + data.toc.PostingsTable + "</td></tr>",
          "<tr><td>CRC32</td><td>" + data.toc.CRC32 + "</td></tr>",
          "</tbody></table>"
        ].join("");
        return;
      }

      if (id === "symbols") {
        detail.innerHTML = [
          "<h3>Symbol Table</h3>",
          "<p>This section stores each label name and label value once. Later sections use symbol indexes instead of repeating the strings.</p>",
          '<div class="list-box"><table class="table"><thead><tr><th>Index</th><th>String</th></tr></thead><tbody>',
          data.symbols.slice(0, 14).map(function(symbol){
            return "<tr><td>" + data.symbolIndex[symbol] + "</td><td>" + symbol + "</td></tr>";
          }).join(""),
          "</tbody></table></div>"
        ].join("");
        return;
      }

      if (id === "postings-table") {
        detail.innerHTML = [
          "<h3>Postings Offset Table</h3>",
          "<p>This table maps one label pair to the byte offset of its postings list. Query lookup uses this table instead of the deprecated label index path.</p>",
          '<div class="list-box"><table class="table"><thead><tr><th>Name</th><th>Value</th><th>Postings offset</th></tr></thead><tbody>',
          data.postingsWithAll.slice(0, 8).map(function(posting){
            return "<tr><td>" + (posting.name || '""') + "</td><td>" + (posting.value || '""') + "</td><td>" + posting.sectionOffset + "</td></tr>";
          }).join(""),
          "</tbody></table></div>"
        ].join("");
        return;
      }

      detail.innerHTML = [
        "<h3>" + data.sections.find(function(section){ return section.id === id; }).label + "</h3>",
        "<p>This section is part of the example index layout. The key lesson on this page is that the reader reaches it by following a byte offset from the TOC.</p>"
      ].join("");
    }

    buttons.forEach(function(button){
      button.addEventListener("click", function(){
        var action = button.getAttribute("data-action");
        if (action === "read-toc") activate("toc");
        if (action === "jump-symbols") activate("symbols");
        if (action === "jump-postings-table") activate("postings-table");
      });
    });

    renderSections();
    activate(activeId);
  });
})();
