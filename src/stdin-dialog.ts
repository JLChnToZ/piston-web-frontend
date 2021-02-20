import h from 'hyperscript';
import { editor as Editor } from 'monaco-editor';
import { Subscription } from 'rxjs';
import { DialogWindow } from './dialog';
import { generateUid, observeMediaQuery } from './utils/helpers';

export class StdinDialog extends DialogWindow {
  editor: Editor.IStandaloneCodeEditor;
  protected ogValue?: string;
  protected resolve?: (value: string | undefined) => void;
  protected darkModeSub: Subscription;
  protected eolCheckbox: HTMLInputElement;

  get value() {
    return this.editor.getModel()?.getValue(this.eolCheckbox.checked ?
      Editor.EndOfLinePreference.CRLF :
      Editor.EndOfLinePreference.LF,
    );
  }
  set value(value: string | undefined) {
    this.ogValue = value;
    this.editor.setValue(value ?? '');
  }
  
  constructor() {
    super({
      iconPath: require('../assets/notepad-3.png'),
      titleText: 'Edit STDIN',
      closeButton: true,
      minimizeButton: true,
      maximizeButton: true,
      resizable: true,
    });
    this.dialog.style.minWidth = '50%';
    this.dialog.style.minHeight = '50%';
    const win = this.bodyElement.parentElement!;
    this.editor = Editor.create(win.insertBefore(h('div.editor-container.expand'), this.bodyElement), {
      language: 'plaintext',
      value: '',
      automaticLayout: true,
      selectOnLineNumbers: true,
      wordWrap: 'on',
      minimap: { enabled: true },
      folding: true,
      fontFamily: 'TypoPRO Mononoki',
    });
    const { classList } = this.bodyElement;
    classList.remove('expand');
    classList.add('fixed', 'field-row', 'align-right');
    this.bodyElement.append(
      this.eolCheckbox = h('input', { type: 'checkbox', id: generateUid('checkbox_'), checked: true }),
      h('label', { htmlFor: this.eolCheckbox.id }, 'Break Line Using CRLF'),
      h('button', { type: 'button', onclick: () => this.applyClick() }, 'Apply'),
      h('button', { type: 'button', onclick: () => this.close() }, 'Cancel'),
    );
    this.darkModeSub = observeMediaQuery('(prefers-color-scheme:dark)').subscribe(
      isDarkMode => this.editor.updateOptions({ theme: isDarkMode ? 'vs-dark' : 'vs' }),
    );
  }

  showAndWait(value?: string) {
    if (this.resolve) {
      this.focus();
      return Promise.reject(new Error('Dialog already opened'));
    }
    return new Promise<string | undefined>(resolve => {
      this.value = value;
      this.show();
      this.resolve = resolve;
    });
  }

  protected applyClick() {
    super.close();
    if (this.resolve) {
      this.resolve(this.value);
      delete this.resolve;
    }
  }

  close() {
    super.close();
    if (this.resolve) {
      this.resolve(this.ogValue);
      delete this.resolve;
    }
  }

  protected onfocus() {
    super.onfocus();
    this.editor.focus();
  }

  dispose() {
    this.editor.getModel()?.dispose();
    this.editor.dispose();
    this.darkModeSub.unsubscribe();
    super.dispose();
  }
}
