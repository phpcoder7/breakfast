# Breakfast Check-in System

Offline breakfast check-in application for hotel restaurant hosts. The system loads the two daily Oracle OPERA XML reports, merges the guest data, supports fast room lookup, records breakfast check-ins, maintains a live payment queue, and exports Excel reports without any backend.

## Daily workflow

1. Open `index.html` in a modern browser such as Chrome or Edge.
2. Sign in with your station username and password.
3. Load the daily `Meal Plan XML`.
3. Load the daily `Package Forecast XML`.
4. Search by room number, guest name, or confirmation number.
5. Press `Enter` to open the guest record.
6. Enter table number and press `Enter` again to complete check-in.
7. Use `Walk-In Guest` or `Apartment Guest` for non-hotel breakfast visitors.
8. Export the operational and accounting reports when needed.

## Login accounts

- `KCA` / `KCAadmin`
- `KTB` / `KTBadmin`

Login is stored for the current browser session only. Use `Logout` to sign out.

## Keyboard shortcuts

- Type in the search field to filter instantly.
- `Enter` on the search field opens the highlighted result.
- `Arrow Up` / `Arrow Down` moves through search results.
- `Enter` on the table number completes check-in.
- `Escape` closes an open modal and returns focus to search.

## Operational rules

- `RO` is treated as payment required.
- Known breakfast package codes are marked as breakfast included.
- Unknown package codes are flagged with a yellow warning.
- Duplicate room check-ins require confirmation.
- Breakfast entitlement overruns require confirmation.
- Payment list includes hotel guests without breakfast, walk-ins, apartment guests, and unknown-package cases.

## New Day

Use the `New Day` button at the start of breakfast service when you want to clear today's check-ins, payment list, and unload both XML files. You must load fresh Meal Plan and Package Forecast reports for the new day.

## Offline requirements

- `index.html` works offline when opened directly from the folder.
- The browser loads `js/app.bundle.js` (single bundled script) because ES module imports are blocked on `file://` pages.
- SheetJS is bundled locally in `vendor/xlsx.full.min.js`.
- Font Awesome assets are bundled locally in `vendor/fontawesome/`.

If you edit files inside `js/`, rebuild the bundle with:

```bash
npx esbuild js/app.js --bundle --format=iife --loader:.txt=text --outfile=js/app.bundle.js
```

## GitHub Pages

This project is ready for GitHub Pages. The site is static and works from the repository root.

### First-time setup

1. Create a new GitHub repository, for example `breakfast-checkin`.
2. In the project folder, run:

```bash
git init
git add .
git commit -m "Initial breakfast check-in system"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/breakfast-checkin.git
git push -u origin main
```

3. On GitHub, open **Settings → Pages**.
4. Under **Build and deployment**, set **Source** to **GitHub Actions**.
5. After the workflow finishes, the site will be available at:

```text
https://YOUR_USERNAME.github.io/breakfast-checkin/
```

### Notes

- Daily XML report files are ignored by git because they contain guest data.
- Login credentials are stored in the frontend for simple station access only. Do not treat this as secure authentication for public internet use.

## Files

- `index.html` - application layout
- `style.css` - hotel-focused responsive styling
- `js/app.js` - application bootstrap and workflow wiring
- `js/xmlParser.js` - XML parsing for both Oracle report types
- `js/mergeData.js` - guest merging and breakfast rules
- `js/search.js` - instant search logic
- `js/checkin.js` - check-in and validation logic
- `js/payment.js` - payment list generation
- `js/export.js` - Excel export
- `js/ui.js` - rendering and modal helpers
- `js/utils.js` - shared constants and helpers
