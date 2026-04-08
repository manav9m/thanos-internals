(function(){
  "use strict";

  document.addEventListener("DOMContentLoaded", function(){
    var data = window.TSDBLabData;
    var list = document.getElementById("file-list");
    var detail = document.getElementById("file-detail");
    var buttons = [];

    function renderDetail(file){
      detail.innerHTML = [
        "<h3>" + file.title + "</h3>",
        '<p class="muted">' + file.summary + "</p>",
        "<p>" + file.detail + "</p>"
      ].join("");
    }

    function activate(fileId){
      var file = data.block.files.find(function(entry){ return entry.id === fileId; });
      if (!file) return;
      buttons.forEach(function(button){
        button.classList.toggle("active", button.getAttribute("data-file") === fileId);
      });
      renderDetail(file);
    }

    list.innerHTML = data.block.files.map(function(file){
      return [
        '<button class="file-button" data-file="' + file.id + '">',
        "<strong>" + file.path + "</strong>",
        '<div class="hint" style="margin-top:6px">' + file.summary + "</div>",
        "</button>"
      ].join("");
    }).join("");

    buttons = Array.prototype.slice.call(list.querySelectorAll(".file-button"));
    buttons.forEach(function(button){
      button.addEventListener("click", function(){
        activate(button.getAttribute("data-file"));
      });
    });

    activate("index");
  });
})();
