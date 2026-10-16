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
| Opening the URL in the address bar (Chromium) | JSON shown in the tab | JSON shown in the tab |

So `application/lws+json` saves exactly one preflight, on GET requests that ask for the profile in `Accept`. In practice that saving rarely applies, because any authenticated request (`Authorization`, `DPoP`) and any JSON write is preflighted whatever the media type.

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

## Results

All browsers gave identical results.

| Browser | Version | Engine | Where |
| --- | --- | --- | --- |
| Google Chrome | 154.0.8037.98 | Chromium 154 | macOS |
| Microsoft Edge | 155.0.4283.45 | Chromium 155 | macOS |
| Opera | 137.0.6036.63 | Chromium 153 | macOS |
| Brave | 1.97.57 | Chromium 155 | macOS |
| Vivaldi | 8.2.4133.87 | Chromium 152 | macOS |
| Firefox | 149 (user agent) | Gecko | macOS |
| Safari | 27.0.1 | WebKit | macOS |
| Chromium (headless) | 141.0.7390.37 | Chromium 141 | Linux, incl. HTTPS run |

Each browser ran the same 18 cases: six requests, each against a server with three preflight setups.

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

### Not covered

- Opening a container from the address bar was checked visually only in Chromium. The macOS browsers all fetched the URLs, but whether each one displayed or downloaded the JSON was not recorded. In any case, `application/lws+json` and `application/ld+json` are both `+json` types, so a profile parameter shouldn't change this.
- Arc (needs sign-in) and mobile browsers were not tested.
- The macOS runs used the profile URL `https://www.w3.org/ns/lws`. The Linux runs used `https://www.w3.org/ns/lws/v1`. Both contain `:` and `/`, so the rule applies identically.

## Prior discussion

- [w3c/json-ld-syntax#436](https://github.com/w3c/json-ld-syntax/issues/436), "URI in Profile triggers CORS Unsafe Request Header Byte rule", raised for IIIF and Linked Art. This covers the same behaviour. At its 10 June 2026 meeting the JSON-LD WG noted that the preflight solves it, and planned to cover it in best practices rather than change JSON-LD.
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
