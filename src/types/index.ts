// ---------------------------------------------------------------------------
// Core domain types shared by the UI, background service worker, and print page
// ---------------------------------------------------------------------------

export type FieldType =
  | 'text'
  | 'number'
  | 'phone'
  | 'email'
  | 'textarea'
  | 'date'
  | 'dropdown'
  | 'checkbox'
  | 'radio'
  | 'currency'
  | 'product'
  | 'quantity'
  | 'paymentStatus'
  | 'orderStatus';

/** How a field's value flows into the spreadsheet row */
export type FieldValueKind =
  | 'orderNumber'
  | 'customerName'
  | 'customerWhatsapp'
  | 'customerMobile'
  | 'customerAddress'
  | 'customerCity'
  | 'customerState'
  | 'customerPincode'
  | 'paymentStatus'
  | 'paymentMethod'
  | 'paymentAmount'
  | 'transactionId'
  | 'orderStatus'
  | 'productsSummary'
  | 'quantity'
  | 'totalAmount'
  | 'createdAt'
  | 'updatedAt'
  | 'notes'
  | 'custom';

export interface FieldOption {
  id: string;
  label: string;
}

export interface OrderField {
  id: string;
  /** Display name — also the default spreadsheet column header */
  name: string;
  type: FieldType;
  required: boolean;
  /** Internal key used to bind the field to order data */
  key: FieldValueKind | string;
  /** Options for dropdown / radio fields */
  options?: FieldOption[];
  /** Column header in the spreadsheet (persisted across renames) */
  columnHeader?: string;
  /** Sort position */
  order: number;
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  price: number;
  labelName?: string;
  active: boolean;
  createdAt: number;
}

export interface CustomerData {
  name: string;
  whatsapp: string;
  mobile: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
}

/** A record imported from an old customer/order sheet. Kept SEPARATE from
 *  new orders — used only for WhatsApp lookup + autofill on the New Order
 *  page. Never counted in dashboard sales/orders or Excel exports. */
export interface OldOrderRecord {
  id: string;
  /** old order number as imported (e.g. "4673-4312-3542") — unique per row */
  orderNumber: string;
  name: string;
  address: string;
  /** raw whatsapp/mobile as imported */
  whatsapp: string;
  /** separate Mobile Number column, stored as TEXT (never WhatsApp's value;
   *  blank when the row/file has no mobile). Optional — see normalizePhoneText. */
  mobile?: string;
  /** extra columns (header -> value) for autofill when they match fields */
  extras?: Record<string, string>;
  /** source row in the uploaded file (1-based, header = 1) */
  sourceRow: number;
  importedAt: number;
}

export interface OrderProduct {
  productId: string;
  productName: string;
  sku?: string;
  quantity: number;
  price: number;
  labelName?: string;
}

export type PaymentStatusValue = 'Paid' | 'COD' | 'Pending' | 'Failed' | 'Refunded';
export type PaymentMethodValue = 'UPI' | 'Cash' | 'Bank Transfer' | 'Card' | 'COD' | 'Other';
export type OrderStatusValue =
  | 'New'
  | 'Confirmed'
  | 'Processing'
  | 'Packed'
  | 'Shipped'
  | 'Delivered'
  | 'Cancelled'
  | 'Returned';
export type PrintedStatusValue = 'Not Printed' | 'Printed';

export type CompareOp = 'equals' | 'notEquals' | 'greaterThan' | 'lessThan' | 'contains';

/** One condition inside a delivery-charge rule (ANDed with the others). */
export interface DeliveryCondition {
  id: string;
  /** Field id from the field config, or '__amount' for the order subtotal */
  field: string;
  op: CompareOp;
  value: string;
}

/** A delivery-charge rule. Array order = priority (first match wins). */
export interface DeliveryRule {
  id: string;
  conditions: DeliveryCondition[];
  charge: number;
}

export interface DeliveryConfig {
  /** Used when no rule matches */
  defaultCharge: number;
  rules: DeliveryRule[];
}

export type MatchMode = 'exact' | 'insensitive' | 'contains';

/** Duplicate/matching rule: warn when a new order's value for `fieldId`
 *  matches an existing order's value for the same field. */
export interface MatchingRule {
  id: string;
  fieldId: string;
  mode: MatchMode;
  enabled: boolean;
}

export interface MatchingConfig {
  rules: MatchingRule[];
}

export interface Order {
  id: string;
  orderNumber: string;
  customer: CustomerData;
  /** Keyed by product id for fast spreadsheet lookup; kept in insertion order */
  products: Record<string, OrderProduct>;
  paymentStatus: PaymentStatusValue;
  paymentMethod: PaymentMethodValue;
  transactionId: string;
  paymentAmount: string;
  orderStatus: OrderStatusValue;
  notes: string;
  totalAmount: number;
  /** delivery charge included in totalAmount (0 when not configured) */
  deliveryCharge?: number;
  /** old order number this new order was created from (e.g. 4673-4312-3542),
   *  visible separately from the composed new order number */
  previousOrderNumber?: string;
  /** informational reference only — the latest existing SIMPLE numeric order
   *  number below this order's number (e.g. 14999 for 15000). Never used in
   *  the order number itself, never linked, never chained. */
  previousSequenceOrderNumber?: string;
  printed: PrintedStatusValue;
  printedAt: number | null;
  createdAt: number;
  updatedAt: number;
  /** Custom field values by field id (for user-defined fields) */
  customFields?: Record<string, string | number | boolean>;
  /** Set when the row was synced to the spreadsheet */
  spreadsheetRow?: number;
  syncedAt?: number | null;
  /** Pending orders are queued for offline sync */
  pendingSync?: boolean;
}

export interface SpreadsheetConnection {
  accessToken: string;
  /** Decoded from the token payload so pages can call the API directly */
  email?: string;
  tokenExpiresAt?: number;
  refreshToken: string;
  refreshExpiresAt?: number | null;
  /** Spreadsheet id + names captured at connect time for offline display */
  spreadsheetId: string;
  spreadsheetName: string;
  worksheetName: string;
  connectedAt: number;
  viaOfflineGrant?: boolean;
}

export type ProviderKind = 'google' | 'excel' | 'demo';

export type LabelSizeId = '4x6' | 'a6' | 'a4' | '100x150' | 'custom';

export interface LabelSize {
  id: LabelSizeId;
  label: string;
  /** Width x height in millimetres (portrait orientation) */
  widthMm: number;
  heightMm: number;
}

export interface LabelFieldChoice {
  id: string;
  /** Bound field id, or a reserved key like 'label.orderNumber' */
  key: string;
  label: string;
}

export type LabelFontKey =
  | 'businessName'
  | 'orderNumber'
  | 'customerName'
  | 'customerDetails'
  | 'address'
  | 'productName'
  | 'productQty'
  | 'payment'
  | 'amount'
  | 'footer';

export interface LabelConfig {
  sizeId: LabelSizeId;
  widthMm: number;
  heightMm: number;
  showBusinessHeader: boolean;
  showCustomer: boolean;
  showAddress: boolean;
  showProducts: boolean;
  showPayment: boolean;
  showOrderNumber: boolean;
  showQrCode: boolean;
  showBarcode: boolean;
  showFooter: boolean;
  footerText: string;
  /** show the uploaded business logo on the label */
  showLogo?: boolean;
  /** logo width on the label, px (height auto-keeps aspect ratio) */
  logoWidth?: number;
  /** font family: Inter | Arial | Helvetica | Roboto | sans-serif */
  fontFamily?: string;
  /** global base font size in px */
  fontSize?: number;
  /** optional per-part overrides of the global font size */
  fontSizes?: Partial<Record<LabelFontKey, number>>;
}

export interface Settings {
  business: {
    name: string;
    phone: string;
    whatsapp: string;
    email: string;
    address: string;
    gst: string;
    website: string;
    logoDataUrl: string;
  };
  spreadsheet: {
    provider: ProviderKind;
    connected: boolean;
    connection: SpreadsheetConnection | null;
    /** column letter of the last appended row (1-based row index) */
    lastRow?: number;
    /** cached header map columnName -> column index, refreshed lazily */
    headers?: Record<string, number>;
  };
  order: {
    /** order numbers are always typed manually by the user — there is no
     *  automatic generator, counter, prefix or start number */
    defaultPaymentStatus: PaymentStatusValue;
    defaultOrderStatus: OrderStatusValue;
  };
  products: {
    /** list of product ids currently placed in the spreadsheet (as "<name> Qty") */
    included?: string[];
  };
  labels: LabelConfig;
  /** ids of bound fields shown on the label */
  labelFields: string[];
  /** mapping engine: bound field id / product id -> spreadsheet column name */
  mappings: Record<string, string>;
  /** ids of bound fields that are written to the spreadsheet */
  includedFields: string[];
  /** delivery-charge rules (first matching rule wins, else defaultCharge) */
  delivery: DeliveryConfig;
  /** duplicate/matching rules checked before an order is saved */
  matching: MatchingConfig;
  /** when 0/false: no auto print-status update */
  printUpdatesStatus: boolean;
  demoMode: boolean;
  clipboardParsing: boolean;
}

export type OrderSort = 'newest' | 'oldest' | 'orderNumber';

export interface Toast {
  id: number;
  kind: 'success' | 'error' | 'info' | 'loading';
  title: string;
  message?: string;
  technical?: string;
  actions?: { label: string; kind?: 'primary' | 'secondary' | 'danger'; onClick: () => void }[];
}

export type SaveResult =
  | { ok: true; created: 'new' | 'duplicate'; order: Order; synced: boolean; row?: number }
  | { ok: false; error: string; technical?: string; code?: string };
