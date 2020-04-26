//
// Based on Jupyter notebook (https://github.com/jupyter/notebook/blob/master/notebook/static/notebook/js/codemirror-ipythongfm.js)
//

CodeMirror.defineMode("ipythongfm", (config) => {
  var markdown = CodeMirror.getMode(config, "markdown");
  var stex = CodeMirror.getMode(config, "stex");
  var kDelimiters = [
    ['$$$', '$$$'],
    ['$$', '$$'],
    ['$', '$'],
    ['\\\[', '\\\]'],
    ['\\\(', '\\\)'],
  ];
  var options = kDelimiters.map(
      ([open, close]) => ({ open, close, mode: stex, delimStyle: 'delimit' }));
  return CodeMirror.multiplexingMode(markdown, ...options);
});
CodeMirror.defineMIME("text/x-ipythongfm", "ipythongfm");
