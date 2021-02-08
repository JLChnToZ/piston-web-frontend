import h from 'hyperscript';
import { DraggingState, HTMLDraggableHandler, HTMLResizeDraggableHandler, Pointer } from './utils/dnd-helper';

export interface DialogWindowOptions {
  titleText?: string | Node,
  closeButton?: boolean;
  maximizeButton?: boolean;
  minimizeButton?: boolean;
  resizable?: boolean;
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
  private _x?: number;
  private _y?: number;
  private _w?: number;
  private _h?: number;

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
    if (options.resizable) {
      this.dialog.classList.add('reiszable');
      const frag = document.createDocumentFragment();
      frag.append(
        h('div.resize-handle.dir-e'),
        h('div.resize-handle.dir-se'),
        h('div.resize-handle.dir-s'),
        h('div.resize-handle.dir-sw'),
        h('div.resize-handle.dir-w'),
        h('div.resize-handle.dir-nw'),
        h('div.resize-handle.dir-n'),
        h('div.resize-handle.dir-ne'),
      );
      this.dialog.insertBefore(frag, this.titleElement);
    }
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

  protected minimizeClick() {
    const [x, y] = HTMLDraggableHandler.getTransformOffset(this.dialog);
    const { width, height } = this.dialog.getBoundingClientRect();
    const isMinimized = this.dialog.classList.toggle('minimized');
    const isMaximized = this.dialog.classList.contains('maximized');
    if (isMinimized) this.maximizeButton?.setAttribute('aria-label', 'Maximize');
    this.minimizeButton?.setAttribute('aria-label', isMinimized ? 'Restore' : 'Minimize');
    if (!isMinimized && !isMaximized) {
      if (this._w != null) this.dialog.style.width = `${this._w}px`;
      if (this._h != null) this.dialog.style.height = `${this._h}px`;
      HTMLDraggableHandler.setTransformOffset(this.dialog, this._x ?? 0, this._y ?? 0);
    } else if (isMinimized) {
      this.dialog.classList.remove('maximized');
      this._w = width;
      this._h = height;
      this._x = x;
      this._y = y;
      HTMLDraggableHandler.setTransformOffset(this.dialog, 0, 0);
    }
  }

  protected maximizeClick() {
    const { width, height } = this.dialog.getBoundingClientRect();
    const isMaximized = this.dialog.classList.toggle('maximized');
    const isMinimized = this.dialog.classList.contains('minimized');
    if (isMaximized) this.minimizeButton?.setAttribute('aria-label', 'Minimize');
    this.maximizeButton?.setAttribute('aria-label', isMaximized ? 'Restore' : 'Maximize');
    if (!isMinimized && !isMaximized) {
      if (this._w != null) this.dialog.style.width = `${this._w}px`;
      if (this._h != null) this.dialog.style.height = `${this._h}px`;
    } else if (isMaximized) {
      this.dialog.classList.remove('minimized');
      this._w = width;
      this._h = height;
    }
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

new (class extends HTMLDraggableHandler {
  dragStart(e: Pointer, target: HTMLElement) {
    const state = super.dragStart(e, target);
    bringToTopStartDrag(target);
    target.classList.add('dragging');
    return state;
  }
  dragEnd(e: Pointer, { t }: DraggingState<HTMLElement>) {
    t.classList.remove('dragging');
  }
  dragCancel(e: Pointer, state: DraggingState<HTMLElement>) {
    super.dragCancel(e, state);
    state.t.classList.remove('dragging');
  }
})('.window:not(.maximized)>.title-bar', '.window', document.body);

new (class extends HTMLResizeDraggableHandler {
  dragStart(e: Pointer, target: HTMLElement, oTarget: HTMLElement) {
    const state = super.dragStart(e, target, oTarget);
    bringToTopStartDrag(target);
    target.classList.add('dragging');
    return state;
  }
  dragEnd(e: Pointer, { t }: DraggingState<HTMLElement>) {
    t.classList.remove('dragging');
  }
  dragCancel(e: Pointer, state: DraggingState<HTMLElement>) {
    super.dragCancel(e, state);
    state.t.classList.remove('dragging');
  }
})('.window:not(.maximized)>.resize-handle', '.window', document.body);

function bringToTopStartDrag(target: HTMLElement) {
  const maxZIndex = getMaxZIndex();
  const win = target.closest<HTMLElement>('.window');
  if (win == null) return;
  if (Number(win.style.zIndex) < maxZIndex)
    win.style.zIndex = (maxZIndex + 1).toString(10);
  for (const { titleElement } of onScreenDialogs)
    titleElement.classList.add('inactive');
  target.querySelector('.title-bar')?.classList.remove('inactive');
}
