import { concat, fromEvent, Observable } from 'rxjs';
import { pluck, shareReplay } from 'rxjs/operators';

const mqObservables = new Map<string, Observable<boolean>>();
export function observeMediaQuery(query: string) {
  let observable = mqObservables.get(query);
  if (!observable) {
    const mq = matchMedia(query);
    mqObservables.set(query, observable = concat(
      [mq.matches],
      fromEvent<MediaQueryListEvent>(mq, 'change').pipe(pluck('matches')),
    ).pipe(shareReplay(1)));
  }
  return observable;
}

export function delay(duration: number): Promise<void>;
export function delay<T>(duration: number, returnValue: T): Promise<T>;
export function delay(duration: number, returnValue?: any) {
  return new Promise(resolve => setTimeout(resolve, duration, returnValue));
}

export function getOrCreate<K>(map: Map<K, any>, key: K): any;
export function getOrCreate<K, V, A extends any[] = any[]>(
  map: Map<K, V>,
  key: K,
  ctor: new(...args: A) => V,
  ...args: A
): V;
export function getOrCreate<K extends object>(
  map: WeakMap<K, any>,
  key: K
): any;
export function getOrCreate<K extends object, V, A extends any[] = any[]>(
  map: WeakMap<K, V>,
  key: K,
  ctor: new(...args: A) => V,
  ...args: A
): V;
export function getOrCreate(
  map: WeakMap<any, any> | Map<any, any>,
  key: any,
  ctor?: Function,
  ...args: any[]
) {
  if (map.has(key)) return map.get(key)!;
  const entry = ctor == null ? Object.create(null) : Reflect.construct(ctor, args);
  map.set(key, entry);
  return entry;
}

export function addEventListenerAndCache(
  cacheList: [EventTarget, string, EventListenerOrEventListenerObject][],
  target: EventTarget,
  event: string,
  callback: EventListenerOrEventListenerObject,
  options?: AddEventListenerOptions | boolean,
) {
  target.addEventListener(event, callback, options);
  const cacheEntry: [EventTarget, string, EventListenerOrEventListenerObject] = [target, event, callback];
  if (cacheList) {
    cacheList.push(cacheEntry);
    return cacheList;
  }
  return [cacheEntry];
}
