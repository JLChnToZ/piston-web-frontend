// import './monaco-env';
import h from 'hyperscript';
import 'rxjs';
import { ajax, AjaxError } from 'rxjs/ajax';
import { editor as Editor, KeyCode, KeyMod, languages as Languages } from 'monaco-editor';
import stringArgv from 'string-argv';
import { PistonExecuteRequest, PistonExecuteResponse, PistonVersions } from './schema';
import { blob2Text, observeFontLoad, observeMediaQuery } from './utils/helpers';
import { StdinDialog } from './stdin-dialog';
import { ResultDialog } from './result-dialog';

const pistonPublicURL = (self as any).pistonPublicURL || 'https://emkc.org/api/v1/piston/';
let currentLanguage = 'node';
let stdin: string | undefined;
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

const container = document.body.appendChild(h<HTMLFormElement>('form.filled.flex.vertical'));

const editor = Editor.create(container.appendChild(h<HTMLDivElement>('div.expand.editor-container')), {
  language: 'javascript',
  value: '',
  automaticLayout: true,
  selectOnLineNumbers: true,
  wordWrap: 'on',
  minimap: { enabled: true },
  folding: true,
  fontFamily: 'TypoPRO Mononoki',
});

editor.addAction({
  id: 'exec',
  label: 'Execute',
  keybindings: [KeyCode.F5],
  run: execute,
});
editor.addAction({
  id: 'new',
  label: 'Clear',
  keybindings: [KeyMod.CtrlCmd | KeyCode.KEY_N],
  run: clear,
});
editor.addAction({
  id: 'open',
  label: 'Open',
  keybindings: [KeyMod.CtrlCmd | KeyCode.KEY_O],
  run: load,
});
editor.addAction({
  id: 'save',
  label: 'Save',
  keybindings: [KeyMod.CtrlCmd | KeyCode.KEY_S],
  run: save,
});

const stdinDialog = new StdinDialog();

const argsInput = h<HTMLInputElement>('input.expand.monospace', { type: 'text', placeholder: 'Arguments...', spellcheck: false });

const languageSelector = h<HTMLSelectElement>('select.fixed', {
  onchange: (e: Event) => {
    const newLanguage = (e.target as HTMLSelectElement).value;
    if (currentLanguage === newLanguage)
      return;
    Editor.setModelLanguage(editor.getModel()!, languageMap.get(newLanguage) || 'plaintext');
    currentLanguage = newLanguage;
    argsInput.value = '';
  },
  title: 'Language (Runtime to use)'
});

const fileSelect = h<HTMLInputElement>('input.hidden', {
  tabindex: -1,
  type: 'file',
  onchange: async (e: Event) => {
    const target = e.target as HTMLInputElement;
    if (target.files?.length) {
      loadHandle(target.files[0]);
      target.value = '';
    }
    target.blur();
  },
});

function clear() {
  editor.getModel()?.dispose();
  editor.setModel(Editor.createModel(''));
  argsInput.value = '';
  stdin = undefined;
  editor.focus();
}

function load() {
  fileSelect.click();
}

function save() {
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
  editor.focus();
}

function editStdin() {
  stdinDialog.showAndWait(stdin).then(newValue => stdin = newValue);
}

function execute() {
  console.trace('Triggered execute');
  container.requestSubmit();
}

async function loadHandle(file: File) {
  try {
    const model = Editor.createModel(await blob2Text(file));
    editor.getModel()?.dispose();
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
  } finally {
    editor.focus();
  }
}

container.appendChild(h('nav.window.flex',
  h('button.fixed', { type: 'reset', onclick: clear, title: 'Clear everything' }, 'New'),
  h('button.fixed', { type: 'button', onclick: load, title: 'Open from your computer' }, 'Open'),
  h('button.fixed', { type: 'button', onclick: save, title: 'Download and save your works' }, 'Save'),
  languageSelector,
  argsInput,
  h('button.fixed', { type: 'button', onclick: editStdin, title: 'Edit STDIN' }, 'STDIN...'),
  h('button.fixed', { type: 'submit', title: 'Execute' }, 'Run'),
));

container.addEventListener('submit', async e => {
  const formElements = container.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement | HTMLTextAreaElement>(
    'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])',
  );
  try {
    e.preventDefault();
    formElements.forEach(e => e.disabled = true);
    const result: PistonExecuteResponse = (await ajax({
      method: 'POST',
      url: new URL('execute', pistonPublicURL).toString(),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        language: currentLanguage,
        source: editor.getModel()?.getValue(Editor.EndOfLinePreference.LF) || '',
        args: stringArgv(argsInput.value),
        stdin,
      } as PistonExecuteRequest),
    }).toPromise()).response;
    const resultDisplay = new ResultDialog();
    resultDisplay.text = result.output;
    resultDisplay.show();
  } catch (e) {
    let message = 'Unknown Error';
    if (e instanceof AjaxError)
      message = `${e.message}: ${e.response?.message ?? ''}`;
    else if (e instanceof Error)
      message = e.message;
    else
      console.error(e);
    const resultDisplay = new ResultDialog();
    resultDisplay.text = message;
    resultDisplay.show();
  } finally {
    formElements.forEach(e => e.disabled = false);
    editor.focus();
  }
});

observeMediaQuery('(prefers-color-scheme:dark)').subscribe(matches => {
  editor.updateOptions({ theme:  matches ? 'vs-dark': 'vs' });
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
})();
editor.focus();

document.addEventListener('contextmenu', e => {
  if (!(e.target instanceof Element) ||
    !e.target.matches('textarea:not(:disabled), input:not(:disabled), [contenteditable], [contenteditable] *'))
    e.preventDefault();
});

if (document.fonts)
  observeFontLoad('1em "TypoPRO Mononoki"').subscribe(() => Editor.remeasureFonts());