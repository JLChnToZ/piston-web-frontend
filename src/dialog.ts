import h from 'hyperscript';
import { DraggingState, HTMLDraggableHandler, HTMLResizeDraggableHandler, Pointer } from './utils/dnd-helper';

export interface DialogWindowOptions {
  titleText?: string | Node,
  closeButton?: boolean;
  maximizeButton?: boolean;
  minimizeButton?: boolean;
  resizable?: boolean;
}

const onScreenDialogs = new Map<HTMLElement, DialogWindow>();

export abstract class DialogWindow {
  dialog: HTMLDivElement;
  titleElement: HTMLDivElement;
  titleTextElement: HTMLDivElement;
  bodyElement: HTMLDivElement;
  maximizeButton?: HTMLButtonElement;
  minimizeButton?: HTMLButtonElement;
  closeButton?: HTMLButtonElement;
  isFocused?: boolean;
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
    this.dialog.addEventListener('focusin', () => this.focus(), true);
    this.dialog.addEventListener('click', () => this.focus(), true);
  }

  show() {
    const { classList } = this.dialog;
    if (classList.contains('hidden')) {
      if (classList.contains('maximized'))
        this.maximizeClick();
      if (classList.contains('minimized'))
        this.minimizeClick();
      classList.remove('hidden');
    }
    this.focus();
    onScreenDialogs.set(this.dialog, this);
  }

  focus() {
    let maxZIndex = 0;
    for (const handler of onScreenDialogs.values()) {
      if (handler === this) continue;
      const { dialog } = handler;
      if (dialog.classList.contains('hidden'))
        continue;
      handler.blur();
      maxZIndex = Math.max(Number(dialog.style.zIndex) || 0, maxZIndex);
    }
    if (Number(this.dialog.style.zIndex || 0) < maxZIndex)
      this.dialog.style.zIndex = (maxZIndex + 1).toString();
    if (!this.isFocused) this.onfocus();
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
    onScreenDialogs.delete(this.dialog);
    this.isFocused = false;
    let maxZIndex = Number.NEGATIVE_INFINITY;
    let topElement: DialogWindow | undefined;
    for (const handler of onScreenDialogs.values()) {
      const { dialog } = handler;
      if (dialog.classList.contains('hidden'))
        continue;
      const zIndex = Number(dialog.style.zIndex || 0);
      if (zIndex <= maxZIndex)
        continue;
      maxZIndex = zIndex;
      topElement = handler;
    }
    topElement?.onfocus();
  }

  protected onfocus() {
    this.titleElement.classList.remove('inactive');
    this.isFocused = true;
  }

  blur() {
    this.titleElement.classList.add('inactive');
    this.isFocused = false;
    const { activeElement } = document;
    if (!(activeElement instanceof HTMLElement)) return;
    for (let e: HTMLElement | null = activeElement;
      e != null;
      e = e.parentElement)
      if (e === this.dialog) {
        activeElement.blur();
        break;
      }
  }

  dispose() {
    this.dialog.remove();
    onScreenDialogs.delete(this.dialog);
  }
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
  const dialog = target.closest<HTMLElement>('.window');
  if (dialog) onScreenDialogs.get(dialog)?.focus();
}
