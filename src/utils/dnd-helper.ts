import { interceptEvent } from './helpers';

export interface DraggingState {
  t: HTMLElement;
  x: number;
  y: number;
}

export function registerDraggableElements(
  draggableSelector: string,
  containerSelector?: string,
  dragHandler?: (element: HTMLElement) => (void | boolean),
  dropHandler?: (element: HTMLElement) => void,
  root: GlobalEventHandlers = self,
) {
  const dragElements = new Map<number, DraggingState>();
  root.addEventListener('pointerdown', e => {
    if (!(e.target instanceof HTMLElement) ||
      dragElements.has(e.pointerId) ||
      !e.target.matches(`${draggableSelector}, ${draggableSelector} *`) ||
      dragHandler?.(e.target as HTMLElement) === false)
      return;
    interceptEvent(e);
    const target = containerSelector &&
      e.target.closest<HTMLElement>(containerSelector) ||
      e.target;
    const [x, y] = getTransformOffset(target);
    dragElements.set(e.pointerId, {
      t: target,
      x: e.clientX - x,
      y: e.clientY - y,
    });
  }, true);
  root.addEventListener('pointermove', e => {
    const state = captureState(e);
    if (state == null) return;
    setTransformOffset(state.t, e.clientX - state.x, e.clientY - state.y);
  }, true);
  root.addEventListener('pointerup', e => {
    const state = captureState(e);
    if (state == null) return;
    dragElements.delete(e.pointerId);
    dropHandler?.(e.target as HTMLElement);
  }, true);
  root.addEventListener('pointercancel', e => {
    const state = captureState(e);
    if (state == null) return;
    setTransformOffset(state.t, state.x, state.y);
    dragElements.delete(e.pointerId);
    dropHandler?.(e.target as HTMLElement);
  }, true);

  function captureState(e: PointerEvent) {
    if (e.target == null) return;
    const state = dragElements.get(e.pointerId);
    if (state == null) return;
    interceptEvent(e);
    return state;
  }
}

function getTransformOffset(element: HTMLElement) {
  const matrixMatch = self.getComputedStyle(element).transform.match(/matrix(3d)?\((.+)\)/);
  if (matrixMatch == null) return [0, 0, 0];
  const v = matrixMatch[2].split(',');
  if (matrixMatch[1] === '3d')
    return [Number(v[12]), Number(v[13]), Number(v[14])];
  else
    return [Number(v[4]), Number(v[5]), 0];
}

function setTransformOffset(element: HTMLElement, x: number, y: number) {
  element.style.transform = `translate(${x}px, ${y}px)`;
}