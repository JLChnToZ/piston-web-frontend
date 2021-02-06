import h from 'hyperscript';
import { registerDraggableElements } from './utils/dnd-helper';

export interface DialogWindowOptions {
  titleText?: string | Node,
  closeButton?: boolean;
  maximizeButton?: boolean;
  minimizeButton?: boolean;
}

const onScreenDialogs = new Set<DialogWindow>();

export abstract class DialogWindow {
  dialog: HTMLDivElement;
  titleElement: HTMLDivElement;
  titleTextElement: HTMLDivElement;
  bodyElement: HTMLDivElement;
  maximizeButton?: HTMLButtonElement;
  minimizeButton?: HTMLButtonElement;
  closeButton?: HTMLButtonElement;

  constructor(options: DialogWindowOptions = { closeButton: true }) {
    this.dialog = h('div.window.flex.vertical.floating.hidden',
      this.titleElement = h('div.title-bar.fixed', { ondblclick: () => this.maximizeClick() },
        this.titleTextElement = h('div.title-bar-text', options.titleText),
        h('div.title-bar-controls',
          options.minimizeButton ? (this.minimizeButton = h('button', {
            attrs: { 'aria-label': 'Minimize' },
            type: 'button',
            onclick: () => this.minimizeClick(),
          })) : undefined,
          options.maximizeButton ? (this.maximizeButton = h('button', {
            attrs: { 'aria-label': 'Maximize' },
            type: 'button',
            onclick: () => this.maximizeClick(),
          })) : undefined,
          options.closeButton ? (this.closeButton = h('button', {
            attrs: { 'aria-label': 'Close' },
            type: 'button',
            onclick: () => this.close(),
          })) : undefined,
        ),
      ),
      this.bodyElement = h('div.window-body.expand'),
    );
    document.body.appendChild(this.dialog);
    this.dialog.addEventListener('focusin', () => this.bringToTop(), true);
    this.dialog.addEventListener('click', () => this.bringToTop(), true);
  }

  show() {
    this.dialog.classList.remove('hidden');
    this.bringToTop();
    onScreenDialogs.add(this);
  }

  bringToTop() {
    this.dialog.style.zIndex = (getMaxZIndex() + 1).toString();
    for (const { titleElement } of onScreenDialogs)
      titleElement.classList.add('inactive');
    this.titleElement.classList.remove('inactive');
  }

  protected minimizeClick() {}

  protected maximizeClick() {
    const isMaximized = this.dialog.classList.toggle('maximized');
    this.maximizeButton?.setAttribute('aria-label', isMaximized ? 'Restore' : 'Maximize');
  }

  close() {
    this.dialog.classList.add('hidden');
    onScreenDialogs.delete(this);
  }

  dispose() {
    this.dialog.remove();
    onScreenDialogs.delete(this);
  }
}

function getMaxZIndex() {
  let maxZIndex = 0;
  for (const { dialog } of onScreenDialogs) {
    if (dialog.classList.contains('hidden'))
      continue;
    maxZIndex = Math.max(Number(dialog.style.zIndex) || 0, maxZIndex);
  }
  return maxZIndex;
}

registerDraggableElements('.window>.title-bar', '.window', element => {
  const maxZIndex = getMaxZIndex();
  const win = element.closest<HTMLElement>('.window');
  if (win == null) return;
  if (Number(win.style.zIndex) < maxZIndex)
    win.style.zIndex = (maxZIndex + 1).toString(10);
  for (const { titleElement } of onScreenDialogs)
    titleElement.classList.add('inactive');
  element.classList.remove('inactive');
}, undefined, document.body);
