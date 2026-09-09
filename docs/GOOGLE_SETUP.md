# Connecting this extension to Google Sheets (step by step)

Time: ~10 minutes, once. You need a Google account (free) and Chrome.

The extension authenticates with Google through Chrome's official extension
flow (`chrome.identity`). For that to work, Google must know an **OAuth
Client ID of type “Chrome Extension”** whose **Item ID is the extension ID**
of *this* extension. The extension ID is stable — it is pinned by the
`"key"` in `manifest.json`, so it is the same on every computer and never
changes when you re-install from a ZIP.

## 1. Load the extension first and note its ID

1. Unzip the extension, then in Chrome go to `chrome://extensions`,
   enable **Developer mode** (top right) and press **Load unpacked**.
2. Select the unzipped folder.
3. On the *Order Label Manager* card press **Details** — the **ID** is the
   32-character string under the extension name
   (e.g. `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`). You can also read it inside the
   extension: **Settings → Spreadsheet → “Google OAuth setup”**.
   If you installed an older version of the extension before, remove it first
   and **restore your backup** after loading the new version (see below).

> ⚠️ v1.0.9 pins a stable extension ID for the first time. If you are
> updating from v1.0.8 or older, the ID changes — export a **Full Backup**
> (Settings → Backup & Restore) *before* removing the old version, then
> restore it after loading v1.0.9. Old versions without the pinned key could
> silently get a *different* ID per install folder/computer, which is exactly
> why Google kept rejecting the old OAuth client.

## 2. Create a Google Cloud project + enable the APIs

1. Open <https://console.cloud.google.com> and sign in.
2. Click the project dropdown (top-left) → **New Project** →
   name it e.g. `order-label-manager` → **Create**, keep it selected.
3. Menu ☰ → **APIs & Services** → **Library**:
   - search **Google Sheets API** → open → **Enable**
   - search **Google Drive API** → open → **Enable**
4. Menu ☰ → **APIs & Services** → **OAuth consent screen**:
   - User type **External**, fill app name + your email, Save.
   - (Optional, recommended while testing) **Audience → Test users →
     Add users** → add your own Google account.

## 3. Create the OAuth Client ID (Chrome Extension type)

1. Menu ☰ → **APIs & Services** → **Credentials** → **Create Credentials** →
   **OAuth client ID**.
2. Application type: **Chrome Extension**.
3. **Item ID**: paste the extension ID from step 1.
   (Chrome Extension clients use the extension ID itself — no redirect URIs
   need to be added.)
4. **Create** — copy the generated **Client ID** (it ends in
   `.apps.googleusercontent.com`). This is the only value the extension needs
   from Google.

## 4. Put the Client ID into the extension (one central spot)

The client ID is read from exactly one place:
`manifest.json` → `"oauth2"` → `"client_id"` in the extension folder.

1. Open the unzipped extension folder and edit `manifest.json` with any text
   editor (Notepad is fine).
2. Replace this line:

   ```json
   "client_id": "PASTE_YOUR_GOOGLE_CLIENT_ID_HERE",
   ```

   with your real Client ID, e.g.:

   ```json
   "client_id": "123456789012-abcdefghijklmnopqrstuvwxyz.apps.googleusercontent.com",
   ```

3. Save the file, then press the **Reload** button of the extension on
   `chrome://extensions`.
4. No rebuild or code edit is needed — `manifest.json` is the single
   configuration spot (Settings → Spreadsheet → “Google OAuth setup” shows
   the value it currently reads).

> Developers can also bake the ID at build time. The build reads the
> `"oauth2"` block from `public/manifest.json`, so edit that file (or have CI
> rewrite it) before `npm run build && npm run package`.

## 5. Connect inside the extension

1. Open the extension → **Settings → Spreadsheet** → status shows
   **Not Connected** → press **Connect Google Account**.
2. Chrome opens Google's official sign-in. Pick the account, review the
   requested permissions (spreadsheets, drive-readonly to list your
   spreadsheets, your email address) and accept.
3. The tab shows **Google Account Connected** and the spreadsheet list opens
   automatically → choose your spreadsheet (and worksheet), press
   **Use this spreadsheet**.
4. Done. New orders are appended as new rows; editing an order updates its
   own row. If you pick an existing spreadsheet its columns are reused — only
   missing columns are added, nothing is deleted.

## 6. Everyday notes

- **Tokens**: the extension stores **no tokens**. Chrome itself holds the
  access token and refreshes it automatically, so connections keep working
  across days and Chrome restarts without any re-login.
- **Connection expired**: if Google revokes the connection you will see
  “Google connection expired. Please reconnect your Google Account.” —
  reconnect once from Settings → Spreadsheet.
- **Disconnect** removes only the Google connection. Orders, products,
  custom fields, old customer data, labels, rules and settings are untouched.
- **Demo Mode** keeps working without Google (local sample sheet).
- Your spreadsheet itself is the primary copy of order rows; the extension
  keeps a local cache so it can work offline and sync later.
