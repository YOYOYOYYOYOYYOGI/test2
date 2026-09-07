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

export interface OrderNumberConfig {
  enabled: boolean;
  /** prefix e.g. ORD- */
  prefix: string;
  /** first order counter, e.g. 1001 */
  start: number;
  /** width of zero padding applied to the counter (0 = none) */
  padding: number;
  /** true = admin types the order number; false = generate automatically */
  manual: boolean;
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
    prefix: string;
    startNumber: number;
    padding: number;
    autoNumber: boolean;
    /** 0 = manual entry */
    defaultPaymentStatus: PaymentStatusValue;
    defaultOrderStatus: OrderStatusValue;
    manualNumbering: boolean;
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

export interface AuthState {
  status: 'signedOut' | 'connecting' | 'signedIn' | 'error';
  email: string | null;
  error: string | null;
  consent: string | null;
  tokenExpiresAt: number | null;
}

export type SaveResult =
  | { ok: true; created: 'new' | 'duplicate'; order: Order; synced: boolean; row?: number }
  | { ok: false; error: string; technical?: string; code?: string };
