//
// Based on Jupyter notebook (https://github.com/jupyter/notebook/blob/master/notebook/static/notebook/js/codemirror-ipythongfm.js)
//

CodeMirror.defineMode("ipythongfm", (config) => {
  var gfm_mode = CodeMirror.getMode(config, "markdown");
  var tex_mode = CodeMirror.getMode(config, "stex");
  return CodeMirror.multiplexingMode(
      gfm_mode,
      {
          open: "$$", close: "$$",
          mode: tex_mode,
          delimStyle: "delimit"
      },
      {
          open: "$", close: "$",
          mode: tex_mode,
          delimStyle: "delimit"
      },
      {
          open: "\\(", close: "\\)",
          mode: tex_mode,
          delimStyle: "delimit"
      },
      {
          open: "\\[", close: "\\]",
          mode: tex_mode,
          delimStyle: "delimit"
      }
  );
});
CodeMirror.defineMIME("text/x-ipythongfm", "ipythongfm");
