# Do URL profile parameters cause CORS problems in browsers?

The LWS WG introduced `application/lws+json` partly because some browsers were thought to reject requests or responses with a media type like:

```
application/ld+json; profile="https://www.w3.org/ns/lws/v1"
```

This repository tests whether that is true for current browsers.

## Summary

**No current browser rejects these requests or responses.** A URL in a profile parameter has one effect: when it appears in a request's `Accept` header, the browser sends a CORS preflight (`OPTIONS`) first. If the server answers the preflight, the request then succeeds.

| Situation | `application/ld+json; profile="<URL>"` | `application/lws+json` |
| --- | --- | --- |
| Response `Content-Type` (reading it from script) | Readable, no preflight | Readable, no preflight |
| Request `Accept` on a GET | **Preflight needed** | No preflight |
| Request `Content-Type` on PUT/POST | Preflight needed | Preflight needed |
| Server ignores `OPTIONS` | `Accept` GETs and all writes fail | Writes fail |
| Server allows `accept, content-type` (or `*`) | Everything works | Everything works |
| Opening the URL in the address bar | JSON shown in the tab, no download | JSON shown in the tab, no download |

So `application/lws+json` saves exactly one preflight, on GET requests that ask for the profile in `Accept`. In practice that saving rarely applies, because any authenticated request (`Authorization`, `DPoP`) and any JSON write is preflighted whatever the media type.

Needing a preflight is not free, though. See [Costs of relying on the preflight](#costs-of-relying-on-the-preflight).

Leaving out the quotes (`profile=https://…`) does not avoid the preflight, because the URL still contains `:`.

## Why: the Fetch standard

[Fetch](https://fetch.spec.whatwg.org/#cors-safelisted-request-header) treats `Accept` as a "CORS-safelisted" (no preflight) header only if its value has no *CORS-unsafe request-header bytes*. These include `"`, `:`, `(`, `)`, `<`, `>`, `?`, `@`, `[`, `\`, `]`, `{`, `}`, and the value must also be 128 bytes or fewer. Every absolute URL contains `:`, so an `Accept` value with a profile URL is never safelisted. Fetch does not block such a request; it adds a preflight.

`Content-Type` on a request is safelisted only for `application/x-www-form-urlencoded`, `multipart/form-data` and `text/plain`. So `application/lws+json` and `application/ld+json` both need a preflight, with or without a profile.

On responses, `Content-Type` is a CORS-safelisted response header. Script can read it whatever its value, as long as the response has `Access-Control-Allow-Origin`.

## What a server needs to send

For the preflight:

```
OPTIONS /container/
Origin: https://app.example
Access-Control-Request-Method: GET
Access-Control-Request-Headers: accept

HTTP/1.1 204 No Content
Access-Control-Allow-Origin: https://app.example
Access-Control-Allow-Methods: GET, HEAD, POST, PUT, PATCH, DELETE
Access-Control-Allow-Headers: accept, content-type, authorization, dpop
Access-Control-Max-Age: 600
Vary: Origin
```

The actual response also needs `Access-Control-Allow-Origin`, and `Access-Control-Expose-Headers` for any non-safelisted headers clients must read (for example `Link`, `ETag`). `Content-Type` does not need exposing.

`Access-Control-Allow-Headers: *` worked in the tests, but it does not cover `Authorization`, and on credentialed requests (cookies) it is treated as a literal header name. Listing the headers, or echoing `Access-Control-Request-Headers`, is safer. Servers that already support authenticated or write requests from browser apps (for example Solid servers) already do this.

## Costs of relying on the preflight

A preflight is not a failure, but it is not neutral either. Dropping `application/lws+json` moves these costs onto servers and clients that ask for the profile in `Accept`:

- **Latency:** the first profiled GET to each URL costs an extra round trip. The preflight cache is keyed by URL (and request headers). A client walking a container tree therefore pays one preflight per resource. Browsers also cap `Access-Control-Max-Age`, so the preflights come back after the cap expires.
- **Server requirements:** the server must answer `OPTIONS` with the right CORS headers. That is routine for a dynamic server, but hard or impossible on some static hosts, CDNs and object stores. With `application/lws+json`, an unauthenticated read-only deployment needs only `Access-Control-Allow-Origin` on its responses.
- **Opaque failures:** if the preflight is missing or wrong, script sees only a generic network error, with no status code. That is harder to debug than an ordinary HTTP error.

The saving only applies to requests that would otherwise be "simple". Authenticated requests (`Authorization`, `DPoP`) and JSON writes are preflighted whatever the media type, so for those `application/lws+json` makes no difference.

## Results

All browsers gave identical results.

| Browser | Version | Engine | Where |
| --- | --- | --- | --- |
| Google Chrome | 155.0.8059.80 | Chromium 155 | macOS |
| Microsoft Edge | 155.0.4283.45 | Chromium 155 | macOS |
| Opera | 137.0.6036.63 | Chromium 153 | macOS |
| Brave | 1.97.57 | Chromium 155 | macOS |
| Vivaldi | 8.2.4133.87 | Chromium 152 | macOS |
| Firefox | 158.0 | Gecko | macOS |
| Safari | 27.0.1 | WebKit | macOS |
| iOS Safari | iOS 26.5 (iPhone 17e) | WebKit | iOS Simulator on macOS |
| Chromium (headless) | 141.0.7390.37 | Chromium 141 | Linux, incl. HTTPS run |

Each browser ran every request below against each of three server preflight setups. That is 18 cases on Linux and 24 on macOS. The macOS set adds a GET with no custom headers and a `text/plain` POST as controls, and uses POST for writes.

- **Requests:**
  - `GET` with `Accept: application/lws+json`
  - `GET` with `Accept: application/ld+json`
  - `GET` with `Accept: application/ld+json; profile="<URL>"`
  - `GET` with `Accept: application/ld+json;profile=<URL>` (unquoted)
  - Write with `Content-Type: application/lws+json`
  - Write with `Content-Type: application/ld+json; profile="<URL>"`
- **Server preflight setups:**
  - `OPTIONS` answered without CORS headers
  - Explicit `Access-Control-Allow-Headers: accept, content-type`
  - `Access-Control-Allow-Headers: *`

Every response carried `Content-Type: application/ld+json; profile="<URL>"`.

Observed in every browser:

- A request was preflighted exactly when the table above says so.
- A request failed only when it needed a preflight and the server did not answer it with CORS headers.
- With either preflight setup, every request succeeded. The server received the exact `Accept` value, and script could read the full `Content-Type` including the profile.

The full per-case output is in [`mac/`](mac/) and [`cloud/`](cloud/).

### HTTPS

[`cloud/https-chromium.js`](cloud/https-chromium.js) repeats the checks between two distinct HTTPS origins, with a page on `https://app.test` calling `https://pod.test`. It uses a locally generated certificate, the page is a secure context, and it was not run over the public internet. The results matched the localhost runs. In the same run, navigating directly to a public container served as `application/ld+json; profile="…"`, `application/lws+json` or `application/ld+json` showed the JSON in the tab in every case, with no download.

Over the public internet: [`mac/public-test.js`](mac/public-test.js) ran behind two Cloudflare quick tunnels, giving two distinct public `https://*.trycloudflare.com` origins with real certificates. The API allowed only the page's origin. In Chrome, Edge, Opera, Brave, Firefox and iOS Safari (Simulator), the fetch matrix and the address-bar check gave exactly the same results as on localhost. Details are in [`mac/RUN.md`](mac/RUN.md).

### Opening a container in the address bar

The real installed browsers were driven automatically, and each page was read from code. Every browser displayed the container served as `application/ld+json; profile="…"`, `application/lws+json` and plain `application/ld+json`, and none downloaded it:

- Chrome, Edge, Opera and Brave, driven with Playwright, show the JSON as raw text.
- Firefox, driven with geckodriver, opens all three in its JSON viewer.
- iOS Safari in the Simulator displays all three.

Each reports `document.contentType` as the served type without parameters. Details are in [`mac/RUN.md`](mac/RUN.md).

### Not covered yet

- Address-bar check in Vivaldi, which won't attach to automation (its fetch results are valid).
- Address-bar check and the public-HTTPS run in macOS Safari: safaridriver is enabled, but session creation timed out. Its localhost fetch results are valid.
- Arc, which needs an account sign-in.
- Android browsers.
- The macOS runs used the profile URL `https://www.w3.org/ns/lws`. The Linux runs used `https://www.w3.org/ns/lws/v1`. Both contain `:` and `/`, so the rule applies identically.

## Prior discussion

- [w3c/lws-protocol#276](https://github.com/w3c/lws-protocol/issues/276), "Re-evaluate application/lws+json Media Type", gathers WG feedback on whether to keep `application/lws+json` or rely on the profiled `application/ld+json` form.

- [w3c/json-ld-syntax#436](https://github.com/w3c/json-ld-syntax/issues/436), "URI in Profile triggers CORS Unsafe Request Header Byte rule", raised for IIIF and Linked Art. This is the original discussion, and it covers the same behaviour. It already recognised that the problem is more subtle than a browser blocking the request. Over time that conclusion got simplified to "WHATWG does not support URL profiles", which these results show is not accurate. At its 10 June 2026 meeting the JSON-LD WG noted that the preflight solves it, and planned to cover it in best practices rather than change JSON-LD.
  - At the [13 November 2024 meeting](https://www.w3.org/2024/11/13-json-ld-minutes.html#bb35), the WG made the same point as [Costs of relying on the preflight](#costs-of-relying-on-the-preflight): profile-based content negotiation doesn't come for free, because servers also have to support preflights, which are "difficult to configure and easily forgotten".
  - The issue's author agreed the preflight solves the problem, and suggested implementation notes in future specs.
  - In January 2025 Ruben Verborgh reported hitting this routinely in practice with RDF agents, which led to whatwg/fetch#878 (below).
- Options raised in that discussion besides relying on the preflight:
  - Short token names for profiles, for example `profile=lws`. These contain no CORS-unsafe bytes, so they need no preflight.
  - An `Accept-Profile` request header ([draft-svensson-profiled-representations](https://datatracker.ietf.org/doc/html/draft-svensson-profiled-representations-01)). Being a non-safelisted header, it would still need a preflight.
  - A dedicated media type whose relationship to the JSON-LD form is spelled out, as Verifiable Credentials 2.0 does ([media type precision](https://www.w3.org/TR/vc-data-model-2.0/#media-type-precision)). That is the approach `application/lws+json` takes today.
- [WebKit bug 165178](https://bugs.webkit.org/show_bug.cgi?id=165178) (2016) introduced the `Accept` restriction in Safari: "we're not blocking such request headers, merely making them trigger a preflight". Fetch later standardised the current byte list.
- [whatwg/fetch#878](https://github.com/whatwg/fetch/issues/878) proposed letting servers opt out of CORS. It does not propose blocking these requests.

## Reproducing

Fetch test (any browser):

```sh
node cloud/cors-matrix.js
# then open http://127.0.0.1:8001/?b=<BrowserName>; results-<BrowserName>.json is written next to the script
```

The page runs cross-origin `fetch()` calls from `127.0.0.1:8001` to `localhost:8002`.

HTTPS test (Chromium via Playwright):

```sh
cd cloud
openssl req -x509 -newkey rsa:2048 -nodes -keyout key.pem -out cert.pem -days 2 \
  -subj "/CN=pod.test" -addext "subjectAltName=DNS:pod.test,DNS:app.test"
npm i playwright && node https-chromium.js
```

The macOS scripts and how they were run are described in [`mac/RUN.md`](mac/RUN.md).

---

Tests were written and run with the help of Claude Code, in October 2026.
