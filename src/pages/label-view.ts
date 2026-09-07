import type { Order } from '../types';
import { downloadOrderLabel, markLabelPrinted, mountLabelPreview, printOrderLabel } from '../services/label';
import { getFields, getSettings } from '../services/store';
import { esc } from '../utils';
import { msg, toast } from '../ui';
import type { PageResult } from './ctx';

/** Label preview page: Back / Print Label / Download Label. */
export function labelViewPage(order: Order, onBack: () => void, onChanged?: () => void): PageResult {
  return {
    html: `<div class="labelview-bar">
      <button class="btn" data-act="back">← Back</button>
      <div class="title">Label <span class="ordnum">${esc(order.orderNumber)}</span></div>
      <div class="spacer"></div>
      <button class="btn" data-act="download">⬇ Download Label</button>
      <button class="btn primary" data-act="print">🖨 Print Label</button>
    </div>
    <div class="label-stage" data-stage></div>`,
    bind(root) {
      const s = getSettings();
      const fields = getFields();
      mountLabelPreview(root.querySelector('[data-stage]') as HTMLElement, order, s, fields);
      const run = async (action: () => Promise<void>, okMsg: string) => {
        try {
          await action();
          await markLabelPrinted(order);
          toast(okMsg, 'ok');
          onChanged?.();
        } catch (e) {
          toast(msg(e), 'err');
        }
      };
      root.querySelector('[data-act="back"]')!.addEventListener('click', onBack);
      root.querySelector('[data-act="print"]')!.addEventListener('click', () => void run(() => printOrderLabel(order, s, fields), 'Label sent to printer.'));
      root.querySelector('[data-act="download"]')!.addEventListener('click', () => void run(() => downloadOrderLabel(order, s, fields), 'Label downloaded as PDF.'));
    },
  };
}
