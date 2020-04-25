//
// Based on Jupyter notebook (https://github.com/jupyter/notebook/blob/master/notebook/static/notebook/js/codemirror-ipythongfm.js)
//

CodeMirror.defineMode("ipythongfm", (config) => {
  var markdown = CodeMirror.getMode(config, "markdown");
  var stex = CodeMirror.getMode(config, "stex");
  return CodeMirror.multiplexingMode(
    markdown,
    {
      open: "$$$", close: "$$$",
      mode: stex,
      delimStyle: "delimit"
    },
    {
      open: "$$", close: "$$",
      mode: stex,
      delimStyle: "delimit"
    },
    {
      open: "$", close: "$",
      mode: stex,
      delimStyle: "delimit"
    },
  );
});
CodeMirror.defineMIME("text/x-ipythongfm", "ipythongfm");
