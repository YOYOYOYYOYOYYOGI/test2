// Small shared UI helpers: toasts, modals, confirm dialogs. No framework.
export const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export function toast(message: string, kind: '' | 'ok' | 'err' = ''): void {
  let box = document.getElementById('toasts');
  if (!box) {
    box = document.createElement('div');
    box.id = 'toasts';
    document.body.appendChild(box);
  }
  const t = document.createElement('div');
  t.className = 'toast ' + kind;
  t.textContent = message;
  box.appendChild(t);
  setTimeout(() => {
    t.style.transition = 'opacity .25s';
    t.style.opacity = '0';
    setTimeout(() => t.remove(), 260);
  }, kind === 'err' ? 5200 : 2600);
}

export interface ModalHandle {
  close(): void;
  el: HTMLElement;
}

export function modal(html: string, onOpen?: (el: HTMLElement, close: () => void) => void): ModalHandle {
  const wrap = document.createElement('div');
  wrap.className = 'modal-wrap';
  wrap.innerHTML = `<div class="modal">${html}</div>`;
  const close = () => wrap.remove();
  wrap.addEventListener('mousedown', (e) => {
    if (e.target === wrap) close();
  });
  document.body.appendChild(wrap);
  const el = wrap.querySelector('.modal') as HTMLElement;
  onOpen?.(el, close);
  return { close, el };
}

export function confirmModal(title: string, body: string, okLabel: string, danger = true): Promise<boolean> {
  return new Promise((res) => {
    modal(
      `<h3>${title}</h3><p class="muted" style="margin:0 0 4px">${body}</p>
       <div class="row"><button class="btn" data-x>Cancel</button><button class="btn ${danger ? 'danger' : 'primary'}" data-ok>${okLabel}</button></div>`,
      (el, close) => {
        el.querySelector('[data-x]')!.addEventListener('click', () => { close(); res(false); });
        el.querySelector('[data-ok]')!.addEventListener('click', () => { close(); res(true); });
      }
    );
  });
}
