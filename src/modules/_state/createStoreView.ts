/**
 * @module modules/_state/createStoreView
 * @description Helper to expose a type-narrowed view over a Zustand store.
 *
 * P0-04 transitional pattern: the canonical state lives in `useComposedStore`.
 * Feature-bounded stores (useUserStore, useUIStore, …) are narrowed views over
 * it, so consumers can import only the slice they need while behavior remains
 * identical to the pre-decomposition monolith.
 *
 * Once consumers migrate off the legacy `useStore` shim, the underlying
 * composition can be split into truly independent stores without changing
 * the public API of the views.
 */

import type { UseBoundStore, StoreApi } from 'zustand';

type StoreHook<T> = UseBoundStore<StoreApi<T>>;

export interface StoreView<T> {
  (): T;
  <U>(selector: (state: T) => U): U;
  getState: () => T;
  setState: StoreApi<T>['setState'];
  subscribe: StoreApi<T>['subscribe'];
}

/**
 * Returns a hook+API that types the underlying store as the narrowed `T`.
 * Runtime behavior is delegated 1:1 to the source store.
 */
export function createStoreView<TFull, TView extends Partial<TFull>>(
  source: StoreHook<TFull>,
): StoreView<TView> {
  const view = ((selector?: (state: TView) => unknown) => {
    if (selector) {
      return source((s) => selector(s as unknown as TView));
    }
    return source() as unknown as TView;
  }) as StoreView<TView>;

  view.getState = () => source.getState() as unknown as TView;
  view.setState = source.setState as unknown as StoreApi<TView>['setState'];
  view.subscribe = source.subscribe as unknown as StoreApi<TView>['subscribe'];

  return view;
}
