import h from 'hyperscript';
import { editor as Editor } from 'monaco-editor';
import { Subscription } from 'rxjs';
import { DialogWindow } from './dialog';
import { observeMediaQuery } from './utils/helpers';

export class StdinDialog extends DialogWindow {
  editor: Editor.IStandaloneCodeEditor;
  protected ogValue?: string;
  protected resolve?: (value: string | undefined) => void;
  protected darkModeSub: Subscription;

  get value() {
    return this.editor.getModel()?.getValue(Editor.EndOfLinePreference.LF);
  }
  set value(value: string | undefined) {
    this.ogValue = value;
    this.editor.setValue(value ?? '');
  }
  
  constructor() {
    super({
      titleText: 'Edit STDIN',
      closeButton: true,
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
    this.bodyElement.classList.remove('expand');
    this.bodyElement.classList.add('fixed', 'field-row', 'align-right');
    this.bodyElement.appendChild(h('button', { type: 'button', onclick: () => this.applyClick() }, 'Apply'))
    this.bodyElement.appendChild(h('button', { type: 'button', onclick: () => this.close() }, 'Cancel'));
    this.darkModeSub = observeMediaQuery('(prefers-color-scheme:dark)').subscribe(
      isDarkMode => this.editor.updateOptions({ theme: isDarkMode ? 'vs-dark' : 'vs' }),
    );
  }

  showAndWait(value?: string) {
    if (this.resolve)
      return Promise.reject(new Error('Dialog already opened'));
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

  protected maximizeClick() {}

  close() {
    super.close();
    if (this.resolve) {
      this.resolve(this.ogValue);
      delete this.resolve;
    }
  }

  dispose() {
    this.editor.getModel()?.dispose();
    this.editor.dispose();
    this.darkModeSub.unsubscribe();
    super.dispose();
  }
}
