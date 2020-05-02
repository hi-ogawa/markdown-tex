const $   = document.querySelector.bind(document);
const $$  = (...args) => Array.from(document.querySelectorAll(...args));
const $c  = (selector, method, ...args) => $(selector).classList[method](...args);
const $$c = (selector, method, ...args) => $$(selector).map(e => e.classList[method](...args));
const $a  = (selector, method, ...args) => $(selector)[`${method}Attribute`](...args);
const $$a = (selector, method, ...args) => $$(selector).map(e => e[`${method}Attribute`](...args));

var kInput = $('#input')
var kOutput = $('#output');

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
  tables: true,
}

var kDelimeterPatterns = {
  global:  [/\$\$\$([^\$]+?)\$\$\$/gm],                       // $$$..$$$
  display: [/\$\$([^\$]+?)\$\$/gm, /\\\[((?:.|\n)*?)\\\]/gm], // $$...$$, \[...\]
  inline:  [/\$([^\$]+?)\$/gm, /\\\(((?:.|\n)*?)\\\)/gm],     // $...$, \(...\)
}

var kConverter = new window.showdown.Converter(kShowdownOptions);
var kEditor = CodeMirror(kInput, kCodemirrorOptions);
var memoized_katex_renderToString = _.memoize(katex.renderToString, (...args) => JSON.stringify(args));

var convert = (src) => {
  // Collect global math code (useful for e.g. macros)
  var global = '';
  kDelimeterPatterns.global.forEach(regexp => {
    src = src.replace(regexp, (_, p1) => {
      global += p1;
      return '';
    });
  })

  // Convert display/inline math code to temporary <escape-tex> tag with id, so that Showdown does nothing about them.
  var outputs = [];
  kDelimeterPatterns.display.forEach(regexp => {
    src = src.replace(regexp, (_, p1) => {
      const id = outputs.length;
      outputs.push(memoized_katex_renderToString(global + p1, { displayMode: true, ...kKatexOptions }));
      return `<escape-tex id="${id}"/>`;
    });
  });
  kDelimeterPatterns.inline.forEach(regexp => {
    src = src.replace(regexp, (_, p1) => {
      const id = outputs.length;
      outputs.push(memoized_katex_renderToString(global + p1, { displayMode: false, ...kKatexOptions }));
      return `<escape-tex id="${id}"/>`;
    });
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
  // NOTE:
  // - `convert` doesn't seem a bottleneck (at least, if we cache katex.renderToString.)
  // - Parsing and layouting Katex's DOM is very expensive for browser.
  //   Even for simple document, it can goes e.g.
  //     - Parse HTML        : 10ms~
  //     - Recalculate Style : 50ms~
  //     - Layout            : 50ms~
  // - So, currently, we modify whole DOM tree along Levenshtein's edit distance.
  // - Now, "Parse HTML" at `dummy.innerHTML = output` becamse a bottleneck,
  //

  // Always convert whole markdown source
  const output = convert(src);

  // Create "offscreen" element
  const dummy = document.createElement('div');
  dummy.innerHTML = output;

  var ls_src = Array.from(dummy.children).map(e => e.outerHTML);
  var ls_tgt = Array.from(kOutput.children).map(e => e.outerHTML);
  var ls_tgt_dom = kOutput.children;

  // If same length, modify based on pairs at the same position
  if (ls_src.length == ls_tgt.length) {
    for (var i = 0; i < ls_src.length; i++) {
      if (ls_src[i] !== ls_tgt[i]) {
        console.log(i);
        ls_tgt_dom[i].outerHTML = ls_src[i];
      }
    }
    return;
  }

  // Compute edit distance
  var [_table, path] = solveLevenshteinDistance(ls_src, ls_tgt);
  var to_be_removed = [];

  // Collect to-be-removed and execute replace
  path.forEach(([command, i, j]) => {
    if (command == 'remove') {
      to_be_removed.push(ls_tgt_dom[j]);
    }
    if (command == 'replace') {
      ls_tgt_dom[j].outerHTML = ls_src[i];
    }
  });

  // Insert from back so that index `j` is valid during modification
  Array.from(path).reverse().forEach(([command, i, j]) => {
    if (command == 'insert') {
      var tmp = document.createElement('div');
      if (j == -1) {
        kOutput.prepend(tmp);
      } else {
        kOutput.insertBefore(tmp, ls_tgt_dom[j + 1]);
      }
      tmp.outerHTML = ls_src[i]; // outerHTML is available only for dom with parent.
    }
  });

  // Execute remove
  to_be_removed.forEach(e => e.remove());
}

var throttledPreview = _.throttle(preview, 100, { leading: true, trailing : true });

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


if (!kId) {
  $c('#spinner', 'add', 'invisible');
  $c('#settings', 'remove', 'invisible');
} else {

  gistGet(kId, kToken).then(respJson => {
    $c('#gist-files', 'remove', 'disabled');
    $$c('#gist-links a', 'remove', 'disabled');

    // Create links to files
    const ul = $('#gist-files > ul');
    const { origin, pathname } = window.location;
    _.keys(respJson.files).forEach(filename => {
      const li = document.createElement('li');
      const url = `${origin}${pathname}?id=${kId}&filename=${filename}`;
      li.innerHTML = `<a href="${url}">${filename}</a>`;
      ul.appendChild(li);
    })

    // Create links to Gist
    $a('#gist-links a:nth-of-type(1)', 'set', 'href', `https://gist.github.com/${respJson.owner.login}/${kId}/`);
    $a('#gist-links a:nth-of-type(2)', 'set', 'href', `https://gist.github.com/${respJson.owner.login}/${kId}/edit`);

    // Load content
    if (kFilename && (kFilename in respJson.files)) {
      kEditor.setValue(respJson.files[kFilename].content);
    }
  })
  .catch(window.alert)
  .finally(() => {
    $c('#spinner', 'add', 'invisible');
    if (kEditor.getValue().length == 0) {
      $c('#settings', 'remove', 'invisible');
      return;
    }

    // Update on Control-s
    document.addEventListener('keydown', (event) => {
      if (event.ctrlKey && event.key == 's') {
        event.preventDefault();
        if (!kToken) {
          window.alert('Access token must be provided to save data');
          return;
        }

        $c('#spinner', 'remove', 'invisible');
        gistUpdate(kId, kToken, kFilename, kEditor.getValue())
          .catch(window.alert)
          .finally(() => $c('#spinner', 'add', 'invisible'));
      }
    });
  });
}

$('#open-new-gist > span').addEventListener('click', (event) => {
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

$('#setup-access-token > span').addEventListener('click', (event) => {
  const token = window.prompt('Input your access token');
  if (token) {
    window.localStorage.setItem('token', token);
    window.location.reload();
  }
});
