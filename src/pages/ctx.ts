export type Route = 'dashboard' | 'new' | 'orders' | 'products' | 'fields' | 'settings' | 'label';

export interface Ctx {
  route: Route;
  id: string | null;
  go(route: Route, id?: string | null): void;
  rerender(): void;
}

export interface PageResult {
  html: string;
  bind?(root: HTMLElement): void | Promise<void>;
}
