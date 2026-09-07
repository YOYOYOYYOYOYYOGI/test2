// ---------------------------------------------------------------------------
// WhatsApp message parser — turns a pasted order message into form values
// ---------------------------------------------------------------------------
export interface ParsedOrder {
  customer?: { name?: string; whatsapp?: string; mobile?: string; address?: string; city?: string; state?: string; pincode?: string };
  products?: { name: string; quantity: number }[];
  payment?: { status?: string; method?: string; amount?: string; txnId?: string };
  orderNumber?: string;
  /** how confident we are */
  matched: string[];
  raw: string;
}

const KNOWN_MARKERS: { key: keyof NonNullable<ParsedOrder['customer']>; re: RegExp }[] = [
  { key: 'name', re: /(?:customer|cust|name)\s*[:=]?\s*([A-Za-z][A-Za-z .'-]{1,60})/i },
  { key: 'whatsapp', re: /(?:whatsapp|wa)\s*(?:no|number|#)?\s*[:=]?\s*([+0-9][0-9\s\-()]{7,16})/i },
  { key: 'mobile', re: /(?:mobile|phone|mob|ph|contact|tel)\s*(?:no|number|#)?\s*[:=]?\s*([+0-9][0-9\s\-()]{7,16})/i },
  { key: 'address', re: /(?:address|addr|ship(?:ping)?\s*to)\s*[:=]?\s*([^\n]{5,120})/i },
  { key: 'city', re: /(?:city|town)\s*[:=]?\s*([A-Za-z][A-Za-z .'-]{1,40})/i },
  { key: 'state', re: /(?:state)\s*[:=]?\s*([A-Za-z][A-Za-z .'-]{1,40})/i },
  { key: 'pincode', re: /(?:pincode|pin|zip|postal)\s*(?:code)?\s*[:=]?\s*([0-9]{6})/i },
];

const PRODUCT_LINE =
  /(?:product|item)?\s*(?:[-*•]|\d+[.)])\s*(?:qty|quantity|no|nos|count)\s*[:=]?\s*(\d+)\s*[x×*]\s*(.+)|(?:product|item)?\s*([-*•]?\s*[A-Za-z][A-Za-z0-9 &.'-]{2,40})\s*[x×*]\s*(\d+)|(?:product|item)\s*[:=]?\s*([^\n,]{2,50})\s*[,;]\s*qty(?:u\s*a\s*n\s*t\s*i\s*t\s*y)?\s*[:=]?\s*(\d+)/i;

function firstMatch(re: RegExp, text: string): string | undefined {
  const m = text.match(re);
  return m ? m[1].trim() : undefined;
}

function extractProducts(text: string): { name: string; quantity: number }[] {
  const products: { name: string; quantity: number }[] = [];
  const lines = text.split(/\r?\n|[,;](?=\s)/);
  for (const line of lines) {
    if (!line.trim()) continue;
    let m = line.match(/(?:^|[,;])\s*(?:product|item)\s*[:=]?\s*([^,;\n]{2,60})\s*[,;]\s*(?:qty|quantity|count)\s*[:=]?\s*(\d+)/i);
    if (m) { products.push({ name: m[1].trim(), quantity: parseInt(m[2], 10) }); continue; }
    m = line.match(/(.+?)\s*[x×*]\s*(\d+)\s*$/i);
    if (m) { products.push({ name: m[1].trim(), quantity: parseInt(m[2], 10) }); continue; }
    m = line.match(/^\s*(?:qty|quantity)\s*[:=]?\s*(\d+)\s*[x×*]\s*(.+?)\s*$/i);
    if (m) { products.push({ name: m[2].trim(), quantity: parseInt(m[1], 10) }); continue; }
  }
  const seen = new Set<string>();
  const clean = products
    .map((p) => ({ name: p.name.replace(/^(?:product|item)\s*[:=]?\s*/i, '').trim(), quantity: p.quantity }))
    .filter((p) => {
      if (!p.name || p.name.length < 2 || p.name.length > 60) return false;
      if (p.name.toLowerCase().startsWith('order') || p.name.toLowerCase().startsWith('customer')) return false;
      const key = p.name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return p.quantity >= 1 && p.quantity <= 9999;
    });
  void PRODUCT_LINE; // regex reserved for future multiline formats
  return clean;
}

function extractPayment(text: string) {
  const t = text;
  const statuses = ['Refunded', 'Failed', 'Pending', 'COD', 'Paid'] as const;
  let status: string | undefined;
  for (const s of statuses) {
    if (new RegExp(`\\b(payment\\s*status|pay\\s*status|status)\\b\\s*[:=]?\\s*${s}\\b`, 'i').test(t) ||
        new RegExp(`\\b${s}\\b\\s*(payment|pay)`, 'i').test(t) && s === 'COD' || (s === 'Paid' && /\bpaid\b/i.test(t) && !/\bpayment\s*status\s*:\s*pending/i.test(t))) {
      if (s !== 'Paid' || !/\bunpaid|not paid|pending\b/i.test(t)) { status = s; break; }
    }
  }
  if (!status && /cash on delivery/i.test(t)) status = 'COD';
  const method = /upi/i.test(t) ? 'UPI' : /cash/i.test(t) && /cash on delivery/i.test(t) ? 'COD' : /bank transfer|neft|imps|rtgs/i.test(t) ? 'Bank Transfer' : /card/i.test(t) ? 'Card' : undefined;
  let amount: string | undefined;
  const am = t.match(/(?:amount|total|amt)\s*[:=]?\s*(?:₹|rs\.?|inr)\s*([0-9,]+(?:\.[0-9]{1,2})?)/i);
  if (am) amount = am[1].trim();
  const txn = t.match(/(?:txn|transaction|ref|order\s*id)\s*(?:id|no|#|number)?\s*[:=]?\s*([A-Za-z0-9.\-]{6,30})/i);
  const orderNumber = t.match(/(?:order\s*(?:no|number|#)|ord)[:=]?\s*([A-Za-z0-9.\-]{3,30})/i);
  return { status, method, amount, txnId: txn?.[1]?.trim(), orderNumber: orderNumber?.[1]?.trim() };
}

export function parseWhatsAppMessage(raw: string): ParsedOrder {
  const text = (raw || '').replace(/\u00a0/g, ' ').trim();
  const matched: string[] = [];
  const customer: NonNullable<ParsedOrder['customer']> = {};
  const hasAny = /(customer|name|whatsapp|mobile|address|qty|quantity|product|paid|cod|upi|order)/i.test(text);
  if (hasAny) {
    for (const marker of KNOWN_MARKERS) {
      const v = firstMatch(marker.re, text);
      if (v) {
        customer[marker.key] = v;
        if (marker.key === 'name') matched.push('Customer name');
        if (marker.key === 'whatsapp' || marker.key === 'mobile') matched.push('Phone');
        if (marker.key === 'address') matched.push('Address');
        if (marker.key === 'pincode') matched.push('Pincode');
      }
    }
    // If only one phone found, apply to both whatsapp + mobile
    if (!customer.whatsapp && customer.mobile) customer.whatsapp = customer.mobile;
    if (!customer.mobile && customer.whatsapp) customer.mobile = customer.whatsapp;
    if (!customer.address && customer.city) customer.address = customer.city;
  }
  const products = extractProducts(text);
  if (products.length) matched.push('Products');
  const payment = extractPayment(text);
  const payMatches: string[] = [];
  if (payment.status) { payMatches.push(`Payment status: ${payment.status}`); }
  if (payment.amount) payMatches.push('Payment amount');
  if (payment.txnId) payMatches.push('Transaction ID');
  matched.push(...payMatches);
  const noMarkers = matched.length === 0 && text.split(/\s+/).length < 8;
  return {
    customer: Object.keys(customer).length ? customer : undefined,
    products: products.length ? products : undefined,
    payment: (payment.status || payment.amount || payment.txnId || payment.method) ? payment : undefined,
    orderNumber: payment?.orderNumber,
    matched,
    raw: text,
    ...(noMarkers ? { _note: 'Paste an order message with labels like Customer:, Address:, Product x2, Paid…' } : {}),
  };
}
