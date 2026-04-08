(function(){
  "use strict";

  function textForPosting(posting){
    return posting.name + '="' + posting.value + '"';
  }

  function intersect(left, right){
    var result = [];
    var trace = [];
    var i = 0;
    var j = 0;
    while (i < left.length && j < right.length) {
      if (left[i] === right[j]) {
        result.push(left[i]);
        trace.push("match " + left[i]);
        i += 1;
        j += 1;
      } else if (left[i] < right[j]) {
        trace.push(left[i] + " < " + right[j] + ", advance left");
        i += 1;
      } else {
        trace.push(right[j] + " < " + left[i] + ", advance right");
        j += 1;
      }
    }
    return { result: result, trace: trace };
  }

  document.addEventListener("DOMContentLoaded", function(){
    var data = window.TSDBLabData;
    var leftSelect = document.getElementById("left-posting");
    var rightSelect = document.getElementById("right-posting");
    var leftBox = document.getElementById("left-posting-box");
    var rightBox = document.getElementById("right-posting-box");
    var resultBox = document.getElementById("intersection-box");
    var traceBox = document.getElementById("intersection-trace");
    var cacheBox = document.getElementById("cache-demo");

    var options = data.postings.map(function(posting){
      var key = posting.name + "\n" + posting.value;
      return '<option value="' + key + '">' + textForPosting(posting) + " (" + posting.ids.length + " series)</option>";
    }).join("");

    leftSelect.innerHTML = options;
    rightSelect.innerHTML = options;
    leftSelect.value = "job\napi-server";
    rightSelect.value = "env\nprod";

    function findPosting(value){
      var parts = value.split("\n");
      return data.postings.find(function(posting){
        return posting.name === parts[0] && posting.value === parts[1];
      });
    }

    function renderPosting(box, posting, title){
      box.innerHTML = [
        "<strong>" + title + "</strong>",
        '<div class="hint" style="margin-top:6px">' + textForPosting(posting) + "</div>",
        '<div class="token-cloud" style="margin-top:10px">' + posting.ids.map(function(id){
          return '<span class="token">' + id + "</span>";
        }).join("") + "</div>"
      ].join("");
    }

    function renderCache(){
      cacheBox.innerHTML = [
        '<p class="muted">The real reader keeps every 32nd label value plus the first and last value in memory. This small demo shows what that looks like for a wide <code>instance</code> label.</p>',
        '<div class="token-cloud">' + data.sparseCacheDemo.values.map(function(value){
          var hit = data.sparseCacheDemo.cached.indexOf(value) !== -1;
          return '<span class="token' + (hit ? " hit" : "") + '">' + value + (hit ? " cached" : "") + "</span>";
        }).join("") + "</div>"
      ].join("");
    }

    function render(){
      var left = findPosting(leftSelect.value);
      var right = findPosting(rightSelect.value);
      var merge = intersect(left.ids, right.ids);

      renderPosting(leftBox, left, "Left postings list");
      renderPosting(rightBox, right, "Right postings list");

      resultBox.innerHTML = [
        "<strong>Intersection result</strong>",
        '<div class="hint" style="margin-top:6px">This is the AND operation for two positive matchers.</div>',
        '<div class="token-cloud" style="margin-top:10px">' + merge.result.map(function(id){
          return '<span class="token hit">' + id + "</span>";
        }).join("") + "</div>"
      ].join("");

      traceBox.innerHTML = merge.trace.map(function(line){
        return '<div class="check-item">' + line + "</div>";
      }).join("");
    }

    leftSelect.addEventListener("change", render);
    rightSelect.addEventListener("change", render);

    renderCache();
    render();
  });
})();
