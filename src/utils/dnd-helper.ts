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

const enum ResizeDirection {
  unknown, n, ne, e, se, s, sw, w, nw,
}

interface ResizeState extends DraggingState<HTMLElement> {
  d: ResizeDirection;
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

export abstract class AbstractDraggableHandler<T extends Element, S extends DraggingState<T> = DraggingState<T>> {
  private dragState = new Map<number, S>();
  private dragging = new WeakSet<T>();

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
    return this.dragging.has(target);
  }

  protected register(e: Pointer, target: S extends DraggingState<infer Q> ? Q : T, offsetX: number, offsetY: number) {
    const state: DraggingState<T> = {
      t: target,
      x: e.clientX - offsetX,
      y: e.clientY - offsetY,
    };
    this.dragState.set(e.pointerId, state as S);
    this.dragging.add(target);
    return state as S;
  }

  protected unregister(e: Pointer, { t }: S = this.dragState.get(e.pointerId)!) {
    this.dragState.delete(e.pointerId);
    this.dragging.delete(t);
  }

  protected abstract dragStart(e: Pointer, target: T, dragTarget: T): void;
  protected abstract dragHandle(e: Pointer, state: S): void;
  protected abstract dragEnd(e: Pointer, state: S): void;
  protected abstract dragCancel(e: Pointer, state: S): void;
}

export class HTMLDraggableHandler extends AbstractDraggableHandler<HTMLElement> {
  static getTransformOffset(element: HTMLElement) {
    const matrixMatch = getComputedStyle(element).transform.match(/matrix(3d)?\((.+)\)/);
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
    const { width, height } = target.getBoundingClientRect();
    if (dragTarget.classList.contains('dir-n'))
      state.d = ResizeDirection.n;
    else if (dragTarget.classList.contains('dir-e'))
      state.d = ResizeDirection.e;
    else if (dragTarget.classList.contains('dir-s'))
      state.d = ResizeDirection.s;
    else if (dragTarget.classList.contains('dir-w'))
      state.d = ResizeDirection.w;
    else if (dragTarget.classList.contains('dir-ne'))
      state.d = ResizeDirection.ne;
    else if (dragTarget.classList.contains('dir-nw'))
      state.d = ResizeDirection.nw;
    else if (dragTarget.classList.contains('dir-se'))
      state.d = ResizeDirection.se;
    else if (dragTarget.classList.contains('dir-sw'))
      state.d = ResizeDirection.sw;
    switch (state.d) {
      case ResizeDirection.w: case ResizeDirection.nw: case ResizeDirection.sw:
        state.rx = width + e.clientX;
        break;
      case ResizeDirection.e: case ResizeDirection.ne: case ResizeDirection.se:
        state.rx = width - e.clientX;
        break;
    }
    switch (state.d) {
      case ResizeDirection.n: case ResizeDirection.ne: case ResizeDirection.nw:
        state.ry = height + e.clientY;
        break;
      case ResizeDirection.s: case ResizeDirection.se: case ResizeDirection.sw:
        state.ry = height - e.clientY;
        break;
    }
    switch (state.d) {
      case ResizeDirection.n: case ResizeDirection.s:
      case ResizeDirection.e: case ResizeDirection.se: case ResizeDirection.ne:
        state.minX = state.maxX = e.clientX - state.x; break;
    }
    switch (state.d) {
      case ResizeDirection.e: case ResizeDirection.w:
      case ResizeDirection.s: case ResizeDirection.se: case ResizeDirection.sw:
        state.minY = state.maxY = e.clientY - state.y; break;
    }
    return state;
  }

  protected dragHandle(e: Pointer, state: DraggingState<HTMLElement>)  {
    super.dragHandle(e, state);
    switch ((state as ResizeState).d) {
      case ResizeDirection.w: case ResizeDirection.nw: case ResizeDirection.sw:
        state.t.style.width = `${(state as ResizeState).rx - e.clientX}px`;
        break;
      case ResizeDirection.e: case ResizeDirection.ne: case ResizeDirection.se:
        state.t.style.width = `${(state as ResizeState).rx + e.clientX}px`;
        break;
    }
    switch ((state as ResizeState).d) {
      case ResizeDirection.n: case ResizeDirection.ne: case ResizeDirection.nw:
        state.t.style.height = `${(state as ResizeState).ry - e.clientY}px`;
        break;
      case ResizeDirection.s: case ResizeDirection.se: case ResizeDirection.sw:
        state.t.style.height = `${(state as ResizeState).ry + e.clientY}px`;
        break;
    }
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
