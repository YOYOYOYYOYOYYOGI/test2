export const DEFAULT_SETTINGS = {
  businessName: 'My Business',
  logo: '',
  phone: '',
  address: '',
  website: '',
  gst: '',
  footer: '',
  orderPrefix: 'ORD-',
  nextNumber: 1001,
  labelSize: '4x6' as const,
  labelFields: null as string[] | null,
  labelExtras: { orderNumber: true, products: true, quantity: true, payment: true, amount: true, gst: false, barcode: true },
  clientId: '',
  sheetId: '',
  sheetName: '',
  customMap: {} as Record<string, string>,
};

export const FIELD_TYPES = [
  ['text', 'Text'],
  ['number', 'Number'],
  ['phone', 'Phone'],
  ['email', 'Email'],
  ['textarea', 'Textarea'],
  ['date', 'Date'],
  ['dropdown', 'Dropdown'],
  ['checkbox', 'Checkbox'],
] as const;

export const PAYMENT_STATUSES = ['Paid', 'COD', 'Pending', 'Failed'] as const;

export const SCOPES = 'https://www.googleapis.com/auth/spreadsheets';
