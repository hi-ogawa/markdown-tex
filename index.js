var kInput = document.querySelector('#input')
var kOutput = document.querySelector('#output');

var kKatexOptions = {
  output: 'html',
  throwOnError: false,
};

var kCodemirrorOptions = {
  mode: 'ipythongfm',
  tabSize: 2,
  indentWithTabs: false,
  lineNumbers: true,
  "extraKeys": {
    // Minimal emacs keybindings
    "Ctrl-B": "goCharLeft",
    "Ctrl-F": "goCharRight",
    "Ctrl-P": "goLineUp",
    "Ctrl-N": "goLineDown",
    "Ctrl-A": "goLineStart",
    "Ctrl-E": "goLineEnd",

    // Spaces for Tab (cf. https://github.com/codemirror/CodeMirror/issues/988)
    "Tab": (cm) => cm.execCommand("indentMore"),
    "Shift-Tab": (cm) => cm.execCommand("indentLess"),

    // Comment addon
    "Ctrl-/": (cm) => cm.toggleComment(),
  }
};

var kConverter = new window.showdown.Converter();
var kEditor = CodeMirror(kInput, kCodemirrorOptions);
var memoized_katex_renderToString = _.memoize(katex.renderToString, (...args) => JSON.stringify(args));

var convert = (src) => {
  //
  // Strategy here is
  //   - Extract math code and render
  //   - Run Showdown
  //   - Put back rendered math code
  // so that, Showdown doesn't see TeX code or KaTeX's output at all.
  //

  // Collect $$$...$$$ as global header (e.g. for macros)
  var global = '';
  src = src.replace(/\$\$\$([^\$]+?)\$\$\$/gm, (_, p1) => {
    global += p1;
    return '';
  });

  // Convert $$...$$ and $...$ to temporary <escape-tex> tag with id, so that Showdown does nothing about them.
  var outputs = [];
  src = src.replace(/\$\$([^\$]+?)\$\$/gm, (_, p1) => {
    const id = outputs.length;
    outputs.push(memoized_katex_renderToString(global + p1, { displayMode: true, ...kKatexOptions }));
    return `<escape-tex id="${id}"/>`;
  });
  src = src.replace(/\$([^\$]+?)\$/gm, (_, p1) => {
    const id = outputs.length;
    outputs.push(memoized_katex_renderToString(global + p1, { displayMode: false, ...kKatexOptions }));
    return `<escape-tex id="${id}"/>`;
  });

  // Run Showdown (markdown -> html)
  src = kConverter.makeHtml(src);

  // Insert TeX back to html
  src = src.replace(/<escape-tex id="(.*?)"\/>/gm, (_, p1) => {
    return outputs[Number(p1)];
  });

  return src;
}

var preview = (src) => {
  const output = convert(src);
  kOutput.innerHTML = output;
}
var throttledPreview = _.throttle(preview, 300, { leading: true, trailing : true });

kEditor.doc.on('change', () => {
  throttledPreview(kEditor.getValue());
});

//
// Use Gist as data storage
//
var kUrlQuery = _.fromPairs(window.location.search.substr(1).split('&').map(e => e.split('=')));
var { id : kId, filename : kFilename } = kUrlQuery;
var kToken = window.localStorage.getItem('token');

var fetchToJson = (resp) => {
  if (!resp.ok) { throw resp.statusText; }
  return resp.json();
}

var gistGet = (id, token) =>
  fetch('https://api.github.com/gists/' + id, {
    // if public, request will succeed without token
    headers: { Authorization: token ? `token ${token}` : null }
  }).then(fetchToJson);

var gistGetFile = (id, token, filename) =>
  gistGet(id, token).then((respJson) => {
    if (!(filename in respJson.files)) {
      throw `Gist not found : filename = ${filename}`;
    }
    return respJson.files[filename].content;
  });

var gistUpdate = (id, token, filename, content) =>
  fetch('https://api.github.com/gists/' + id, {
    method: 'PATCH',
    headers: { Authorization: `token ${token}` },
    body: JSON.stringify({
      files: { [filename]: { content } }
    })
  }).then(fetchToJson);

if (kId && kFilename) {
  // Load
  document.title = 'Markdown Tex (Loading...)';
  gistGetFile(kId, kToken, kFilename).then((content) => {
    document.title = 'Markdown Tex';
    kEditor.setValue(content);
  }).catch(window.alert);

  // Update on Control-s (if token is valid)
  document.addEventListener('keydown', (event) => {
    if (event.ctrlKey && event.key == 's') {
      event.preventDefault();
      if (!kToken) {
        window.alert('Access token must be provided to save data');
        return;
      }
      document.title = 'Markdown Tex (Saving...)';
      gistUpdate(kId, kToken, kFilename, kEditor.getValue())
        .then(() => { document.title = 'Markdown Tex (Saved!)' })
        .catch(window.alert);
    }
  });
} else {
  document.querySelector('#settings').hidden = false;
  document.querySelector('#current-gist').hidden = true;
}

document.querySelector('#current-gist > span').addEventListener('click', (event) => {
  const url = `https://gist.github.com/${kId}`;
  window.open(url, '_blank');
});

document.querySelector('#open-new-gist > span').addEventListener('click', (event) => {
  const input = window.prompt('Input <gist-url> or <gist-id> or <gist-id>/<filename>');
  if (input) {
    var id, filename;
    if (input.startsWith('https://gist.github.com')) {
      const url = new URL(input);
      id = _.last(url.pathname.split('/'));
    } else {
      if (input.includes('/')) {
        [id, filename] = input.split('/');
      } else {
        id = input;
      }
    }

    const { origin, pathname } = window.location;
    if (filename) {
      window.location = `${origin}${pathname}?id=${id}&filename=${filename}`;
      return;
    }

    // Find "first" file of Gist
    gistGet(id, kToken).then(respJson => {
      filename = _.keys(respJson.files)[0];
      window.location = `${origin}${pathname}?id=${id}&filename=${filename}`;
    }).catch(window.alert);
  }
});

document.querySelector('#setup-access-token > span').addEventListener('click', (event) => {
  const token = window.prompt('Input your access token');
  if (token) {
    window.localStorage.setItem('token', token);
    window.location.reload();
  }
});
