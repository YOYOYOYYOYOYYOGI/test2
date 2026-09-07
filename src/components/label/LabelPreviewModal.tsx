// ---------------------------------------------------------------------------
// Label preview modal — shows the exact printable label scaled down, with
// Print actions. Used right after an order is saved and from the orders list.
// ---------------------------------------------------------------------------
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Order } from '../../types';
import { useAppStore, toast } from '../../store/appStore';
import { Button, Modal } from '../ui';
import { LabelSheet, labelSizePx } from './LabelSheet';
import { buildLabelModel } from './labelModel';
import { openPrintPage } from './printFlow';
import { downloadOrderLabelPng } from '../../services/labelDownload';
import { IconDownload, IconPrinter } from '../icons';

export function LabelPreviewModal({ order, onClose, onNew, markOnPrint = true }: {
  order: Order;
  onClose: () => void;
  /** optional: "Save another" button */
  onNew?: () => void;
  markOnPrint?: boolean;
}) {
  const settings = useAppStore((s) => s.settings);
  const fields = useAppStore((s) => s.fields);
  const model = useMemo(() => buildLabelModel(order, settings, fields), [order, settings, fields]);
  const [scale, setScale] = useState(1);
  const [dlBusy, setDlBusy] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const { width, height } = labelSizePx(settings);

  const downloadLabel = async () => {
    if (dlBusy) return;
    setDlBusy(true);
    try {
      await downloadOrderLabelPng(order, settings, fields);
      toast('success', `Label for ${order.orderNumber} downloaded.`);
    } catch (e) {
      toast('error', 'Label download failed', { message: e instanceof Error ? e.message : undefined });
    } finally {
      setDlBusy(false);
    }
  };

  useLayoutEffect(() => {
    const measure = () => {
      const box = boxRef.current;
      if (!box) return;
      const availW = box.clientWidth - 24;
      const availH = box.clientHeight - 24;
      setScale(Math.min(availW / width, availH / height, 1));
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (boxRef.current) ro.observe(boxRef.current);
    return () => ro.disconnect();
  }, [width, height, order.id]);

  return (
    <Modal
      open
      onClose={onClose}
      title={`Label Preview — ${order.orderNumber}`}
      wide
      footer={
        <>
          {onNew && <Button variant="ghost" onClick={onNew}>Save Another Order</Button>}
          <Button variant="outline" icon={<IconDownload width={14} />} onClick={() => void downloadLabel()} disabled={dlBusy}>
            {dlBusy ? <span className="spinner" /> : 'Download Label'}
          </Button>
          <Button variant="outline" icon={<IconPrinter width={14} />} onClick={() => openPrintPage({ orderIds: [order.id], auto: true })}>
            Print
          </Button>
          {markOnPrint && (
            <Button variant="primary" icon={<IconPrinter width={14} />} onClick={() => openPrintPage({ orderIds: [order.id], mark: true, auto: true })}>
              Print &amp; Mark as Printed
            </Button>
          )}
        </>
      }
    >
      <div ref={boxRef} style={{ height: 'min(62vh, 540px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflow: 'hidden', background: 'repeating-conic-gradient(#f4f7fb 0% 25%, #fff 0% 50%) 0 0/18px 18px', borderRadius: 10, padding: 12 }}>
        <div style={{ width: width * scale, height: height * scale, position: 'relative' }}>
          <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width, height, boxShadow: '0 2px 18px rgba(15,23,42,.22)', border: '1px solid #d7e0ec' }}>
            <LabelSheet model={model} settings={settings} />
          </div>
        </div>
      </div>
      <p className="hint" style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <span>Preview is scaled to fit — the printed label is exact size. Size: {settings.labels.widthMm} × {settings.labels.heightMm} mm.</span>
        <span>Tip: choose “Save as PDF” to check the layout without wasting paper.</span>
      </p>
    </Modal>
  );
}
