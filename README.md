# Jev Form Filler

A browser extension that turns your profile links into reviewed, source-backed form answers. Runs in Chrome or Edge with no application server. Uses your own TypeSafe API key.

## Install

1. Open `chrome://extensions` or `edge://extensions` and enable Developer mode.
2. Choose **Load unpacked** and select this repository's `extension` folder. No build is needed.
3. Pin **Jev Form Filler** to the toolbar.
4. Open a profile or form and click the toolbar button. The workspace opens in a new tab linked to that page.
5. Open **Settings** and enter your TypeSafe API key.

## Connect your sources

- **LinkedIn and X / Twitter:** Open your own profile, load the information you want to import, click the extension toolbar button, and choose **Import open page**. This reads currently loaded profile content. It does not sign in, scroll through an entire account, or bypass access restrictions. Public URL import is also available when the website serves usable HTML.
- **GitHub:** Enter a profile URL to import public profile details and up to 20 recently updated public repositories. Repository names, descriptions, links, and languages are included. Forks are excluded. GitHub's unauthenticated rate limits apply; partial imports clearly report repository failures.
- **Portfolio and other URLs:** Import a page directly, or enable sitemap discovery. Discovery checks `/sitemap.xml`, sitemap declarations in `/robots.txt`, and nested sitemap indexes on the same origin. Choose up to 10 pages per import. Up to 5 sitemap files, 100 discovered URLs, and 30 saved pages are supported.

Site access is requested for each imported origin. Source requests omit cookies. URL imports refuse redirects; use the final URL or import the open page instead. Dynamic websites may require open-page import. Requests time out after 15 seconds and documents are limited to 2 MB.

## Build your profile and fill a form

1. Choose **Build my profile**. Jev selects facts from extracted metadata, structured Person data, and text passages. Conflicting facts are checked separately.
2. Review the suggestions and choose **Save profile**. You can edit any detail or enter missing information yourself.
3. Open a form and click the extension toolbar button. Choose **Fill a form**, then **Scan form**.
4. Review and edit each suggested answer. Existing nonempty fields start unchecked.
5. Choose **Fill selected fields**. Inspect the original form before submitting it yourself. **Undo fill** restores unchanged filled values while preserving subsequent edits.

Jev provides Choice, Score, and Noul decisions. It does not generate free-form prose. This extension uses Choice to select exact profile facts, form options, and existing passages. Questions requiring newly written prose need a manual answer. Missing or uncertain information stays unanswered; the model decision threshold is 0.65. Confidence is a model signal, not a guarantee of factual correctness.

Standard visible text, email, URL, telephone, number, textarea, and single-select controls are supported. Passwords, hidden fields, identified financial/identity credentials, disabled fields, and read-only controls are excluded. Checkboxes, radio buttons, uploads, custom controls, embedded frames, closed shadow roots, and built-in browser pages are not supported. A scan handles up to 60 fields. Changes to a field's value, identity, or page after scanning cause that field to be skipped. Nothing submits the form automatically.

## Data and privacy

Sources, profile values, and the API key are stored in local extension storage, restricted to trusted extension contexts and excluded from browser sync. This is local browser storage, not an encrypted vault. The key is never inserted into website scripts or sent to source websites.

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
