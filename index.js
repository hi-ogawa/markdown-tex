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

var kShowdownOptions = {
  literalMidWordUnderscores: true, // this saves inline math with underscore
};

var kConverter = new window.showdown.Converter(kShowdownOptions);
var kEditor = CodeMirror(kInput, kCodemirrorOptions);

const kPatterns = [
  {
    regex: /\$\$([^\$]+?)\$\$/gm,
    replace: (_, p1) => {
      return `<script type="math/katex; mode=display">${p1}<\/script>`;
    }
  },
  {
    regex: /\$([^\$]+?)\$/gm,
    replace: (_, p1) => {
      return `<script type="math/katex; mode=inline">${p1}<\/script>`;
    }
  },
  {
    regex: /<script type="math\/katex; mode=(.*?)">((?:.|\n)*?)<\/script>/gm,
  },
  {
    regex: /<script type="math\/katex; mode=global">((?:.|\n)*?)<\/script>/m,
  },
];

var wrapTex = (src) =>
  src.replace(kPatterns[0].regex, kPatterns[0].replace)
     .replace(kPatterns[1].regex, kPatterns[1].replace);

var renderTex = (src) => {
  const katexGlobal = _.get(src.match(kPatterns[3].regex), 1, '');
  return src.replace(kPatterns[2].regex, (_, p1, p2) => {
    if (!['display', 'inline'].includes(p1)) { return ''; }
    return katex.renderToString(katexGlobal + p2, { displayMode: p1 == 'display', ...kKatexOptions });
  });
};

var preview = (src) => {
  // NOTE: Before running Showdown, we only wrap tex code with simple script tag so that
  //       Showdown doesn't have to see complicated katex's dom output, which seems affect performance.
  kOutput.innerHTML = renderTex(kConverter.makeHtml(wrapTex(src)));
}

var throttledPreview = _.throttle(preview, 200, { leading: false, trailing : true });

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
  gistGetFile(kId, kToken, kFilename).then(
    (content) => kEditor.setValue(content), window.alert);

  // Update on Control-s (if token is valid)
  document.addEventListener('keydown', (event) => {
    if (event.ctrlKey && event.key == 's') {
      event.preventDefault();
      if (!kToken) {
        window.alert('Access token must be provided to save data');
        return;
      }
      gistUpdate(kId, kToken, kFilename, kEditor.getValue()).catch(window.alert);
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
