import './monaco-env';
import h from 'hyperscript';
import 'rxjs';
import { ajax, AjaxError } from 'rxjs/ajax';
import { editor as Editor } from 'monaco-editor';
import stringArgv from 'string-argv';
import { PistonExecuteRequest, PistonExecuteResponse, PistonVersions } from './schema';
import { observeMediaQuery } from './utils/helpers';
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

const languageSelector = h<HTMLSelectElement>('select.ts.item.basic.dropdown', {
  onchange: (e: Event) => {
    const newLanguage = (e.target as HTMLSelectElement).value;
    if (currentLanguage === newLanguage)
      return;
    Editor.setModelLanguage(editor.getModel()!, languageMap.get(newLanguage) || 'plaintext');
    currentLanguage = newLanguage;
  },
});

const argsInput = h<HTMLInputElement>('input', { type: 'text', placeholder: 'Arguments...' });

container.appendChild(h('div.ts.flex-fixed.bottom.fixed.icon.small.menu',
  languageSelector,
  h('div.stretched.fitted.item', h('div.ts.fluid.borderless.basic.mini.input', argsInput)),
  h<HTMLButtonElement>('a.item', { onclick: (e: Event) => {
    e.preventDefault();
    (e.target as Element).closest('form')?.requestSubmit();
  } }, h('i.play.icon')),
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
      headers: {
        'Content-Type': 'application/json',
      },
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
  for (const entry of list)
    frag.appendChild(h('option', {
      value: entry.name,
      selected: currentLanguage === entry.name,
    }, `${entry.name} (v${entry.version})`));
  languageSelector.appendChild(frag);
})();