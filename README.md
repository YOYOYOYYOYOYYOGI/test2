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
  icons/icon16|32|48|128.png
  assets/…
```

Load `dist/` in Chrome as described above. A ready-to-share ZIP is written to
`release/order-label-manager-v1.0.0.zip` and copied to the repository root.

---

## 4. Google Sheets setup (one time, ~10 minutes)

Step-by-step guide: **[docs/GOOGLE_SETUP.md](docs/GOOGLE_SETUP.md)** — the
in-app helper at **Settings → Spreadsheet → “Google OAuth setup”** shows your
exact extension ID and the current client-id status.

Summary:

1. Load the extension, copy its **ID** (`chrome://extensions` → Details, or
   the OAuth setup box). The ID is pinned by the `"key"` in `manifest.json`,
   so it never changes between rebuilds, folders or computers.
2. https://console.cloud.google.com → create/select a project and enable
   **Google Sheets API** and **Google Drive API**; finish the OAuth consent
   screen (add your email as a test user).
3. **Credentials → Create OAuth Client ID** → application type
   **Chrome Extension** → **Item ID** = your extension ID → Create.
4. Copy the generated **Client ID** and paste it into the ONE central
   configuration spot: `manifest.json` → `"oauth2"` → `"client_id"` in the
   extension folder, then press **Reload** on `chrome://extensions`
   (no rebuild, no code edits).
5. **Settings → Spreadsheet → Connect Google Account** → pick your account →
   **Google Account Connected** → choose spreadsheet + worksheet.

Scopes requested (only what the extension uses):
- `spreadsheets` — read/write the selected spreadsheet
- `drive.readonly` — list spreadsheets to pick one
- `userinfo.email` — show which account is connected

### Why no client secret, and where do tokens live?

Authentication goes through Chrome's official extension mechanism
(`chrome.identity.getAuthToken` with the manifest `"oauth2"` section).
Chrome holds the access token in its own identity cache and **refreshes it
automatically**, so the extension never stores tokens (no `client_secret`, no
refresh tokens, nothing sensitive persisted). Expired or revoked connections
surface as “Google connection expired. Please reconnect your Google Account.”
— reconnect once from Settings → Spreadsheet; orders stay safe locally and
sync afterwards. Disconnect removes only the Google connection.

---

## 5. Permissions & privacy

The manifest asks for the **minimum** permissions:

| Permission | Why |
| --- | --- |
| `storage` | local cache/offline queue + settings |
| `identity` | Google OAuth sign-in (`chrome.identity` manages the consent window and token cache) |
| `unlimitedStorage` | grow the local order cache beyond Chrome's 10 MB default |
| host: `www.googleapis.com`, `oauth2.googleapis.com` | Sheets/Drive API calls + account-email lookup |

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
  (payment status, **payment method**, order status, **date: Today /
  Yesterday / Last 7 days / Last 30 days / Custom** — filters combine), pagination,
  row actions
- **Download Filtered Orders** — exports exactly the rows currently visible
  after the filters + search (`orders-filtered-YYYY-MM-DD.xlsx`), alongside
  Download Today's Orders / Download All Orders
- Order details: view/edit/duplicate/delete, spreadsheet-row info, and a
  **Subtotal / Delivery / Grand Total** breakdown
- **Delivery charge rules** (Settings → Delivery): build your own rules —
  e.g. *State = Gujarat AND Order Amount < ₹600 → charge ₹100*, *State ≠
  Gujarat AND Amount < ₹1000 → ₹150* — on State/City/Pincode/amount/any
  configured field, with Equals / Not equals / Greater than / Less than /
  Contains; rules run top-to-bottom (**first match wins**, Move Up/Down),
  fallback to the **default charge**; charge previews live on the New Order
  form and is stored with the order, shown in order details, on the label
  (Subtotal/Delivery/Total), in Excel downloads and in the spreadsheet's new
  **Delivery Charge** / **Total** columns
- **Duplicate / Matching rules** (Settings → Duplicates): pick any field
  (Transaction ID, phone, email, any custom field) + Exact / Case-insensitive
  / Contains comparison, enable per rule; saving an order whose value already
  exists shows *“Matching <Field> found — TXN… already exists in Order
  ORD-1001”* with **View Existing Order** / **Continue Anyway** (duplicates
  are never created silently)
- Reliable auto order numbers: next number = persisted counter AND past every
  existing order (imported/manual/deleted orders can never cause a repeated
  number); the counter survives closing Chrome, changes with your
  prefix/starting number, and increments only after a successful save
- Dashboard: **date filter (Today default / Tomorrow / Yesterday / Last 7 days /
  Last 30 days / Custom date / Custom range)** drives Total Orders, Total Sales,
  Paid / COD / Pending counts and a **Product Sales** table (Qty sold, order
  count, sales amount per product) — all recalculated instantly from the same
  order store, no refresh/Apply needed; quick actions, recent orders
- Products page: **drag ≡ or ↑/↓ to set the product order** (persisted — used
  by the picker, New Order screen, Excel columns, sheet product columns and
  dashboard Product Sales), **editable Label Name** per product (separate from
  the product name, shown on customer labels; historical orders keep the info
  saved with them)
- **Old Customer Data** (Settings → Old Data): import an old customer/order
  **Excel (.xlsx) or CSV** file — required columns Order Number, Name,
  Address, Whatsapp Number, plus an optional separate **Mobile Number**
  column (blank stays blank — never copied from WhatsApp). Clear “Required
  column missing: …” errors, empty rows skipped, extra columns kept.
  **Two-step import**: pick the file → normalized preview (order numbers
  shown as `3542`, never `3542.0`; phones as `8347034843`, never
  `8.347034843E9`) → confirm Import. Identifiers are always stored as
  STRINGS — scientific notation and `.0` suffixes are converted back
  (8.347034843E9 → 8347034843) before saving; mobile numbers keep their
  text formatting (`91234 56780`) and are stored separately from WhatsApp
- New Order page: typing a WhatsApp number debounce-searches a pre-built
  index covering the imported history **and** current orders created from it
  (the order chain), showing **all** matching orders (with name, address,
  WhatsApp and Mobile), newest first — pick the exact one to use as the
  immediate previous order (e.g. selecting `14000-4673-4312-3542` produces
  `14001-14000-4673-4312-3542` next time, not the original
  `4673-4312-3542`). **Chain rule**: the picked order normally becomes the
  parent as-is; when an *imported* record's own base equals the current auto
  number (e.g. `14031-12772-10086-8491-7489` while the counter shows 14031)
  only its previous-order portion is reused (`12772-10086-8491-7489`), so
  the new number reconstructs `14031-12772-10086-8491-7489` instead of
  doubling the base. Name/WhatsApp/Mobile/Address/City/State/Pincode/custom
  fields autofill but stay fully editable — historical orders are never
  modified; the auto counter keeps counting (14000, 14001, 14002…) and the
  **Previous Order** value stays visible, editable and removable
  (Previous Order Number column in the spreadsheet & Excel), unknown numbers
  just show “No previous order found.” — never an error
- **Full Backup & Restore** (Settings → Backup & Restore): export one file —
  `order-manager-backup-YYYY-MM-DD.json` (`backupVersion: 1`) — containing
  every order (order numbers, previous order numbers, customer details incl.
  WhatsApp & Mobile, custom fields, payment, delivery, status), imported
  historical old data, products, field configuration, delivery & matching
  rules, order-number state and all settings (label design incl. the logo
  data URL). Import Backup validates the file (invalid files are rejected
  with a friendly message and never change data), then **Restore Backup**
  asks for explicit confirmation before replacing the local data and
  refreshing the UI — move it to another computer and everything is back
- **Products → Export Products** (`products-YYYY-MM-DD.xlsx`): the product
  master only (Product ID / Name / SKU / Price / Label Name / Status /
  Position / Created At) in a real `.xlsx` with frozen headers — take it to
  another computer and re-import there
- **Products → Import Products**: pick a `.xlsx`/CSV and review a preview
  (Products Found / New / Existing to Update / Duplicates) before confirming.
  Products match by **SKU → Product ID → Name** (case/space-insensitive) and
  are **updated in place — never duplicated** (importing “Night Cream,
  NC001, 550” updates the existing product); internal IDs and catalogue
  order are preserved, so existing orders keep working. Optional cells that
  the file lacks never erase current values; new rows append at the end and
  reuse the file's Product ID only when it is free. Re-importing an exported
  file changes nothing (idempotent)
- Orders → **Export Orders + Products** (`orders-products-YYYY-MM-DD.xlsx`):
  one workbook, three sheets — **Orders** (every order field incl. custom
  fields + Label Status / Printed At / Created At / Updated At), **Products**
  (product master) and **Order Items** (Order Number / Product ID / Product
  Name / SKU / Quantity / Price / Subtotal per line). Phone numbers and
  order numbers are text (never `8.34E9` or `14031.0`); quantities are
  numbers
- Orders → **Import Orders + Products**: preview counts (Orders Found /
  Products Found / Order Items Found; New vs Existing Orders and Products)
  then confirm. Orders match by **Order Number** — existing ones are updated,
  never duplicated (a file can never create two `14031`s), and local orders
  not in the file are never deleted. Order lines reconnect via the file's
  Product ID → SKU → Name, but each line carries its own historical snapshot
  (name/SKU/qty/price at order time), so later product renames or price
  edits never rewrite old orders; products missing from the catalogue stay
  readable as ghost lines. Re-importing an unchanged file is a no-op
- Orders → Excel: **Download Today's Orders** (`orders-YYYY-MM-DD.xlsx`),
  **Download Filtered Orders** and **Download All Orders** (`all-orders.xlsx`)
  — real `.xlsx` files with bold headers, frozen header row, auto-sized
  columns, dynamic columns from your configured fields + one `<Product> Qty`
  column per product (zero-filled), one order per row
- Per-order **Download Label** → real one-page PDF (`ORD-1001-label.pdf`) at the
  exact configured label size — same single renderer as preview & print
- **Label Design**: upload logo (persisted in settings — appears in preview,
  print and PDF), show/hide logo, logo width; font family (Inter/Arial/
  Helvetica/Roboto/sans-serif); global font size; per-part sizes for business
  name, order number, customer, details, address, products, payment, total and
  footer; live preview in Settings reflects every change instantly
- Labels: 4×6″, A6, 100×150 mm, A4, custom mm; business header, logo, order
  bar, customer, ship-to, **products with Qty**, payment strip, notes,
  QR (order+customer+phone) and CODE128 barcode, footer text, field checkboxes
- Print: dedicated print page with `@page` sizing, page-breaks per label,
  auto print dialog, auto-close after print
- Print status tracking: Not Printed / Printed + Printed At (syncs back to the
  sheet); “Print New Orders” marks orders as printed
- Download Label saves any order's label as a PDF; Excel downloads use the
  cached order data (mirror of the spreadsheet) — fast, no sheet re-download
- Settings: business info + logo upload, spreadsheet reconnect/change,
  order numbering (prefix/start/padding, manual override), label design,
  export orders CSV/JSON, export/import settings, reset
- Offline queue: orders saved locally with a friendly notice, auto-sync when
  the background worker sees the connection again (or press **Sync Now**)
- Error handling with friendly messages + “technical details” disclosure

## 8. Troubleshooting

- **“Google OAuth is not configured yet”** → the Client ID is still the
  placeholder in `manifest.json → "oauth2" → "client_id"`. Do the one-time
  console setup (§4 / docs/GOOGLE_SETUP.md) and paste your Client ID there,
  then reload the extension.
- **“Google connection expired. Please reconnect…”** → the grant was revoked
  or Chrome cannot refresh it silently → **Settings → Spreadsheet →
  Connect Google Account** again (orders saved meanwhile are kept locally and
  sync after reconnecting).
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
| Google Sheets sync | your own Google Cloud OAuth Client ID (Chrome Extension type, Item ID = this extension's pinned ID) | `manifest.json` → `oauth2` → `client_id` (single spot) |
| Chrome Web Store publishing | developer account ($5 once) | store listing |
| Everything else (incl. Demo Mode) | none | — |

## 10. License

Provided as-is for the business owner's use. Built with React, TypeScript,
Vite, Zustand, JsBarcode, qrcode and Inter (fonts).
