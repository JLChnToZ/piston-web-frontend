import './monaco-env';
import h from 'hyperscript';
import 'rxjs';
import { ajax, AjaxError } from 'rxjs/ajax';
import { editor as Editor, KeyCode, KeyMod, languages as Languages } from 'monaco-editor';
import stringArgv from 'string-argv';
import { PistonExecuteRequest, PistonExecuteResponse, PistonVersions } from './schema';
import { blob2Text, observeMediaQuery } from './utils/helpers';
import { showModal, showSnack } from './utils/tocas';

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

const container = document.body.appendChild(h<HTMLFormElement>('form.main-container'));
const spinner = document.body.appendChild(h<HTMLDivElement>('div.ts.dimmer', h('div.ts.big.loader')));
const dialogContainer = document.body.appendChild(h<HTMLDivElement>('div.ts.modals.dimmer'));
const stdinDialog = dialogContainer.appendChild(h<HTMLDialogElement>('dialog.ts.closable.modal',
  h('div.header', 'Edit User Input (STDIN)'),
  h('div.content.fitted'),
  h('div.actions',
    h('button.ts.positive.button', 'Apply'),
    h('button.ts.negative.button', 'Cancel'),
  ),
));

const editor = Editor.create(container.appendChild(h<HTMLDivElement>('code.unstyled.editor-container')), {
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

const stdinEditor = Editor.create(stdinDialog.querySelector<HTMLDivElement>('div.content')!, {
  language: 'plaintext',
  value: '',
  automaticLayout: true,
  selectOnLineNumbers: true,
  wordWrap: 'on',
  minimap: { enabled: true },
  folding: true,
  fontFamily: 'TypoPRO Mononoki',
});

const argsInput = h<HTMLInputElement>('input.monospace', { type: 'text', placeholder: 'Arguments...', spellcheck: false });

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
  stdinEditor.setValue(stdin ?? '');
  showModal(stdinDialog, { onApprove: applyStdin, onDeny: editorFocus });
  stdinEditor.focus();
}

function execute() {
  container.requestSubmit();
}

async function loadHandle(file: File) {
  try {
    spinner.classList.add('active');
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
    showSnack(e.message || String(e));
  } finally {
    spinner.classList.remove('active');
    editor.focus();
  }
}

container.appendChild(h('div.ts.flex-fixed.bottom.fixed.icon.tiny.menu',
  h('a.item', { onclick: (e: Event) => {
    e.preventDefault();
    clear();
  }, 'data-tooltip': 'Clear', 'data-tooltip-position': 'top center' }, h('i.file.outline.icon')),
  h('a.item', { onclick: (e: Event) => {
    e.preventDefault();
    load();
  }, 'data-tooltip': 'Open', 'data-tooltip-position': 'top center' }, h('i.folder.open.icon')),
  h('a.item', { onclick: (e: Event) => {
    e.preventDefault();
    save();
  }, 'data-tooltip': 'Save (Download)', 'data-tooltip-position': 'top center' }, h('i.save.icon')),
  languageSelector,
  h('div.stretched.vertically.fitted.item', h('div.ts.fluid.borderless.basic.mini.input', argsInput)),
  h('a.item', { onclick: (e: Event) => {
    e.preventDefault();
    editStdin();
  }, 'data-tooltip': 'User Input (STDIN)', 'data-tooltip-position': 'top center' }, h('i.keyboard.icon')),
  h('a.item', { onclick: (e: Event) => {
    e.preventDefault();
    execute();
  }, 'data-tooltip': 'Execute', 'data-tooltip-position': 'top center' }, h('i.play.icon')),
));

function applyStdin() {
  stdin = stdinEditor.getModel()?.getValue(Editor.EndOfLinePreference.LF) || undefined;
  editorFocus();
}

function editorFocus() {
  editor.focus();
}

const resultDisplay = dialogContainer.appendChild(h<HTMLDialogElement>('dialog.ts.closable.modal',
  h('div.header', 'Execution Result'),
  h('div.content', h('div.description', h('div.ts.segment', h('samp')))),
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
        source: editor.getModel()?.getValue(Editor.EndOfLinePreference.LF) || '',
        args: stringArgv(argsInput.value),
        stdin,
      } as PistonExecuteRequest),
    }).toPromise()).response;
    const body = resultDisplay.querySelector<HTMLElement>('.content samp')!;
    body.textContent = '';
    const frag = document.createDocumentFragment();
    for (const line of result.output.split('\n'))
      frag.append(line, document.createElement('br'));
    body.appendChild(frag);
    showModal(resultDisplay, { onApprove: editorFocus, onDeny: editorFocus });
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
    editor.focus();
  }
});

observeMediaQuery('(prefers-color-scheme:dark)').subscribe(matches => {
  document.querySelectorAll('.ts:not(.dimmer)').forEach(element =>
    element.classList[matches ? 'add' : 'remove']('inverted'),
  );
  const theme = matches ? 'vs-dark': 'vs';
  editor.updateOptions({ theme });
  stdinEditor.updateOptions({ theme });
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
