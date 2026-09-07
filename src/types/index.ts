export type FieldType =
  | 'text'
  | 'number'
  | 'phone'
  | 'email'
  | 'textarea'
  | 'date'
  | 'dropdown'
  | 'checkbox';

export interface CustomField {
  id: string;
  name: string;
  type: FieldType;
  required: boolean;
  options?: string[]; // dropdown choices
  order: number;
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  price: number;
  active: boolean;
}

export interface OrderItem {
  productId: string;
  name: string;
  sku: string;
  price: number;
  qty: number;
}

export type PaymentStatus = 'Paid' | 'COD' | 'Pending' | 'Failed';

export interface Order {
  id: string;
  orderNumber: string;
  customerData: Record<string, string>; // custom field id -> value
  items: OrderItem[];
  paymentStatus: PaymentStatus;
  total: number;
  createdAt: string;
  updatedAt: string;
  labelPrinted: boolean;
  sheetRow?: number; // spreadsheet row, kept on edit so updates reuse the same row
}

export type LabelSize = '4x6' | 'a6';

export interface Settings {
  businessName: string;
  logo: string; // data URL
  phone: string;
  address: string;
  website: string;
  gst: string;
  footer: string;
  orderPrefix: string;
  nextNumber: number;
  labelSize: LabelSize;
  labelFields: string[] | null; // ids shown on the label; null = all fields (default)
  labelExtras: { orderNumber: boolean; products: boolean; quantity: boolean; payment: boolean; amount: boolean; gst: boolean; barcode: boolean };
  clientId: string; // Google OAuth Client ID (not a secret)
  sheetId: string;
  sheetName: string;
  customMap: Record<string, string>; // custom field id -> existing spreadsheet column
}
