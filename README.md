# Jev Form Filler

A browser extension that turns your profile links into reviewed, source-backed form answers. Runs in Chrome or Edge with no application server. Uses your own TypeSafe API key.

## Install

1. Open `chrome://extensions` or `edge://extensions` and enable Developer mode.
2. Choose **Load unpacked** and select this repository's `extension` folder. No build is needed.
3. Pin **Jev Form Filler** to the toolbar.
4. Click the toolbar button to open the popup for your current page. Choose **Manage profile** to open the workspace for setup and imports.
5. Open **Settings** and enter your TypeSafe API key. If Jev Reader already has a key, Jev Form Filler reuses it automatically.

The popup and workspace follow your system light or dark appearance automatically, including changes while it is open. There is no theme switch.

## Connect your sources

- **LinkedIn and X / Twitter:** Open your own profile, load the information you want to import, click the extension toolbar button, choose **Manage profile**, and choose **Import open page**. This reads currently loaded profile content. It does not sign in, scroll through an entire account, or bypass access restrictions. Public URL import is also available when the website serves usable HTML.
- **GitHub:** Enter a profile URL to import public profile details and up to 20 recently updated public repositories. Repository names, descriptions, links, and languages are included. Forks are excluded. GitHub's unauthenticated rate limits apply; partial imports clearly report repository failures.
- **Portfolio and other URLs:** Import a page directly, or enable sitemap discovery. Discovery checks `/sitemap.xml`, sitemap declarations in `/robots.txt`, and nested sitemap indexes on the same origin. Choose up to 10 pages per import. Up to 5 sitemap files, 100 discovered URLs, and 30 saved pages are supported.

Site access is requested for each imported origin. Source requests omit cookies. URL imports refuse redirects; use the final URL or import the open page instead. Dynamic websites may require open-page import. Requests time out after 15 seconds and documents are limited to 2 MB.

## Build your profile and fill a form

1. For existing imports, choose **Refresh sources** to recover social links, structured identity metadata, and employment context. Browser-check and sign-in pages are excluded. Choose **Build my profile**: unambiguous structured identity facts are extracted directly, and Jev compares contextual candidates from all sources for the remaining fields. Current company and company website are separate fields.
2. Review the suggestions and choose **Save profile**. You can edit any detail or enter missing information yourself.
3. Open a form and click the extension toolbar button. Choose **Fill Details** to detect fields, find supported answers, and fill them automatically. You can also right-click the page or a field and choose **Fill Details** without opening the popup.
4. Watch the progress message on the page. Filling continues if you close the popup. Existing values and unknown answers stay unchanged.
5. Inspect the completed form before submitting it yourself. **Undo fill** restores unchanged filled values while preserving subsequent edits.

The popup shows the latest fill status and offers **Undo fill** when you reopen it on the same page.

Jev provides Choice, Score, and Noul decisions. It does not generate free-form prose. This extension uses Choice to select exact profile facts, form options, and existing passages. Questions requiring newly written prose need a manual answer. Missing information stays unanswered. Profile suggestions with low model confidence are shown for explicit review instead of silently discarded. Form-filling decisions still use a 0.65 confidence threshold. Confidence is a model signal, not a guarantee of factual correctness.

Standard visible text, email, URL, telephone, number, textarea, and single-select controls are supported. Passwords, hidden fields, identified financial/identity credentials, disabled fields, and read-only controls are excluded. Checkboxes, radio buttons, uploads, custom controls, embedded frames, closed shadow roots, and built-in browser pages are not supported. A scan handles up to 60 fields. Changes to a field's value, identity, or page after scanning cause that field to be skipped. Nothing submits the form automatically.

## Data and privacy

Sources, profile values, and the API key are stored in local extension storage, restricted to trusted extension contexts and excluded from browser sync. Jev Form Filler shares key saves and removals directly with the fixed Jev Reader extension identity when both extensions are installed. No website can request the key. This is local browser storage, not an encrypted vault. The key is never inserted into website scripts or sent to source websites.

Building a profile sends source candidates directly to `https://api.typesafe.ai/v1/systemone`. Scanning a form sends the saved profile, form labels, option labels, and candidate passages to TypeSafe. These requests may incur usage charges. The extension is client-side, but Jev inference runs remotely at TypeSafe. There is no application backend or telemetry. Source pages are never uploaded to an application server.

Removing a source also removes saved facts directly linked to it. Manually edited facts are treated as your own entries. **Delete local data** removes all sources, the profile, and the key. Browser-granted site permissions remain manageable through the extension's browser settings.

## Development and verification

Requires Node.js 22 or newer.

```sh
npm ci
npx playwright install chromium
npm run check
```

Unit checks cover URL safety, model-output validation, uncertainty handling, authentication failures, and select values. The browser check installs an isolated copy of the real extension and exercises source imports, nested sitemaps, profile extraction and review, the TypeSafe HTTP contract, form filling, preservation of existing values, undo, changed fields, invalid keys, and responsive layout. Only external websites and the TypeSafe response are mocked with synthetic fixtures. The test copy grants fixture hosts to automate injection; the shipped extension uses toolbar click access and optional per-site permissions.

Synthetic screenshots are written to ignored `artifacts/`. No live TypeSafe decision quality or real LinkedIn/X compatibility is claimed by these tests. Reload the extension after changing its files.

API reference: [TypeSafe Choice](https://docs.typesafe.ai/primitives/choice).

To verify key sharing against the actual Reader extension, build Reader first and run `node scripts/verify-sharing.js`. Set `READER_EXTENSION_DIR` if its unpacked extension is not in the sibling `jev-reader/dist/extension` folder. This uses an isolated browser profile and synthetic credentials.
