const $   = document.querySelector.bind(document);
const $$  = document.querySelectorAll.bind(document);
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

var kDelimeterPatterns = {
  global:  [/\$\$\$([^\$]+?)\$\$\$/gm],                       // $$$..$$$
  display: [/\$\$([^\$]+?)\$\$/gm, /\\\[((?:.|\n)*?)\\\]/gm], // $$...$$, \[...\]
  inline:  [/\$([^\$]+?)\$/gm, /\\\(((?:.|\n)*?)\\\)/gm],     // $...$, \(...\)
}

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
  // - `convert`is not a bottleneck (at least, if we cache katex.renderToString.)
  // - Parsing and Layouting Katex's DOM is very expensive for browser.
  //   Even for simple document, it can goes e.g.
  //     - Parse HTML        : 10ms~
  //     - Recalculate Style : 50ms~
  //     - Layout            : 50ms~
  // - Currently, we check if the number of "top elements" (e.g. h1, p) have changed.
  //   If it didn't, then we update the one changed.
  //   This should be almost all the case for interactive use.
  //

  // Always convert whole markdown source
  const output = convert(src);

  // Create "offscreen" element
  const dummy = document.createElement('div');
  dummy.innerHTML = output;

  // if same length, compare each top element pair at the same index
  if (dummy.children.length == kOutput.children.length) {
    _.zip(dummy.children, kOutput.children).map(([now, old]) => {
      if (now.outerHTML != old.outerHTML) {
        old.outerHTML = now.outerHTML;
      }
    });

  // If not same length, swap whole output
  } else {
    kOutput.innerHTML = dummy.innerHTML;
  }
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
  $('#settings').classList.remove('invisible');
} else {

  document.title = 'Markdown Tex (Loading...)';
  gistGet(kId, kToken).then(respJson => {
    // Create links to files
    $('#gist-files').classList.remove('disabled');
    const ul = $('#gist-files > ul');
    const { origin, pathname } = window.location;
    _.keys(respJson.files).forEach(filename => {
      const li = document.createElement('li');
      const url = `${origin}${pathname}?id=${kId}&filename=${filename}`;
      li.innerHTML = `<a href="${url}">${filename}</a>`;
      ul.appendChild(li);
    })

    // Create links to Gist
    $$('#gist-links a').forEach(e => e.classList.remove('disabled'));
    $$('#gist-links a')[0].setAttribute('href', `https://gist.github.com/${respJson.owner.login}/${kId}/`);
    $$('#gist-links a')[1].setAttribute('href', `https://gist.github.com/${respJson.owner.login}/${kId}/edit`);

    // Load content
    if (kFilename && (kFilename in respJson.files)) {
      kEditor.setValue(respJson.files[kFilename].content);
    }
  })
  .catch(window.alert)
  .finally(() => {
    document.title = 'Markdown Tex';
    if (kEditor.getValue().length == 0) {
      $('#settings').classList.remove('invisible');
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
        document.title = 'Markdown Tex (Saving...)';
        gistUpdate(kId, kToken, kFilename, kEditor.getValue())
          .then(() => { document.title = 'Markdown Tex (Saved!)' })
          .catch(window.alert);
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
