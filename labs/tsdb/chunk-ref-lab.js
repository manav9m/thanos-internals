(function(){
  "use strict";

  document.addEventListener("DOMContentLoaded", function(){
    var data = window.TSDBLabData;
    var refInput = document.getElementById("chunk-ref-input");
    var fileInput = document.getElementById("chunk-file-input");
    var offsetInput = document.getElementById("chunk-offset-input");
    var decodeButton = document.getElementById("decode-ref");
    var encodeButton = document.getElementById("encode-ref");
    var output = document.getElementById("chunk-ref-output");
    var track = document.getElementById("chunk-file-track");

    var knownRefs = [];
    data.series.forEach(function(entry){
      entry.chunks.forEach(function(chunk){
        knownRefs.push(chunk);
      });
    });

    function renderTrack(refValue){
      track.innerHTML = ["000001", "000002"].map(function(fileName){
        var chunks = knownRefs.filter(function(chunk){ return chunk.file === fileName; });
        return [
          '<div class="chunk-slot">',
          "<strong>" + fileName + "</strong>",
          '<div class="hint" style="margin-top:6px">8-byte header, then chunk records</div>',
          chunks.map(function(chunk){
            var target = String(chunk.ref) === String(refValue) ? " chunk-slot target" : " chunk-slot";
            return [
              '<div class="' + target + '" style="margin-top:8px">',
              '<div class="mono">' + chunk.offset + "</div>",
              '<div class="hint">' + window.TSDBTrack.formatMs(chunk.mint) + " to " + window.TSDBTrack.formatMs(chunk.maxt) + "</div>",
              "</div>"
            ].join("");
          }).join(""),
          "</div>"
        ].join("");
      }).join("");
    }

    function decode(){
      var raw = refInput.value.trim();
      if (!raw) return;
      var ref = raw.startsWith("0x") || raw.startsWith("0X") ? BigInt(raw) : BigInt(Number(raw));
      var decoded = window.TSDBTrack.decodeChunkRef(ref);
      output.innerHTML = [
        "<h3>Decoded chunk ref</h3>",
        "<p><strong>segment_seq</strong> = " + decoded.segmentSeq + "</p>",
        "<p><strong>in-file offset</strong> = " + decoded.offset + "</p>",
        "<p><strong>filename</strong> = " + decoded.file + "</p>",
        '<p class="muted">Formula: <code>segment_seq = ref >> 32</code> and <code>offset = ref & 0xFFFFFFFF</code>.</p>'
      ].join("");
      fileInput.value = decoded.file;
      offsetInput.value = decoded.offset;
      renderTrack(ref);
    }

    function encode(){
      var fileName = fileInput.value.trim() || "000001";
      var offset = Number(offsetInput.value || 0);
      var seq = Math.max(Number(fileName) - 1, 0);
      var ref = (BigInt(seq) << 32n) | BigInt(offset >>> 0);
      refInput.value = String(ref);
      decode();
    }

    decodeButton.addEventListener("click", decode);
    encodeButton.addEventListener("click", encode);

    refInput.value = String(data.queryScenario.survivingChunks[0].chunk.ref);
    decode();
  });
})();
