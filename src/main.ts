// import './monaco-env';
import h from 'hyperscript';
import { lastValueFrom } from 'rxjs';
import { ajax, AjaxError } from 'rxjs/ajax';
import { editor as Editor, KeyCode, KeyMod, languages, languages as Languages } from 'monaco-editor';
import stringArgv from 'string-argv';
import { PistonExecuteRequest, PistonExecuteResponse, PistonVersions } from './schema';
import { blob2Text, observeFontLoad, observeMediaQuery } from './utils/helpers';
import { StdinDialog } from './stdin-dialog';
import { ResultDialog } from './result-dialog';

const pistonPublicURL = (self as any).pistonPublicURL || 'https://emkc.org/api/v2/piston/';
let currentLanguage = 'javascript';
let stdin: string | undefined;
const languageMap = new Map<string, string>(Object.entries({
  bash: 'shell',
  'csharp.net': 'csharp',
  'fsharp.net': 'fsharp',
  'basic.net': 'vb',
  'sqlite3': 'sql',
  node: 'javascript',
  python2: 'python',
  python3: 'python',
}));
const langInfoMap = new Map<string, Languages.ILanguageExtensionPoint>();
const extMap = new Map<string, string>();
const mimeMap = new Map<string, string>();

for (const lang of languages.getLanguages()) {
  if (!languageMap.has(lang.id))
    languageMap.set(lang.id, lang.id);
  if (lang.aliases)
    for (const alias of lang.aliases)
      if (!languageMap.has(alias))
        languageMap.set(alias, lang.id);
}

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
  keybindings: [KeyMod.CtrlCmd | KeyCode.KeyN],
  run: clear,
});
editor.addAction({
  id: 'open',
  label: 'Open',
  keybindings: [KeyMod.CtrlCmd | KeyCode.KeyO],
  run: load,
});
editor.addAction({
  id: 'save',
  label: 'Save',
  keybindings: [KeyMod.CtrlCmd | KeyCode.KeyS],
  run: save,
});

const stdinDialog = new StdinDialog();

const fileNameInput = h<HTMLInputElement>('input.monospace', { type: 'text', placeholder: 'file.code', spellcheck: false });

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
  fileNameInput.value = '';
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
  h<HTMLElement>('a', { href, download: fileNameInput.value.trim() || `code-${Date.now().toString(36)}${ext}` }).click();
  setTimeout(URL.revokeObjectURL, 500, href);
  editor.focus();
}

function editStdin() {
  stdinDialog.showAndWait(stdin).then(newValue => stdin = newValue, () => {});
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
    fileNameInput.value = file.name;
  } catch(e) {
  } finally {
    editor.focus();
  }
}

container.appendChild(h('nav.window.flex',
  h('button.fixed.icononly', { type: 'reset', onclick: clear, title: 'Clear everything' }, h('img.icon', { src: require('../assets/file_set-1.png') })),
  h('button.fixed.icononly', { type: 'button', onclick: load, title: 'Open from your computer' }, h('img.icon', { src: require('../assets/directory_open_cool-4.png') })),
  h('button.fixed.icononly', { type: 'button', onclick: save, title: 'Download and save your works' }, h('img.icon', { src: require('../assets/download.png') })),
  languageSelector,
  fileNameInput,
  argsInput,
  h('button.fixed.icononly', { type: 'button', onclick: editStdin, title: 'Edit Input (STDIN)' }, h('img.icon', { src: require('../assets/keyboard-6.png') })),
  h('button.fixed.icononly', { type: 'submit', title: 'Execute' }, h('img.icon', { src: require('../assets/logo.png') })),
));

container.addEventListener('submit', async e => {
  const formElements = container.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement | HTMLTextAreaElement>(
    'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])',
  );
  try {
    e.preventDefault();
    formElements.forEach(e => e.disabled = true);
    let stopwatch = performance.now();
    const result = (await lastValueFrom(ajax<PistonExecuteResponse>({
      method: 'POST',
      url: new URL('execute', pistonPublicURL).toString(),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        language: currentLanguage,
        files: [{
          name: fileNameInput.value.trim() || undefined,
          content: editor.getModel()?.getValue(Editor.EndOfLinePreference.LF) || '',
        }],
        args: stringArgv(argsInput.value),
        stdin,
      } as PistonExecuteRequest),
    }))).response;
    stopwatch = performance.now() - stopwatch;
    const resultDisplay = new ResultDialog();
    let content: string = '';
    if (result.compile)
      content += `${result.compile.output}\n\Compiler exits with ${result.compile.signal || result.compile.code || 0}.\n\n`;
    content += `${result.run.output}\n\nRunner exits with ${result.run.signal || result.run.code || 0}.\n\n`;
    content += `Response time: ${stopwatch / 1000} seconds.`;
    resultDisplay.text = content;
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
  const list = (await lastValueFrom(ajax<PistonVersions>(new URL('runtimes', pistonPublicURL).toString()))).response;
  const frag = document.createDocumentFragment();
  const supportedLangs = new Set<string>();
  for (const entry of list) {
    frag.appendChild(h('option', {
      value: entry.language,
      selected: currentLanguage === entry.language,
    }, `${entry.language} (v${entry.version || '???'})`));
    const lang = languageMap.get(entry.language);
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