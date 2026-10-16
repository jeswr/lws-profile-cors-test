# macOS runs

Machine: macOS (Darwin 27), Apple Silicon. All runs were on 2026-10-16 (times BST).
Both servers bind to `127.0.0.1` only. Page and API sit on different ports, so every fetch is cross-origin.

## Fetch / CORS test (`cors-test.js`)

```bash
node cors-test.js            # page on :8001, cross-origin API on :8002
open -a "Google Chrome" "http://127.0.0.1:8001/?b=Chrome"   # repeated per browser
```

The page runs 8 fetch cases against the API in each of three preflight modes:

- `none`: OPTIONS gets a 404 with no CORS headers.
- `explicit`: `Access-Control-Allow-Headers: Accept, Content-Type`.
- `wildcard`: `Access-Control-Allow-Headers: *`.

Every API response has `Content-Type: application/ld+json; profile="https://www.w3.org/ns/lws"`.
The page posts its results back to `results/results-<Browser>.json`. Each case records whether a preflight was seen and with which `Access-Control-Request-Headers`.

| Browser | App version | UA engine | Results file written (BST) |
|---|---|---|---|
| Google Chrome | 155.0.8059.80 | Chrome/155 | 10:42 |
| Firefox | 158.0 | Firefox/158 | 10:42 |
| Safari | 27.0.1 | Safari/605.1.15 | 10:42 |
| Microsoft Edge | 155.0.4283.45 | Edg/155 | 10:07 |
| Opera | 137.0.6036.63 | OPR/137 (Chromium 153) | 08:22 |
| Brave | 1.97.57 | Chromium 155 | 08:22 |
| Vivaldi | 8.2.4133.87 | Chromium 152 | 08:22 |

All seven result sets are identical: the same pass/fail and preflight outcome for every case and mode.

An earlier run on 2026-10-12 with older Chrome (154), Firefox (149) and Safari (27.0.1) gave the same results. Its JSON files were lost when `/tmp` was cleared, so the Chrome, Firefox and Safari files here come from the 2026-10-16 rerun. Arc was not tested because it needs an account sign-in before it will run.

## Address-bar navigation test (`nav-test.js`)

```bash
node nav-test.js             # :8003
open -a "<Browser>" "http://127.0.0.1:8003/profile"   # also /lws and /ldjson
```

Content types served:

- `/profile`: `application/ld+json; profile="https://www.w3.org/ns/lws/v1"`
- `/lws`: `application/lws+json`
- `/ldjson`: `application/ld+json`

`results/nav-requests.log` shows that Edge, Opera, Brave (Chromium 155 UA) and Vivaldi (Chromium 152 UA) requested all three URLs on 2026-10-16. Chrome and Firefox did the same on 2026-10-12; that log was lost with `/tmp`. Safari opened the tabs on 2026-10-12 but never sent a request.

### Display vs. download (2026-10-16)

The `open -a` runs above only show that the request was made. Display vs. download was checked separately by driving the real installed browsers. Each run uses a throwaway profile with downloads enabled.

- **Chromium-based** (`automation/nav-chromium.js`): Playwright's `chromium.launch({ executablePath })` runs against each app binary, headed. For each URL it records any `download` event, `document.contentType` and the start of the body text.
- **Firefox** (`automation/nav-firefox.js`): geckodriver 0.37.1 with selenium-webdriver, using a profile whose download directory is watched for new files. The JSON viewer is detected by its UI (the JSON / Raw Data / Headers tabs).
- **Self-reporting page** (`nav-self.js`, port 8004): for browsers that can't be automated. One tap on the button opens a same-origin popup, navigates it top-level to each URL in turn, reads what the popup ended up showing, and posts the result back. `selfcheck.js` validates the method against Playwright in Chrome; both give the same result.

| Browser | Method | `ld+json; profile=…` | `lws+json` | `ld+json` | Result file |
|---|---|---|---|---|---|
| Chrome 155.0.8059.80 | Playwright | displayed (raw text) | displayed (raw text) | displayed (raw text) | `results/nav-Chrome.json` |
| Edge 155.0.4283.45 | Playwright | displayed (raw text) | displayed (raw text) | displayed (raw text) | `results/nav-Edge.json` |
| Opera 137 (Chromium 153.0.8010.55) | Playwright | displayed (raw text) | displayed (raw text) | displayed (raw text) | `results/nav-Opera.json` |
| Brave 1.97.57 (Chromium 155.0.8059.80) | Playwright | displayed (raw text) | displayed (raw text) | displayed (raw text) | `results/nav-Brave.json` |
| Firefox 158.0 | geckodriver | JSON viewer | JSON viewer | JSON viewer | `results/nav-Firefox.json` |
| iOS Safari (Simulator, iOS 26.5, iPhone 17e) | self-report page, tapped via simctl | displayed | displayed | displayed | `results/results-nav-iOS-Safari-sim.json` |

No browser downloaded any of the three. Each reported `document.contentType` as the type it was served, without parameters (e.g. `application/ld+json` for the profiled type).

iOS Safari in the Simulator also ran the full fetch matrix (`results/results-iOS-Safari-sim.json`). The results are identical to the seven desktop browsers.

Not yet covered:

- **Vivaldi:** it would not attach to Playwright or expose a remote-debugging port.
- **macOS Safari:** safaridriver needs `safaridriver --enable` (an admin password).

Both have the self-report page open (`http://127.0.0.1:8004/?b=...`) and need one click on its button. Arc needs an account sign-in. A public-HTTPS run over tunnels was not done, because installing `cloudflared` was blocked pending the owner's approval.
