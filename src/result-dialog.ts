import h from 'hyperscript';
import { DialogWindow } from './dialog';

export class ResultDialog extends DialogWindow {
  contentElement: HTMLTextAreaElement;

  get text() { return this.contentElement.value; }
  set text(value: string) { this.contentElement.value = value; }

  constructor() {
    super({
      titleText: 'Executeion Result',
      closeButton: true,
    });
    this.bodyElement.classList.add('borderless');
    this.contentElement = this.bodyElement.appendChild(h('textarea.monospace', { readOnly: true, spellCheck: false }));
  }
  
  protected maximizeClick() {}

  close() {
    super.close();
    this.dispose();
  }
}