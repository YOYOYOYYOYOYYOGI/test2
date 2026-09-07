# Order Label Manager — WhatsApp Orders → Google Sheets → Print Labels

A complete **Chrome extension (Manifest V3)** for small businesses that receive
orders on WhatsApp. Enter a customer order once and the extension:

1. validates the order (phone, pincode, required fields, duplicates),
2. appends it as **one new row** in your **Google Sheets** spreadsheet
   (creating only the *missing* columns once, never duplicating them),
3. keeps a local cache for speed and offline resilience,
4. generates a **printable shipping label** with products & quantities,
   payment status, QR code / barcode, at true physical size,
5. prints through Chrome's normal print dialog.

The admin configures **fields once** — fields become spreadsheet columns, every
order becomes a new row.

---

## 1. Quick start (end user)

1. **Build** the extension (see [Build](#3-build)) or download the ZIP from the
   *release* folder of your build.
2. Open Chrome → `chrome://extensions`.
3. Toggle **Developer mode** (top right).
4. Click **Load unpacked** → select the `dist/` folder (or unzip and select it).
5. Click the extension icon → **Open Full App**.
6. Follow the **setup wizard**:
   - Welcome → Get Started
   - Connect Spreadsheet → **Connect Google Account** → choose your
     spreadsheet + worksheet (or press **Start Demo Mode** to try everything
     with sample data on your computer)
   - Order Fields → adjust the starter template (drag to reorder, edit types,
     mark required)
   - Products → add the products you sell
7. You land on the dashboard. Click **+ New Order**, fill in the customer,
   add products, press **Save Order** → **Print & Mark as Printed**.

Estimated time for one order: ~30–60 seconds.

### Popup vs full app

- The **popup** (extension icon) gives quick access: *New Order*, *Search*,
  *Recent orders*, *Open Full App*.
- The **full app** opens in a normal Chrome tab — recommended for entering
  many orders.

---

## 2. Development

```bash
npm install
npm run dev        # Vite dev server (UI-only preview; Google sign-in needs Chrome)
npm run typecheck  # TypeScript check
npm test           # unit/integration tests (vitest)
```

> Running `npm run dev` and opening http://localhost:5173 in a plain browser
> works for the UI and **Demo Mode**, but Google sign-in requires the actual
> extension (chrome.identity). Load the built `dist/` in Chrome for the full
> OAuth flow.

### Project layout

```
src/
  app/            full-page React app (router, shell, pages incl. setup wizard)
  background/     MV3 service worker (OAuth + Sheets API + offline sync)
  components/     UI kit, icons, field builder, product editor, labels
  lib/            constants, validation, WhatsApp clipboard parser
  print/          print.html page (label print jobs)
  popup/          extension popup
  services/       storage, orders, config, messaging,
                  spreadsheet engine + providers (google / demo),
                  google oauth + driver
  store/          Zustand stores (app state + toasts)
  styles/         design system + print CSS
  types/          domain types
public/
  manifest.json   MV3 manifest
  icons/          extension icons (16/32/48/128/256)
tests/            vitest suite
scripts/          make-icons, postbuild, package (zip)
```

---

## 3. Build

```bash
npm run build      # typecheck + vite UI build + background build + postbuild
npm run package    # npm run build + zip → release/order-label-manager-v1.0.0.zip
```

The production extension is the **`dist/`** folder:

```
dist/
  manifest.json
  background.js
  index.html      (full app)
  popup.html      (quick popup)
  print.html      (print jobs)
  auth-redirect.html
  icons/icon16|32|48|128.png
  assets/…
```

Load `dist/` in Chrome as described above. A ready-to-share ZIP is written to
`release/order-label-manager-v1.0.0.zip` and copied to the repository root.

---

## 4. Google Sheets setup (one time, ~10 minutes)

Full illustrated walk-through: **[docs/GOOGLE_SETUP.md](docs/GOOGLE_SETUP.md)**

Summary:

1. Go to https://console.cloud.google.com → create/select a project.
2. **APIs & Services → Enable**: `Google Sheets API` and `Google Drive API`.
3. **OAuth consent screen** → External → add your email as a test user.
   Scopes requested by this extension:
   - `https://www.googleapis.com/auth/spreadsheets` (read & write order rows)
   - `https://www.googleapis.com/auth/drive.readonly` (list your spreadsheets)
4. **Credentials → Create OAuth Client ID** → type **Chrome Extension**.
5. **Item ID** = the ID of your loaded extension (find it on
   `chrome://extensions` → *Details*, e.g. `abcdefghijklmnopqrstuvwxyzabcdef`).
6. Authorized redirect URI:
   `https://<YOUR-EXTENSION-ID>.chromiumapp.org/google-sheets`
7. Copy the **Client ID** into `src/services/google/oauth.ts`
   (`oauthClientId()`) — or set `VITE_GOOGLE_CLIENT_ID` when building.

> ⚠️ The extension ships with a **sample/demo client ID** so the code is
> self-contained. Google will reject sign-in attempts with that demo ID until
> you configure your own. Demo Mode does not need Google at all.
>
> If you change the extension ID later, update the OAuth client's Item ID and
> redirect URI, then rebuild.

### Why no client secret?

The extension uses the *public* OAuth client flow with Chrome's
`chrome.identity.launchWebAuthFlow`. The “secret” for that flow is the
extension ID, embedded in the fixed redirect URI
`https://<extension-id>.chromiumapp.org/…`. The token exchange happens from the
extension's own origin, and access/refresh tokens live only in
`chrome.storage.local`. Nothing is hard-coded into the front-end except the
public client ID.

---

## 5. Permissions & privacy

The manifest asks for the **minimum** permissions:

| Permission | Why |
| --- | --- |
| `storage` | local cache/offline queue + settings |
| `identity` | Google OAuth sign-in |
| `unlimitedStorage` | grow the local order cache beyond Chrome's 10 MB default |
| host: `accounts.google.com`, `www.googleapis.com`, `*.chromiumapp.org` | OAuth + Sheets API calls |

No content scripts, no access to your WhatsApp web page, no tracking, no
third-party servers. Spreadsheet data goes directly between your computer and
Google's APIs.

---

## 6. Using the spreadsheet

- **First row = header row** (column names). Existing spreadsheets with data
  are detected and **reused** — nothing is overwritten or deleted.
- On the **Fields & Columns** page you see the live mapping
  (application field → spreadsheet column), an **Auto Map** helper, and a
  “columns to create” preview.
- Columns are created lazily (before the first save or on “Sync columns now”),
  appended after the last header, and **only if missing**.
- Product quantity columns follow the pattern **`<Product> Qty`**
  (e.g. `Night Cream Qty`). Products not in an order are written as `0`.
- System columns: `Total`, `Label Status`, `Printed At`, `Created At`,
  `Updated At`.
- Each new order = one new row under the header. Editing an order updates its
  **existing row** in place.
- Deleting an order in the app never deletes the spreadsheet row (the sheet is
  the source of truth; use it if you must undo).

### Examples

Configured fields:

```
Order Number | Customer Name | WhatsApp Number | Mobile Number | Address | City | State | Pincode
```

After enabling products Night Cream & Face Serum + saving orders:

| Order Number | Customer Name | WhatsApp Number | Address   | Night Cream Qty | Face Serum Qty | Total | Payment Status | … |
| --- | --- | --- | --- | ---: | ---: | ---: | --- | --- |
| ORD-1001 | Rahul Patel | 9876543210 | 123 Main Road, Ahmedabad | 2 | 0 | 998 | Paid | … |
| ORD-1002 | Priya Shah  | 9988776655 | … | 0 | 1 | 699 | COD | … |

(Extra columns are removed from this illustration.)

---

## 7. Feature list

- Setup wizard (welcome → connect → fields → products → done)
- Google Sheets OAuth2 (connect/switch/disconnect) & provider interface ready
  for Excel/OneDrive later
- Demo mode with sample products/orders (works fully offline, in the browser
  preview too)
- Field builder: add/edit/delete/reorder (drag & drop), required toggle, types
  — text, number, phone, email, textarea, date, dropdown, checkbox, radio,
  currency, product, quantity, payment status, order status
- Products: name, SKU, price, label name, active flag, optional qty column per
  product
- New order screen designed for speed (auto next number, product picker with
  steppers, total, clipboard import)
- WhatsApp clipboard parser (Customer/Phone/Product xN/Paid …) — optional
- Duplicate-order protection (View / Edit existing / Create anyway)
- Validation with inline errors (10-digit phones, pincodes, emails, quantities,
  amounts)
- Orders page: search (order no./customer/phone/pincode/product), filters
  (payment, order status, date incl. custom), pagination, row actions
- Order details: view/edit/duplicate/delete, spreadsheet-row info
- Dashboard: today/paid/COD/pending/labels-pending/total-sales cards,
  quick actions, recent orders
- Orders → Excel: **Download Today's Orders** (`orders-YYYY-MM-DD.xlsx`) and
  **Download All Orders** (`all-orders.xlsx`) — real `.xlsx` files with bold
  headers, frozen header row, auto-sized columns, dynamic columns from your
  configured fields + one `<Product> Qty` column per product, one order per row
- Per-order **Download Label** (PNG image of the exact label)
- Labels: 4×6″, A6, 100×150 mm, A4, custom mm; business header, logo, order
  bar, customer, ship-to, **products with Qty**, payment strip, notes,
  QR (order+customer+phone) and CODE128 barcode, footer text, field checkboxes
- Print: dedicated print page with `@page` sizing, page-breaks per label,
  auto print dialog, auto-close after print
- Print status tracking: Not Printed / Printed + Printed At (syncs back to the
  sheet); “Print New Orders” marks orders as printed
- Download Label saves any order's label as a PNG; Excel downloads use the
  cached order data (mirror of the spreadsheet) — fast, no sheet re-download
- Settings: business info + logo upload, spreadsheet reconnect/change,
  order numbering (prefix/start/padding, manual override), label design,
  export orders CSV/JSON, export/import settings, reset
- Offline queue: orders saved locally with a friendly notice, auto-sync when
  the background worker sees the connection again (or press **Sync Now**)
- Error handling with friendly messages + “technical details” disclosure

## 8. Troubleshooting

- **“Google sign-in was cancelled / no response”** → check
  chrome://extensions → your extension → *Errors*; confirm the OAuth client
  Item ID + redirect URI exactly match your extension ID (see §4).
- **403/401 on save** → token expired or scope missing → click **Settings →
  Spreadsheet → Disconnect**, then Connect again (grants refresh token).
- **“Spreadsheet not found”** → the file was renamed/moved to a different
  Drive, or you don't have edit rights. Choose the file again.
- **Print sizes look off** → in the print dialog choose *Actual size / 100%*,
  *Margins: None*, and your label media type; disable “fit to page”.
- **Label prints on 2 pages** → the order has more lines than the label size;
  use a larger size (Settings → Label Design) or enable the QR side-by-side
  layout.
- **Offline order never syncs** → after internet returns, the extension
  retries on next order save / popup open / **Sync Now** button.
- More: [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)

## 9. What needs external credentials

| Feature | Required | Where |
| --- | --- | --- |
| Google Sheets sync | your own Google Cloud OAuth Client ID (Chrome Extension type) | `oauth.ts` / `VITE_GOOGLE_CLIENT_ID` |
| Chrome Web Store publishing | developer account ($5 once) | store listing |
| Everything else (incl. Demo Mode) | none | — |

## 10. License

Provided as-is for the business owner's use. Built with React, TypeScript,
Vite, Zustand, JsBarcode, qrcode and Inter (fonts).
