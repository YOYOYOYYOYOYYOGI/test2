// ---------------------------------------------------------------------------
// Opens the print page (print.html) in a Chrome tab, which renders the chosen
// labels with print CSS and invokes the Chrome print dialog.
// ---------------------------------------------------------------------------
export interface PrintRequest {
  orderIds?: string[];
  /** print orders currently with any of these statuses */
  statuses?: string[];
  /** mark orders as Printed once labels are printed */
  mark?: boolean;
  /** call window.print() automatically when ready */
  auto?: boolean;
  /** keep the tab open after printing (default true → close after print) */
  keepOpen?: boolean;
}

export function buildPrintUrl(req: PrintRequest): string {
  const p = new URLSearchParams();
  if (req.orderIds?.length) p.set('ids', req.orderIds.join(','));
  if (req.statuses?.length) p.set('statuses', req.statuses.join(','));
  if (req.mark) p.set('mark', '1');
  if (req.auto) p.set('auto', '1');
  if (req.keepOpen) p.set('keep', '1');
  return chrome.runtime.getURL(`print.html?${p.toString()}`);
}

/** Open the print page for a single order or a selection. */
export async function openPrintPage(req: PrintRequest): Promise<void> {
  const url = buildPrintUrl(req);
  if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
    await chrome.tabs.create({ url });
  } else {
    window.open(url, '_blank');
  }
}
