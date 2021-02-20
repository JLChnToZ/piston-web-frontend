import h from 'hyperscript';
import { DialogWindow } from './dialog';

export class ResultDialog extends DialogWindow {
  contentElement: HTMLTextAreaElement;

  get text() { return this.contentElement.value; }
  set text(value: string) { this.contentElement.value = value; }

  constructor() {
    super({
      iconPath: require('../assets/executable_script-0.png'),
      titleText: 'Execution Result',
      closeButton: true,
      minimizeButton: true,
      maximizeButton: true,
      resizable: true,
    });
    this.dialog.style.minWidth = '240px';
    this.dialog.style.minHeight = '240px';
    this.bodyElement.replaceWith(
      this.contentElement = h('textarea.expand.monospace', { readOnly: true, spellCheck: false }),
    );
  }

  close() {
    super.close();
    this.dispose();
  }
}