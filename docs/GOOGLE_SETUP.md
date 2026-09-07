# Connecting this extension to Google Sheets (step by step)

Time: ~10 minutes. You need a Google account (free) and Chrome.

## 1. Create a Google Cloud project

1. Open <https://console.cloud.google.com> and sign in.
2. Click the project dropdown (top-left) → **New Project** →
   name it e.g. `order-label-manager` → **Create**.
3. Keep the new project selected.

## 2. Enable the APIs

1. Menu ☰ → **APIs & Services** → **Library**.
2. Search **Google Sheets API** → open → **Enable**.
3. Search **Google Drive API** → open → **Enable**.

## 3. OAuth consent screen

1. Menu ☰ → **APIs & Services** → **OAuth consent screen**.
2. User type: **External** → Create.
3. Fill in the app name (e.g. `Order Label Manager`) and your email.
   Add `https://docs.google.com` if asked for an authorized domain (not
   required for the redirect used here).
4. Save.
5. Optional but recommended: **Audience → Test users → Add users** — add your
   own Google account while testing (otherwise you'll see “app not verified”).

## 4. Create the OAuth Client ID (Chrome Extension type)

1. Menu ☰ → **APIs & Services** → **Credentials** → **Create Credentials** →
   **OAuth client ID**.
2. Application type: **Chrome Extension**.
3. **Item ID**: the ID of your loaded extension.
   Find it at `chrome://extensions` → enable **Developer mode** → click
   **Details** on *Order Label Manager* → the ID is shown under the name
   (a 32-character string like `abcdefghijklmnopqrstuvwxyzabcdef`).
4. For the redirect URI, Google may show:
   `https://<item-id>.chromiumapp.org/<path>` — set the **path** to
   `google-sheets`, i.e. the full URI is
   `https://abcdefghijklmnopqrstuvwxyzabcdef.chromiumapp.org/google-sheets`
5. **Create** and copy the **Client ID** (ends in
   `.apps.googleusercontent.com`).

> If the extension is re-loaded under a different ID later (e.g. you install
> it from a new ZIP on another machine), repeat this step with the new ID.
> Every installed copy of an unpacked extension can have a *different* ID.

## 5. Put the Client ID in the extension

Open `src/services/google/oauth.ts` and replace the demo value in
`oauthClientId()` with yours:

```ts
export function oauthClientId(): string {
  return (
    import.meta.env.VITE_GOOGLE_CLIENT_ID ||
    'REPLACE_WITH_YOUR_CLIENT_ID.apps.googleusercontent.com'
  );
}
```

Or build with your ID without editing code:

```bash
VITE_GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com npm run build
```

Then rebuild and re-`Load unpacked` the `dist/` folder.

## 6. Connect inside the extension

1. Open the extension → **Settings → Spreadsheet → Connect Google Account**.
2. Google shows the consent screen with the two scopes. Accept.
3. Choose **Spreadsheet** and **Worksheet** (tab). Create a brand-new blank
   spreadsheet if you want the extension to build the columns for you.
4. Done — the first save (or “Sync columns now” on Fields & Columns) writes
   the headers.

## 7. Existing spreadsheet?

It works. Connect it, then open **Fields & Columns**:

- existing headers are read from row 1 and shown,
- use **Auto Map** to match your fields to existing columns,
- only genuinely missing columns are added (at the end),
- data rows are never touched.

## Scope / data notes

The extension requests:

- `.../auth/spreadsheets` — read & append/update rows in the spreadsheets you
  choose,
- `.../auth/drive.readonly` — to list spreadsheet files so you can pick one.

It never reads other Drive files, never asks for Gmail/contacts/WhatsApp data,
and never sends your tokens anywhere except Google's token endpoint.
Tokens are stored in Chrome's own extension storage on your computer.

## Removing access later

- Inside the extension: Settings → Spreadsheet → Disconnect.
- Or revoke at <https://myaccount.google.com/permissions> (search
  “Order Label Manager”).
