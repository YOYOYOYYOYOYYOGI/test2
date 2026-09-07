import { useEffect, useState } from 'react';

export type RouteName = 'dashboard' | 'orders' | 'new' | 'edit' | 'products' | 'fields' | 'settings' | 'wizard' | 'print';

export interface Route {
  name: RouteName;
  /** e.g. edit order id */
  param?: string;
  query: URLSearchParams;
  raw: string;
}

export function parseHash(hash: string): Route {
  let h = (hash || '').replace(/^#\/?/, '');
  const qIndex = h.indexOf('?');
  let query = new URLSearchParams();
  if (qIndex >= 0) {
    query = new URLSearchParams(h.slice(qIndex + 1));
    h = h.slice(0, qIndex);
  }
  const parts = h.split('/').filter(Boolean);
  let name: RouteName = 'dashboard';
  if (parts[0]) {
    const n = parts[0] as RouteName;
    if (['dashboard', 'orders', 'new', 'edit', 'products', 'fields', 'settings', 'wizard', 'print'].includes(n)) name = n;
  }
  return { name, param: parts[1], query, raw: h };
}

export function navigate(route: string, opts?: { replace?: boolean }): void {
  const target = `#/${route.replace(/^\/?/, '')}`;
  if (opts?.replace) {
    window.location.replace(`${window.location.pathname}${target}`);
  } else if (window.location.hash === target) {
    window.location.hash = `#/`; // force change so listeners re-fire
    setTimeout(() => { window.location.hash = target; }, 0);
  } else {
    window.location.hash = target;
  }
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

/** open a full app page in a new tab (used from popup and quick actions) */
export function openAppTab(page: string, params?: Record<string, string>): void {
  const q = params ? `?${new URLSearchParams(params).toString()}` : '';
  const url = chrome.runtime.getURL(`index.html#/${page}${q}`);
  if (typeof chrome !== 'undefined' && chrome.tabs?.create) void chrome.tabs.create({ url });
  else window.open(url, '_blank');
}
