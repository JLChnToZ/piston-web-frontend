import { interceptEvent } from './helpers';

export interface DraggingState<T extends Element> {
  t: T;
  x: number;
  y: number;
  minX?: number;
  maxX?: number;
  minY?: number;
  maxY?: number;
}

const enum Direction {
  none = 0x0,
  top = 0x1,
  right = 0x2,
  left = 0x4,
  bottom = 0x8,
  topleft = Direction.top | Direction.left,
  topright = Direction.top | Direction.right,
  bottomleft = Direction.bottom | Direction.left,
  bottomright = Direction.bottom | Direction.right,
}

interface ResizeState extends DraggingState<HTMLElement> {
  d: Direction;
  rx: number;
  ry: number;
}

export interface SVGDraggingState extends DraggingState<SVGGraphicsElement> {
  tf: SVGTransform;
}

export interface Pointer {
  pointerId: number;
  clientX: number;
  clientY: number;
}

const dragging = new WeakSet<Element>();

export abstract class AbstractDraggableHandler<T extends Element, S extends DraggingState<T> = DraggingState<T>> {
  private dragState = new Map<number, S>();

  constructor(
    private draggableSelector: string,
    private containerSelector?: string,
    protected root: GlobalEventHandlers = self,
  ) {
    root.addEventListener(
      'pointerdown',
      this.onPointerDown = this.onPointerDown.bind(this),
    );
    root.addEventListener(
      'pointermove',
      this.onPointerMove = this.onPointerMove.bind(this),
    );
    root.addEventListener(
      'pointerup',
      this.onPointerUp = this.onPointerUp.bind(this),
    );
    root.addEventListener(
      'pointercancel',
      this.onPointerCancel = this.onPointerCancel.bind(this),
    );
  }

  dispose() {
    const { root } = this;
    root.removeEventListener('pointerdown', this.onPointerDown);
    root.removeEventListener('pointermove', this.onPointerMove);
    root.removeEventListener('pointerup', this.onPointerUp);
    root.removeEventListener('pointercancel', this.onPointerCancel);
    this.dragState.clear();
  }

  protected onPointerDown(e: PointerEvent) {
    if (!this.checkType(e.target) ||
      this.dragState.has(e.pointerId))
      return;
    let oTarget = e.target;
    if (oTarget.matches(`${this.draggableSelector} *`))
      oTarget = oTarget.closest<T>(this.draggableSelector)!;
    else if (!oTarget.matches(this.draggableSelector))
      return;
    interceptEvent(e);
    const target = this.containerSelector &&
      oTarget.closest<T>(this.containerSelector) ||
      oTarget;
    if (this.isHandling(target)) return;
    this.dragStart(e, target, oTarget);
  }

  protected onPointerMove(e: PointerEvent) {
    const state = this.captureState(e);
    if (state == null) return;
    this.dragHandle(e, state);
  }

  protected onPointerUp(e: PointerEvent) {
    const state = this.captureState(e);
    if (state == null) return;
    this.dragEnd(e, state);
    this.unregister(e, state);
  }

  protected onPointerCancel(e: PointerEvent) {
    const state = this.captureState(e);
    if (state == null) return;
    this.dragCancel(e, state);
    this.unregister(e, state);
  }

  protected captureState(e: PointerEvent) {
    if (e.target == null) return;
    const state = this.dragState.get(e.pointerId);
    if (state == null) return;
    interceptEvent(e);
    return state;
  }

  protected abstract checkType(target: unknown): target is T;

  protected isHandling(target: T) {
    return dragging.has(target);
  }

  protected register(e: Pointer, target: S extends DraggingState<infer Q> ? Q : T, offsetX: number, offsetY: number) {
    const state: DraggingState<T> = {
      t: target,
      x: e.clientX - offsetX,
      y: e.clientY - offsetY,
    };
    this.dragState.set(e.pointerId, state as S);
    dragging.add(target);
    return state as S;
  }

  protected unregister(e: Pointer, { t }: S = this.dragState.get(e.pointerId)!) {
    this.dragState.delete(e.pointerId);
    dragging.delete(t);
  }

  protected abstract dragStart(e: Pointer, target: T, dragTarget: T): void;
  protected abstract dragHandle(e: Pointer, state: S): void;
  protected abstract dragEnd(e: Pointer, state: S): void;
  protected abstract dragCancel(e: Pointer, state: S): void;
}

export class HTMLDraggableHandler extends AbstractDraggableHandler<HTMLElement> {
  static getTransformOffset(elementOrStyle: HTMLElement | CSSStyleDeclaration) {
    if (!(elementOrStyle instanceof CSSStyleDeclaration))
      elementOrStyle = getComputedStyle(elementOrStyle);
    const matrixMatch = elementOrStyle.transform.match(/matrix(3d)?\((.+)\)/);
    if (matrixMatch == null) return [0, 0, 0];
    const v = matrixMatch[2].split(',');
    if (matrixMatch[1] === '3d')
      return [Number(v[12]), Number(v[13]), Number(v[14])];
    else
      return [Number(v[4]), Number(v[5]), 0];
  }
  
  static setTransformOffset(element: HTMLElement, x: number, y: number) {
    element.style.transform = `translate(${x}px, ${y}px)`;
  }

  protected checkType(target: unknown): target is HTMLElement {
    return target instanceof HTMLElement;
  }

  protected dragStart(e: Pointer, t: HTMLElement, ot?: HTMLElement) {
    const [x, y] = HTMLDraggableHandler.getTransformOffset(t);
    return this.register(e, t, x, y);
  }

  protected dragHandle(e: Pointer, { t, x, y, minX, minY, maxX, maxY }: DraggingState<HTMLElement>) {
    x = e.clientX - x;
    if (minX != null) x = Math.max(minX, x);
    if (maxX != null) x = Math.min(maxX, x);
    y = e.clientY - y;
    if (minY != null) y = Math.max(minY, y);
    if (maxY != null) y = Math.min(maxY, y);
    HTMLDraggableHandler.setTransformOffset(t, x, y);
  }

  protected dragEnd(e: Pointer, state: DraggingState<HTMLElement>) {}

  protected dragCancel(e: Pointer, { t, x, y }: DraggingState<HTMLElement>) {
    HTMLDraggableHandler.setTransformOffset(t, x, y);
  }
}

export class HTMLResizeDraggableHandler extends HTMLDraggableHandler {
  protected dragStart(e: Pointer, target: HTMLElement, dragTarget: HTMLElement) {
    const state = super.dragStart(e, target) as ResizeState;
    const style = getComputedStyle(target);
    if (dragTarget.classList.contains('dir-n'))
      state.d = Direction.top;
    else if (dragTarget.classList.contains('dir-e'))
      state.d = Direction.right;
    else if (dragTarget.classList.contains('dir-s'))
      state.d = Direction.bottom;
    else if (dragTarget.classList.contains('dir-w'))
      state.d = Direction.left;
    else if (dragTarget.classList.contains('dir-ne'))
      state.d = Direction.topright;
    else if (dragTarget.classList.contains('dir-nw'))
      state.d = Direction.topleft;
    else if (dragTarget.classList.contains('dir-se'))
      state.d = Direction.bottomright;
    else if (dragTarget.classList.contains('dir-sw'))
      state.d = Direction.bottomleft;
    if (state.d & Direction.left) {
      const width = parseFloat(style.width);
      state.maxX = e.clientX - state.x + width;
      state.rx = width + e.clientX;
    } else {
      state.minX = state.maxX = e.clientX - state.x;
      if (state.d & Direction.right)
        state.rx = parseFloat(style.width) - e.clientX;
    }
    if (state.d & Direction.top) {
      const height = parseFloat(style.height);
      state.maxY = e.clientY - state.y + height;
      state.ry = parseFloat(style.height) + e.clientY;
    } else {
      state.minY = state.maxY = e.clientY - state.y;
      if (state.d & Direction.bottom)
        state.ry = parseFloat(style.height) - e.clientY;
    }
    return state;
  }

  protected dragHandle(e: Pointer, state: DraggingState<HTMLElement>)  {
    super.dragHandle(e, state);
    const { d, t, rx, ry } = state as ResizeState;
    if (d & Direction.left)
      t.style.width = `${rx - e.clientX}px`;
    else if (d & Direction.right)
      t.style.width = `${rx + e.clientX}px`;
    if (d & Direction.top)
      t.style.height = `${ry - e.clientY}px`;
    else if (d & Direction.bottom)
      t.style.height = `${ry + e.clientY}px`;
  }
}

export class SVGDraggableHandler extends AbstractDraggableHandler<SVGElement, SVGDraggingState> {
  static getLocalPoint(
    pointer: Pointer,
    base?: DOMMatrix | SVGGraphicsElement | null,
    root = (base as SVGElement).ownerSVGElement!,
  ) {
    const p = root.createSVGPoint();
    p.x = pointer.clientX;
    p.y = pointer.clientY;
    return base != null ? p.matrixTransform(
      base instanceof SVGGraphicsElement ?
      base.getScreenCTM()!.inverse() :
      base,
    ) : p;
  }

  protected checkType(target: unknown): target is SVGElement {
    return target instanceof SVGElement;
  }

  protected dragStart(e: Pointer, target: SVGElement) {
    if (!(target instanceof SVGGraphicsElement)) return;
    const root = target.ownerSVGElement!;
    const transforms = target.transform.baseVal;
    if(!transforms.numberOfItems || transforms.getItem(0).type !== SVGTransform.SVG_TRANSFORM_TRANSLATE) {
      const transform = root.createSVGTransform();
      transform.setTranslate(0, 0);
      transforms.insertItemBefore(transform, 0);
    }
    const transform = transforms.getItem(0);
    const offset = SVGDraggableHandler.getLocalPoint(
      e, target.parentNode as SVGGraphicsElement, root,
    ).matrixTransform(transform.matrix.inverse());
    const state = this.register(e, target, offset.x, offset.y);
    state.tf = transform;
  }

  protected dragHandle(e: Pointer, { t, x, y, tf, minX, minY, maxX, maxY }: SVGDraggingState) {
    const coord = SVGDraggableHandler.getLocalPoint(e, t.parentNode as SVGGraphicsElement);
    coord.x -= x;
    if (minX != null) coord.x = Math.max(minX, coord.x);
    if (maxX != null) coord.x = Math.min(maxX, coord.x);
    coord.y -= y;
    if (minY != null) coord.y = Math.max(minY, coord.y);
    if (maxY != null) coord.y = Math.min(maxY, coord.y);
    tf.setTranslate(coord.x, coord.y);
  }

  protected dragEnd(e: Pointer, state: SVGDraggingState) {}

  protected dragCancel(e: Pointer, { tf, x, y }: SVGDraggingState) {
    tf.setTranslate(x, y);
  }
}
