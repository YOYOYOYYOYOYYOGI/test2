# Troubleshooting

## Google sign-in problems

| Symptom | Fix |
| --- | --- |
| “Sign-in was cancelled” immediately | The OAuth Client ID's *Item ID* must equal your extension ID (see GOOGLE_SETUP.md §4). Extension IDs change when you reload a folder from a different path or after a fresh unpack. |
| `error=redirect_uri_mismatch` in technical details | Registered redirect URI must be `https://<EXTENSION_ID>.chromiumapp.org/google-sheets` (exactly). |
| 403 `access_denied` when saving | Re-consent: Settings → Spreadsheet → Disconnect → Connect again. |
| 403 `userRateLimitExceeded` | Rare — retry in a minute. |
| “App not verified” | Normal for personal test apps. Continue → Advanced → proceed, or add your email under OAuth consent → Test users. |

## Sheet issues

| Symptom | Fix |
| --- | --- |
| “spreadsheet or worksheet not found” (404) | File deleted/moved or you lost edit rights → choose it again in Settings → Spreadsheet → Change spreadsheet. |
| Headers appear at row 5 | Row 1 must be the header row. The extension only looks at row 1; move your header there or use a fresh worksheet. |
| My old columns are not reused | Their names must match field names (case-insensitive). Use Auto Map on the Fields & Columns page to link them manually. |
| A column appears twice | Only possible if your sheet already had both names (e.g. `City` and `City 2`). The extension reuses the first exact match; you can remap fields to either in Fields & Columns. |

## Printing

- **Wrong size** → Print dialog: Destination = your label printer; *Paper size* =
  matching label (4×6 etc.); *Scale* = **100 / actual size**; *Margins* = None.
- **Two pages per label** → Order content taller than the label. Either use a
  larger label size (Settings → Label Design), or disable QR/business header
  for more room.
- **Nothing happens on Print** → allow pop-ups for this extension tab, or press
  the big **Print** button in the toolbar (auto-print may be blocked on
  macOS/iOS-style browsers — Chrome desktop usually allows it).
- **Colors/gray box** → printers in *color* mode may print the light gray
  preview pattern; the label itself is pure black & white. In the dialog,
  choose Black & White.
- **Label cut off on right** → printer margins: choose *borderless/margins
  none* for thermal printers, or select the next larger paper with margin.

## Sync / offline

- “Saved locally and will sync automatically” → the extension could not reach
  Google. It retries when the service worker wakes (new order, opening popup)
  and when you click **Sync Now** on the Orders page.
- Pending badge stays > 0 → check internet, then Settings → Spreadsheet shows
  the connection; press Sync Now. If it fails with auth errors, reconnect the
  account.

## Misc

- Where are my orders? → primary copy = your spreadsheet. The app keeps a local
  cache for speed (see Settings → Backup & Data → Export orders for a local
  JSON/CSV copy).
- Reset everything → Settings → Backup & Data → Reset. Local data only;
  spreadsheet untouched.
- Getting “Not running inside the Chrome extension” in the browser preview →
  normal: open the built `dist/` in Chrome, or use Demo Mode in the preview.
