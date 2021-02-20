import h from 'hyperscript';
import { DraggingState, HTMLDraggableHandler, HTMLResizeDraggableHandler, Pointer } from './utils/dnd-helper';

export interface DialogWindowOptions {
  iconPath?: string,
  titleText?: string | Node,
  closeButton?: boolean;
  maximizeButton?: boolean;
  minimizeButton?: boolean;
  resizable?: boolean;
  x?: number;
  y?: number;
}

const onScreenDialogs = new Map<HTMLElement, DialogWindow>();

export abstract class DialogWindow {
  dialog: HTMLDivElement;
  titleElement: HTMLDivElement;
  titleTextElement: HTMLDivElement;
  bodyElement: HTMLDivElement;
  icon?: HTMLImageElement;
  maximizeButton?: HTMLButtonElement;
  minimizeButton?: HTMLButtonElement;
  closeButton?: HTMLButtonElement;
  isFocused?: boolean;
  private _x?: number;
  private _y?: number;
  private _w?: number;
  private _h?: number;

  constructor(options: DialogWindowOptions = { closeButton: true }) {
    if (options.x != null) this._x = options.x;
    if (options.y != null) this._y = options.y;
    this.dialog = h('div.window.flex.vertical.floating.hidden',
      this.titleElement = h('div.title-bar.fixed', { ondblclick: () => this.maximizeClick() },
        this.titleTextElement = h('div.title-bar-text',
          options.iconPath ? this.icon = h<HTMLImageElement>('img.icon', {
            src: options.iconPath, ondblclick: () => this.close(),
          }) : undefined,
          options.titleText,
        ),
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
    this.restore(true);
    onScreenDialogs.set(this.dialog, this);
  }

  focus() {
    const dialogs: HTMLElement[] = [];
    const zOrderMapping = new WeakMap<HTMLElement, number>();
    for (const handler of onScreenDialogs.values()) {
      if (handler === this) continue;
      const { dialog } = handler;
      if (dialog.classList.contains('hidden') || zOrderMapping.has(dialog))
        continue;
      handler.blur();
      dialogs.push(dialog);
      zOrderMapping.set(dialog, Number(dialog.style.zIndex));
    }
    dialogs.sort((lhs, rhs) => {
      const lz = zOrderMapping.get(lhs) ?? Number(lhs.style.zIndex);
      const rz = zOrderMapping.get(rhs) ?? Number(rhs.style.zIndex);
      return lz > rz ? 1 : lz < rz ? -1 : 0;
    });
    dialogs.push(this.dialog);
    dialogs.forEach(({ style }, index) =>
      style.zIndex = (index + 1).toString(10),
    );
    if (!this.isFocused) this.onfocus();
  }

  protected minimizeClick() {
    if (this.dialog.classList.contains('minimized'))
      this.restore();
    else
      this.minimize();
  }

  protected maximizeClick() {
    if (this.dialog.classList.contains('maximized'))
      this.restore();
    else
      this.maximize();
  }

  private recordPosition() {
    const style = getComputedStyle(this.dialog);
    this._w = parseFloat(style.width);
    this._h = parseFloat(style.height);
    const offset = HTMLDraggableHandler.getTransformOffset(style);
    this._x = offset[0];
    this._y = offset[1];
  }

  maximize() {
    const { classList } = this.dialog;
    if (classList.contains('maximized'))
      return false;
    if (classList.contains('minimized'))
      classList.remove('minimized');
    else
      this.recordPosition();
    this.minimizeButton?.setAttribute('aria-label', 'Minimize');
    this.maximizeButton?.setAttribute('aria-label', 'Restore');
    classList.add('maximized');
    return true;
  }

  minimize() {
    const { classList } = this.dialog;
    if (classList.contains('minimized'))
      return false;
    if (classList.contains('maximized'))
      classList.remove('maximized');
    else
      this.recordPosition();
    this.minimizeButton?.setAttribute('aria-label', 'Restore');
    this.maximizeButton?.setAttribute('aria-label', 'Maximize');
    classList.add('minimized');
    return true;
  }

  restore(positionOnly?: boolean) {
    const { classList } = this.dialog;
    const isMinimized = classList.contains('minimized');
    const isMaximized = classList.contains('maximized');
    if (positionOnly ? isMinimized || isMaximized : isMinimized === isMaximized)
      return false;
    this.minimizeButton?.setAttribute('aria-label', 'Minimize');
    this.maximizeButton?.setAttribute('aria-label', 'Maximize');
    classList.remove('maximized', 'minimized');
    if (this._w != null) this.dialog.style.width = `${this._w}px`;
    if (this._h != null) this.dialog.style.height = `${this._h}px`;
    let x = this._x;
    let y = this._y;
    if (x == null || y == null) {
      const rect = this.dialog.parentElement?.getBoundingClientRect();
      if (rect) {
        if (x == null) x = rect.left + (rect.width - (this._w ?? rect.width / 2)) / 2;
        if (y == null) y = rect.top + (rect.height - (this._h ?? rect.height / 2)) / 2;
      } else {
        if (x == null) x = 0;
        if (y == null) y = 0;
      }
    }
    HTMLDraggableHandler.setTransformOffset(this.dialog, x, y);
    return true;
  }

  resetStoredPosition(x?: number | null, y?: number | null, w?: number | null, h?: number | null) {
    if (x !== null) this._x = x ?? undefined;
    if (y !== null) this._y = y ?? undefined;
    if (w !== null) this._w = w ?? undefined;
    if (h !== null) this._h = h ?? undefined;
  }

  close() {
    const { classList } = this.dialog;
    if (!classList.contains('minimized') && !classList.contains('minimized'))
      this.recordPosition();
    classList.add('hidden');
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
