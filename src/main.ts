import './monaco-env';
import h from 'hyperscript';
import 'rxjs';
import { ajax, AjaxError } from 'rxjs/ajax';
import { editor as Editor, languages as Languages } from 'monaco-editor';
import stringArgv from 'string-argv';
import { PistonExecuteRequest, PistonExecuteResponse, PistonVersions } from './schema';
import { blob2Text, observeMediaQuery } from './utils/helpers';
import { showModel, showSnack } from './utils/tocas';

const pistonPublicURL = (self as any).pistonPublicURL || 'https://emkc.org/api/v1/piston/';
let currentLanguage = 'node';
const languageMap = new Map<string, string>(Object.entries({
  bash: 'shell',
  c: 'c',
  cpp: 'cpp',
  csharp: 'csharp',
  go: 'go',
  java: 'java',
  julia: 'julia',
  kotlin: 'kotlin',
  lua: 'lua',
  node: 'javascript',
  perl: 'perl',
  php: 'php',
  python2: 'python',
  python3: 'python',
  ruby: 'ruby',
  rust: 'rust',
  swift: 'swift',
  typescript: 'typescript',
}));
const langInfoMap = new Map<string, Languages.ILanguageExtensionPoint>();
const extMap = new Map<string, string>();
const mimeMap = new Map<string, string>();

const container = document.body.appendChild(h<HTMLFormElement>('form.main-container'));
const spinner = document.body.appendChild(h<HTMLDivElement>('div.ts.dimmer', h('div.ts.big.loader')));
const editor = Editor.create(container.appendChild(h<HTMLDivElement>('code.unstyled.editor-container')), {
  language: 'javascript',
  value: '',
  automaticLayout: true,
  selectOnLineNumbers: true,
  wordWrap: 'on',
  minimap: { enabled: true },
  folding: true,
});

const argsInput = h<HTMLInputElement>('input', { type: 'text', placeholder: 'Arguments...', spellcheck: false });

const languageSelector = h<HTMLSelectElement>('select.ts.item.basic.dropdown', {
  onchange: (e: Event) => {
    const newLanguage = (e.target as HTMLSelectElement).value;
    if (currentLanguage === newLanguage)
      return;
    Editor.setModelLanguage(editor.getModel()!, languageMap.get(newLanguage) || 'plaintext');
    currentLanguage = newLanguage;
    argsInput.value = '';
  },
  'data-tooltip': 'Language (Runtime to use)',
  'data-tooltip-position': 'top center',
});

const fileSelect = h<HTMLInputElement>('input.hidden', {
  tabindex: -1,
  type: 'file',
  onchange: async (e: Event) => {
    const target = e.target as HTMLInputElement;
    if (target.files?.length) {
      load(target.files[0]);
      target.value = '';
    }
    target.blur();
  },
});

async function load(file: File) {
  try {
    const model = Editor.createModel(await blob2Text(file));
    editor.setModel(model);
    const lang = mimeMap.get(file.type.toLowerCase()) ||
      extMap.get(file.name.substring(file.name.lastIndexOf('.')).toLowerCase());
    if (!lang) return;
    Editor.setModelLanguage(model, lang);
    let sameLang = false;
    let targetLang = currentLanguage;
    for (const [pistonLang, monacoLang] of languageMap) {
      if (monacoLang !== lang) continue;
      if (currentLanguage === pistonLang) {
        sameLang = true; break;
      }
      targetLang = pistonLang;
    }
    if (!sameLang && currentLanguage !== targetLang)
      languageSelector.value = currentLanguage = targetLang;
  } catch(e) {
    showSnack(e.message || String(e));
  }
}

container.appendChild(h('div.ts.flex-fixed.bottom.fixed.icon.tiny.menu',
  h('a.item', { onclick: (e: Event) => {
    e.preventDefault();
    editor.setModel(Editor.createModel(''));
  }, 'data-tooltip': 'Clear', 'data-tooltip-position': 'top center' }, h('i.file.outline.icon')),
  h('a.item', { onclick: (e: Event) => {
    e.preventDefault();
    fileSelect.click();
  }, 'data-tooltip': 'Open', 'data-tooltip-position': 'top center' }, h('i.folder.open.icon')),
  h('a.item', { onclick: (e: Event) => {
    e.preventDefault();
    let type = 'text/plain';
    let ext = '';
    const currentLang = languageMap.get(currentLanguage);
    if (currentLang) {
      const langInfo = langInfoMap.get(currentLang)!;
      if (langInfo.mimetypes?.length)
        type = langInfo.mimetypes[0];
      if (langInfo.extensions?.length)
        ext = langInfo.extensions[0];
    }
    const href = URL.createObjectURL(new Blob([editor.getValue()], { type }));
    h<HTMLElement>('a', { href, download: `code-${Date.now().toString(36)}${ext}` }).click();
    setTimeout(URL.revokeObjectURL, 500, href);
  }, 'data-tooltip': 'Save (Download)', 'data-tooltip-position': 'top center' }, h('i.save.icon')),
  languageSelector,
  h('div.stretched.fitted.item', h('div.ts.fluid.borderless.basic.mini.input', argsInput)),
  h('a.item', { onclick: (e: Event) => {
    e.preventDefault();
    (e.target as Element).closest('form')?.requestSubmit();
  }, 'data-tooltip': 'Execute', 'data-tooltip-position': 'top center' }, h('i.play.icon')),
));

const resultContainer = document.body.appendChild(h<HTMLDivElement>('div.ts.modals.dimmer'));
const resultDisplay = resultContainer.appendChild(h<HTMLDialogElement>('dialog.ts.closable.modal',
  h('div.header', 'Execution Result'),
  h('div.body', h('div.description', h('samp'))),
  h('div.actions', h('button.ts.positive.button', 'Close')),
));

container.addEventListener('submit', async e => {
  try {
    e.preventDefault();
    spinner.classList.add('active');
    const result: PistonExecuteResponse = (await ajax({
      method: 'POST',
      url: new URL('execute', pistonPublicURL).toString(),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        language: currentLanguage,
        source: editor.getModel()?.getValue() || '',
        args: stringArgv(argsInput.value),
      } as PistonExecuteRequest),
    }).toPromise()).response;
    const body = resultDisplay.querySelector<HTMLElement>('.body samp')!;
    body.textContent = '';
    const frag = document.createDocumentFragment();
    for (const line of result.output.split('\n'))
      frag.append(line, document.createElement('br'));
    body.appendChild(frag);
    showModel(resultDisplay);
  } catch (e) {
    if (e instanceof AjaxError)
      showSnack(`${e.message}: ${e.response?.message ?? ''}`);
    else if (e instanceof Error)
      showSnack(e.message);
    else {
      showSnack('Unknown Error');
      console.error(e);
    }
  } finally {
    spinner.classList.remove('active');
  }
});

observeMediaQuery('(prefers-color-scheme:dark)').subscribe(matches => {
  document.querySelectorAll('.ts:not(.dimmer)').forEach(element =>
    element.classList[matches ? 'add' : 'remove']('inverted'),
  );
  editor.updateOptions({ theme: matches ? 'vs-dark': 'vs' });
});

(async() => {
  const list: PistonVersions = (await ajax(new URL('versions', pistonPublicURL).toString()).toPromise()).response;
  const frag = document.createDocumentFragment();
  const supportedLangs = new Set<string>();
  for (const entry of list) {
    frag.appendChild(h('option', {
      value: entry.name,
      selected: currentLanguage === entry.name,
    }, `${entry.name} (v${entry.version})`));
    const lang = languageMap.get(entry.name);
    if (lang) supportedLangs.add(lang);
  }
  languageSelector.appendChild(frag);
  for (const lang of Languages.getLanguages()) {
    if (!supportedLangs.has(lang.id))
      continue;
    langInfoMap.set(lang.id, lang);
    if (lang.extensions?.length)
      for (const ext of lang.extensions)
        if (!extMap.has(ext))
          extMap.set(ext.toLowerCase(), lang.id);
    if (lang.mimetypes?.length)
      for (const mime of lang.mimetypes)
        if (!mimeMap.has(mime))
          mimeMap.set(mime.toLowerCase(), lang.id);
  }
  fileSelect.accept = [...mimeMap.keys(), ...extMap.keys()].join(',');
})();