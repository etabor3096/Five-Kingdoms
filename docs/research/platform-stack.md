# Five Kingdoms: platform stack verification

Researched 2026-11-11 against primary sources (official docs, vendor changelogs, npm registry, GitHub, WebKit/MDN data). Each claim carries a link; the source's own date or version is noted where the page gave one. Things I could not confirm from a primary source are marked **UNVERIFIED**.

Method note: pages were read through a fetch tool that summarises content, so quoted wording is as reported by that tool. Doc pages were not diffed against raw HTML.

## TL;DR

| Stack choice | Verdict | One-line reason |
|---|---|---|
| Cloudflare Workers + SQLite Durable Objects, free plan | **GO** | SQLite DOs are free-plan eligible; estimated load is 2-20% of daily limits (see Q1). |
| pnpm monorepo, shared pure-TS engine | **GO** | Expo supports pnpm isolated installs from SDK 54; Wrangler bundles with esbuild. Verify workspace import with a smoke test (docs silent). |
| Expo SDK 58 + RN + react-native-web, one UI codebase | **GO, with caveats** | Web is a first-class target; Reanimated on web is a JS implementation, so budget perf testing for the drag/animation table. |
| PWA on iPhone (Add to Home Screen) | **GO, with mandatory workarounds** | Orientation lock is impossible on iOS Safari; need a rotate-device overlay, and tolerant reconnect logic. |
| Electron wrapper (unsigned) macOS + Windows | **GO for macOS, CONDITIONAL for Windows** | Windows 11 Smart App Control can hard-block unsigned apps with no "Run anyway". Keep the PWA as the Windows fallback. |
| react-native-macos / react-native-windows | **NO-GO (confirmed, not needed)** | Lag core RN; Expo SDK 58 does not support macOS. |

### Recommended pins (npm registry state on 2026-11-11)

| Package | Pin | Source / note |
|---|---|---|
| Node | 24.x (>= 24.3) or 22.x (>= 22.13); no odd majors | [Expo SDK 58 changelog](https://expo.dev/changelog/sdk-58), 2026-10-15 |
| pnpm | 12.x (npm latest 12.18.0) | [npm registry](https://registry.npmjs.org/pnpm/latest) |
| expo | ~58.0.24 | [npm registry](https://registry.npmjs.org/expo/latest) |
| react-native | 0.88.1 | [SDK 58 bundledNativeModules](https://raw.githubusercontent.com/expo/expo/sdk-58/packages/expo/bundledNativeModules.json) |
| react / react-dom | 19.3.0 | same |
| react-native-web | ~0.21.4 | same |
| react-native-reanimated / react-native-worklets | 4.7.1 / 0.13.0 | same |
| react-native-gesture-handler | ~3.3.0 | same |
| react-native-svg | 15.16.0 | same |
| @shopify/react-native-skia (optional) | 2.14.0 | same |
| expo-router | ~58.0.31 | same |
| wrangler | ^4.160.1 | [npm registry](https://registry.npmjs.org/wrangler/latest), [releases](https://github.com/cloudflare/workers-sdk/releases) |
| @cloudflare/vitest-plugin (NOT vitest-pool-workers) | ^1.8.0 | see Q1; peer `vitest ^4.1 \|\| ^5` |
| vitest | ^5.1.0 | [npm registry](https://registry.npmjs.org/vitest/latest) |
| electron | 45.3.1 (stable; 44.11.2 and 43.8.9 also supported) | [releases.electronjs.org](https://releases.electronjs.org/) |
| electron-builder | 26.18.0 | [npm registry](https://registry.npmjs.org/electron-builder/latest) |
| TypeScript | use the version the Expo SDK 58 template pins | npm latest is 7.0.2, but Expo SDK 58 compatibility with TS 7 is **UNVERIFIED** |

Pin Expo-managed native modules with `npx expo install`, not by hand, so they track the SDK's bundled versions.

## Findings that should change the stack

1. **`@cloudflare/vitest-pool-workers` is deprecated; it was renamed `@cloudflare/vitest-plugin`.** npm marks the old package "renamed ... will not receive future updates" (last version 0.23.0, 2026-10-07). The new package is 1.8.0 and, per the [migration guide](https://developers.cloudflare.com/workers/testing/vitest-integration/migration-guides/migrate-to-vitest-plugin/), "The package API and Vitest configuration are unchanged." Use the new name from day one.
2. **iOS cannot lock orientation, in the browser or from the manifest.** MDN browser-compat-data records `ScreenOrientation.lock()` as unsupported in Safari and iOS Safari, and manifest `orientation` as unsupported there. The rotate-device overlay is not optional. See Q3.
3. **Unsigned Windows Electron may be hard-blocked on Windows 11 with Smart App Control.** Microsoft states Smart App Control "will block execution of unsigned files unless the file has a positive reputation" and "Run anyway" may not appear. Treat the Windows Electron build as best-effort and keep installing the PWA from Edge/Chrome as the documented alternative (Edge/Chrome PWA install was not verified here: **UNVERIFIED**). See Q4.
4. **electron-builder `identity: null` skips signing entirely; only `"-"` produces an ad-hoc signature.** Apple Silicon needs at least an ad-hoc signature to run native arm64 code. Use `mac.identity: "-"` (and Hardened Runtime off). See Q4.
5. **No change needed to the server choice.** The free tier fits with a wide margin. See Q1.

## 1. Cloudflare Workers Free + Durable Objects

### Verified facts

- **SQLite-backed DOs are available on Free, and are the only kind available.** "Only Durable Objects with SQLite storage backend are available." ([DO pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/), page last updated 2026-10-18; [DO limits](https://developers.cloudflare.com/durable-objects/platform/limits/)).
- **Free-plan DO limits, per day, reset 00:00 UTC** ([DO pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)):
  - 100,000 requests/day
  - 13,000 GB-s duration/day
  - 5 million rows read/day
  - 100,000 rows written/day
  - 5 GB total SQL storage
  - On exceeding any limit, "further operations of that type will fail with an error."
- **Workers Free:** 100,000 requests/day (error 1027 beyond), 10 ms CPU per HTTP request, 50 subrequests, 64 MiB uncompressed bundle ([Workers limits](https://developers.cloudflare.com/workers/platform/limits/)).
- **DO limits page** ([source](https://developers.cloudflare.com/durable-objects/platform/limits/)): 100 DO classes on Free; each incoming HTTP request or WebSocket message resets the CPU budget to 30 s; WebSocket received-message size 32 MiB; soft limit 1,000 requests/s per object. The page contradicts itself on per-object storage ("10 GB" in the table, "1 GB on the Free plan" in the FAQ); irrelevant at our scale. Whether the Workers-Free 10 ms CPU cap applies to DO WebSocket message handlers is **UNVERIFIED** (the DO page says 30 s, the Workers page says 10 ms for HTTP). Game logic per move should be well under 10 ms anyway; measure it.
- **Connections per DO:** the Hibernation API "permits a maximum of 32,768 WebSocket connections per Durable Object", CPU and memory may lower it in practice ([DO state API](https://developers.cloudflare.com/durable-objects/api/state/)). We need 7.
- **Billing of WebSocket traffic** ([DO pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)):
  - Opening a WebSocket counts as 1 request.
  - Incoming messages are billed at 20:1 ("100 incoming messages count as 5 requests"); metrics still show real counts.
  - Outgoing messages and incoming protocol pings are free.
  - Free-plan limits are enforced against billed requests (this is my reading of the page, not a quoted statement).
- **Duration:**
  - Wall-clock time while active, billed at a fixed 128 MB: "1,000,000 seconds * 128 MB / 1 GB = 128,000 GB-s", i.e. 0.125 GB x seconds.
  - Without Hibernation API (`ws.accept()`): duration accrues "for the entire time the WebSocket is connected."
  - With Hibernation API (`ctx.acceptWebSocket()`): objects "idle and eligible for hibernation are not billed for duration."
  - Hibernation only happens after a short period with no events; pending alarms or `setTimeout`/`setInterval` prevent it ([WebSockets best practices](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)). In-memory state is lost on hibernation; use `serializeAttachment` (16,384 byte cap) or storage.
- **`setWebSocketAutoResponse`:** matched requests get a reply without waking the DO, so no duration accrues; request and response are limited to 2,048 characters ([DO state API](https://developers.cloudflare.com/durable-objects/api/state/)). Use it for app-level pings.
- Whether auto-responded messages count toward the 20:1 request billing is **UNVERIFIED**. The estimate below assumes they do (worst case).
- Whether the Worker that forwards the upgrade to the DO also counts one Worker request: the DO pricing page does not say directly; I assume yes (Worker request per upgrade). Static asset requests being free is **UNVERIFIED** here; if the web build is hosted on Workers Assets or Pages, check [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/).

### Usage estimate

Assumptions (mine, stated so they can be challenged):
- 5 concurrent rooms x 7 players = 35 sockets, one 3 h (10,800 s) game night per UTC day.
- Reconnects: 5 per player per night, 35 x (1 + 5) = 210 upgrade requests.
- Scenario A (realistic): each player sends 1 message per 10 s on average for the full 3 h (a Five Crowns turn is draw + discard + maybe reorder; this is generous).
- Scenario B (stress): 1 message per second per player for 3 h (drag-position streaming; avoid this design).
- Server persists game state with ~2 SQL rows written per accepted action.

Requests:

| | Incoming msgs | /20 billing ratio | + upgrades (210) | % of 100k/day |
|---|---|---|---|---|
| A | 35 x 1,080 = 37,800 | 1,890 | ~2,100 | ~2% |
| B | 35 x 10,800 = 378,000 | 18,900 | ~19,100 | ~19% |

Even if 10 s application heartbeats are also billed (worst case): 35 x 1,080 more = +1,890. Still under 5%.

Duration (5 DOs, 10,800 s each, 0.125 GB):
- **Without hibernation:** 5 x 10,800 x 0.125 = **6,750 GB-s/day = 52% of 13,000.** Break-even is 13,000 / 1,350 = ~9.6 DO-nights of 3 h per UTC day. Two 5-room nights on the same UTC day would exceed it. A US-evening game night straddles 00:00 UTC, which splits usage across two daily buckets and helps.
- **With hibernation:** idle-eligible time is free. During active play with messages every ~10 s or faster the DO is likely not idle long enough to hibernate, so expect savings mainly in lobbies, between rounds, and when players are AFK. Upper bound is still 6,750 GB-s. Treat hibernation as "free headroom", not a requirement. Do not hold a `setInterval` turn timer in memory if you want it; use a single alarm only when needed, since alarms prevent hibernation.

Rows written (persist per action): 5 rooms x ~1,500 actions x 2 rows = ~15,000, 15% of 100,000. Batch or snapshot per round if you need margin.

Conclusion: the free tier fits "several nights a week", as long as the same UTC day does not host more than ~9 DO-nights without hibernation. Stress-test with the actual protocol; mark the above as an estimate, not a measurement.

### Local dev and testing

- **wrangler 4.160.1** is current (2026-11-11) ([workers-sdk releases](https://github.com/cloudflare/workers-sdk/releases)). `wrangler dev` runs workerd locally with DO support (general knowledge; not re-verified on a doc page this session).
- **Vitest integration:** `@cloudflare/vitest-pool-workers` was renamed `@cloudflare/vitest-plugin` ([migration guide](https://developers.cloudflare.com/workers/testing/vitest-integration/migration-guides/migrate-to-vitest-plugin/); codemod `npx @cloudflare/codemods vitest:pool-workers-to-vitest-plugin`). Current 1.8.0, peer `vitest ^4.1.0 || ^5.0.0` ([npm](https://registry.npmjs.org/@cloudflare/vitest-plugin/latest)). Test APIs include `runInDurableObject`, `listDurableObjectIds`, and `evictDurableObject` with `"hibernate"` mode to test hibernatable WebSockets ([test APIs](https://developers.cloudflare.com/workers/testing/vitest-integration/test-apis/)). `runInDurableObject` only works for DOs in the `main` Worker. `SELF` is replaced by `exports.default.fetch()`. Testing WebSockets through `fetch` is not documented on that page (**UNVERIFIED**). Because the rules engine is pure TS, test it with plain Vitest in Node and reserve the Workers plugin for DO/WebSocket integration tests.
- **Importing a pnpm workspace package from the Worker:** Wrangler "bundles your Worker code using esbuild" and supports npm imports and the `workerd` export condition ([bundling](https://developers.cloudflare.com/workers/wrangler/bundling/)). The page does not mention monorepos or workspace TypeScript source: **UNVERIFIED in docs**. Verify with `wrangler deploy --dry-run --outdir dist`, which the page recommends for inspecting bundling. Practical recommendation: depend on `"@fk/engine": "workspace:*"` and point its `exports` at source `.ts` or a built `dist`; esbuild handles TS.

### Risks & gotchas
- Free-plan overage makes operations fail until 00:00 UTC (no soft degradation). Add a visible "server busy" client state.
- Wall-clock duration billing is the closest limit to bite; prevent idle rooms from living forever (evict empty rooms, avoid timers that block hibernation).
- Server-side DO memory is lost on hibernation; keep authoritative game state in SQLite, rebuild in the constructor.
- Do not stream drag positions to the server; send discrete moves (also keeps message billing trivial).
- Outbound `new WebSocket()` from a DO can keep it in memory up to 15 minutes ([best practices](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)); not needed here.
- Docs show inconsistencies (per-object storage figure; CPU cap). Re-check [limits](https://developers.cloudflare.com/durable-objects/platform/limits/) before launch.

## 2. Expo

### Verified facts
- **Current SDK: 58** (released 2026-10-15; SDK 57 was 2026-06-30) ([Expo changelog](https://expo.dev/changelog)). "SDK 58 upgrades React Native from 0.86 to 0.88" ([SDK 58 post](https://expo.dev/changelog/sdk-58)). Bundled: RN 0.88.1, React 19.3.0, react-native-web ~0.21.4, Reanimated 4.7.1, worklets 0.13.0, Gesture Handler ~3.3.0, react-native-svg 15.16.0, Skia 2.14.0 ([sdk-58 bundledNativeModules.json](https://raw.githubusercontent.com/expo/expo/sdk-58/packages/expo/bundledNativeModules.json)). Note: `main` of that file already lists RN 0.89.0-rc.0 (SDK 59 in progress); use the `sdk-58` branch.
- **SDK 58 notes relevant to us** ([post](https://expo.dev/changelog/sdk-58)): Node 22.13+/24.3+/26+ only; Expo Router no longer provides web safe-area insets via react-native-safe-area-context (use CSS `env(safe-area-inset-*)`), which matters for the iPhone notch in landscape; async routes on web by default; "SDK 58 does not support macOS yet."
- **Web output modes** ([Publishing websites](https://docs.expo.dev/guides/publishing-websites/)): `single` (documented as the default; one `index.html`, SPA, host must rewrite all paths to `index.html`), `static` (per-route HTML), `server` (SSR on request, SDK 58+). The SDK 58 post's wording about server output "by default" conflicts with this page, so **set `web.output: "single"` explicitly**. A static SPA is all a card table needs and it can sit on any static host, or Workers Assets.
- **Export/serve:** `npx expo export -p web` writes `dist`; `npx expo serve` serves it over HTTP only, so secure-context features may not work locally ([same page](https://docs.expo.dev/guides/publishing-websites/)).
- **PWA:** Expo has no first-party PWA feature. Its [PWA guide](https://docs.expo.dev/guides/progressive-web-apps/) is manual: hand-written `public/manifest.json`, Workbox for service workers, with warnings that service workers "are known to cause unexpected behavior" and an aggressive cache can strand users on old builds.
- **pnpm monorepo** ([Expo monorepo guide](https://docs.expo.dev/guides/monorepos/)):
  - Workspaces go in `pnpm-workspace.yaml`; use `workspace:*`.
  - Metro is auto-configured via `expo/metro-config`; delete manual `watchFolders`, `resolver.nodeModulesPaths`, `extraNodeModules`, `disableHierarchicalLookup`; run `npx expo start --clear` once.
  - Isolated installs (pnpm default) are supported from SDK 54. If trouble, set `nodeLinker: hoisted` in `pnpm-workspace.yaml`.
  - Duplicate `react`/`react-native` is unsupported; check with `pnpm why --depth=10 react-native`; force one React via root `resolutions`.
  - Native module duplication: `experiments.autolinkingModuleResolution` true; automatic in monorepos from SDK 55.
- **Reanimated on web:** [web support](https://docs.swmansion.com/react-native-reanimated/docs/guides/web-support/) (docs v4.x): works in browsers but "all of the functionalities are implemented purely in JavaScript, hence the efficiency of the animations might be lower." Worklets Babel plugin is "the only configuration we actively test" (Expo's babel preset handles it; do not hand-wire it).
- **Gesture Handler on web:** [docs](https://docs.swmansion.com/react-native-gesture-handler/docs/fundamentals/getting-started/): "There is no additional configuration required for the web." Wrap in `GestureHandlerRootView` near the root. A reported v3.4+ web change blocks the browser context menu on right-click ([issue #4687](https://github.com/software-mansion/react-native-gesture-handler/issues/4687); open when checked, single report).
- **react-native-svg / Skia on web:** react-native-svg is bundled with SDK 58 and renders to DOM SVG via react-native-web (general knowledge, not re-verified on a doc page). **Skia on web (CanvasKit WASM, bundle size, loading) is UNVERIFIED**: the Skia web docs URLs I tried returned 404. Do not adopt Skia unless a need is proven.

### Perf recommendations for card drag-and-drop (design advice, not sourced claims)
- Use Reanimated shared values + `transform` (translate/rotate/scale) and `opacity` only; avoid animating layout props (width, top/left). On web these become JS-driven style updates each frame, so keep concurrently animating cards low (hand of <= ~14 plus a few flying cards is fine on modern hardware; measure on an iPhone).
- For web specifically, consider CSS transitions / Web Animations for non-interactive moves (deal, flip, discard fly-out) behind a thin wrapper, and Reanimated + Gesture Handler only for live drag.
- Render the table as DOM/SVG rather than Skia to avoid WASM load cost and keep bundle small.
- Lock to a fixed logical canvas (e.g. 16:9) and scale it, to keep layout math identical across phone, desktop, and Electron.

### Risks & gotchas
- Reanimated web performance is lower than native by the maintainers' own statement; budget a perf spike with a 7-player table on an older iPhone before committing to animation-heavy design.
- Expo web safe-area behavior changed in SDK 58: handle landscape notch insets with CSS `env()`.
- Service-worker caching can strand users on stale builds; version the cache and add an update prompt.
- Docs conflict on `web.output` default; set it explicitly.
- Gesture Handler 3.x is a new major on web; pin to the SDK-bundled version and test pointer events (mouse + touch).
- `npx expo install` over hand-pinning; mismatched native-module versions are the most common monorepo failure.

## 3. PWA on iOS Safari

### Verified facts
- **Standalone from Home Screen:** yes. A manifest with `display` `standalone` (or `fullscreen`) makes it open "like any other app" outside Safari, with its own App Switcher entry ([WebKit blog, 2023-02-16](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)). Since Safari 26 (iOS 26), "every website added to the Home Screen opens as a web app" by default, though the user can switch "Open as Web App" off ([WebKit blog, 2025-09-15](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/)). iPhone users on older iOS still need a manifest or meta tag.
- **`display: "fullscreen"` is not supported on iOS Safari** per MDN browser-compat-data (`manifests/webapp/display.json`: safari_ios fullscreen "mirror" of desktop Safari's `false`; `standalone` since 11.3) ([display.json](https://raw.githubusercontent.com/mdn/browser-compat-data/main/manifests/webapp/display.json)). Use `standalone`; on iOS status-bar styling is controlled via `apple-mobile-web-app-status-bar-style` meta (general knowledge, **UNVERIFIED** this session).
- **Orientation lock API:** `ScreenOrientation.lock()` and `unlock()`: Safari and iOS Safari `version_added: false` ([BCD ScreenOrientation.json](https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/ScreenOrientation.json)). MDN also notes locking typically requires fullscreen and mobile ([MDN lock()](https://developer.mozilla.org/en-US/docs/Web/API/ScreenOrientation/lock)).
- **Manifest `orientation`:** Safari `false`, iOS mirrors it ([BCD orientation.json](https://raw.githubusercontent.com/mdn/browser-compat-data/main/manifests/webapp/orientation.json)). It is still harmless to include for Android Chrome.
- **Best workaround:** Detect portrait (`matchMedia('(orientation: portrait)')` or `innerWidth < innerHeight`) and show a full-screen "Rotate your phone" overlay that blocks input; call `screen.orientation.lock?.('landscape')` opportunistically for Android/desktop. Design is advice, not a sourced claim. Note that iOS users with Portrait Orientation Lock enabled in Control Center will never rotate; the overlay copy should say so (**UNVERIFIED**, general iOS behavior).
- **Audio autoplay:** audio generally cannot start without user interaction; programmatic playback before any interaction is blocked ([MDN Autoplay guide](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay)). Web Audio start outside a user input event is subject to the same rules (same page). WebKit's [autoplay post (2017-06-08)](https://webkit.org/blog/7734/auto-play-policy-changes-for-macos/) says to assume `<audio>`/`<video>` needs a user gesture; its iOS specifics are not on that page. Practical rule: show a "Tap to join" screen, and create/`resume()` the `AudioContext` and unlock sounds in that tap handler.
- **WebSockets and backgrounding:** I found no official Apple/WebKit statement guaranteeing sockets survive backgrounding. Apple Developer Forum answers say what matters is whether the app is running or suspended, and iOS usually suspends shortly after backgrounding; dead sockets may fire no `onclose` ([Apple forums, thread 716118](https://developer.apple.com/forums/thread/716118) and related search hits). Treat sockets as dying whenever the PWA is backgrounded or the phone locks. Official status for Home Screen web apps specifically: **UNVERIFIED**.
- **iOS 26.0 regression:** [WebKit bug 298616](https://bugs.webkit.org/show_bug.cgi?id=298616) (reported 2025-09-09): WebSocket handshakes failed (HTTP 400) in Safari and standalone mode on iOS 26, apparently over HTTP/3; workaround was disabling HTTP/3 on the server; fixed in iOS 26.1 (confirmed 2025-11-05). Cloudflare serves HTTP/3 by default, so iOS 26.0 devices could be hit; the 26.1+ fix means this is mostly historical in Nov 2026.

### Implications for the 60 s reconnect grace
- A phone that locks or app-switches may be suspended within seconds and its socket silently dropped, so the server will see the close (or an app-level heartbeat timeout) and start the grace period. A 60 s grace is workable for quick app switches, but a player who locks the phone for >60 s loses the seat unless you extend or make it soft.
- Client: on `visibilitychange` to visible (and `pageshow`), immediately check the socket (send a ping, expect a pong within ~2 s) and reconnect with a session token; do not trust `readyState`.
- Server: identify players by a session token stored in `localStorage`; keep seats reserved (marked "away") and auto-play or skip turns rather than evicting. Consider 60 s for "disconnected" UI and a longer hard eviction.
- Heartbeat: use `setWebSocketAutoResponse` so pings do not wake or bill the DO.

### Risks & gotchas
- No orientation lock on iOS: overlay is mandatory; Portrait lock in Control Center defeats rotation.
- Home Screen web apps are separate storage contexts from Safari: players who first joined in Safari then installed lose `localStorage` session; use a join code + name rejoin flow.
- Autoplay: first sound must follow a tap; audio can be interrupted by phone calls/silent mode (iOS ring switch behavior for Web Audio is **UNVERIFIED**).
- Service worker staleness (see Q2).
- iOS 26.0 WebSocket bug (fixed in 26.1): tell players on 26.0 to update.
- The WebSocket-in-background behavior should be tested on a real iPhone, not simulator.

## 4. Electron

### Verified facts
- **Current stable: Electron 45.3.1** (Chromium 156.0.8078.96, Node 24.22.2, released 2026-11-11); supported lines are the latest three majors: 45.3.1, 44.11.2, 43.8.9 ([releases.electronjs.org](https://releases.electronjs.org/); policy in [timelines](https://www.electronjs.org/docs/latest/tutorial/electron-timelines): new major every 8 weeks, latest three supported). The fast cadence means upgrading every ~6 months at minimum.
- **Forge vs electron-builder:**
  - Electron Forge is at **8.0.1** (2026-09-29); v8 is ESM-only on Node 22+ ([GitHub release](https://api.github.com/repos/electron/forge/releases/latest)). With pnpm it requires `node-linker=hoisted` ([Forge docs](https://www.electronforge.io/)). Its Squirrel.Windows maker needs "A Windows machine, or a Linux machine with Mono and Wine"; macOS is not listed ([maker-squirrel README](https://raw.githubusercontent.com/electron/forge/main/packages/maker/squirrel/README.md)). Forge has other Windows makers (WiX, etc.), not evaluated here: **UNVERIFIED**.
  - electron-builder **26.18.0** (2026-10-29) builds NSIS, DMG, ZIP; mac defaults to `dmg` + `zip` and the zip is needed for auto-update ([electron-builder macOS docs](https://www.electron.build/docs/mac/); that page documents the unreleased v27 "next" line, the doc for v26 is linked from it). It recommends building arm64 on Apple Silicon and x64 on Intel, or a CI matrix.
  - Building a Windows NSIS target from macOS (Wine requirement) could not be verified; the multi-platform docs URL 404'd: **UNVERIFIED**.
  - **Recommendation:** electron-builder, one CI matrix job per OS/arch. It avoids Forge's pnpm hoisting requirement and Squirrel/Wine constraint, and the app is a thin shell so Forge's plugin ecosystem adds little. Forge is also reasonable if you accept hoisted node_modules.
- **GitHub Actions cost:** "Use of the standard GitHub-hosted runners is free and unlimited on public repositories." The standard-runner table includes `macos-latest` (arm64), `macos-15-intel`, and `windows-latest` ([runners reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)). Private repos draw from the Free plan's $12/month compute allowance: macOS 3-4 core $0.062/min versus Linux $0.006/min, so roughly 190 macOS minutes/month ([GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions); the minute count is my arithmetic from the page's rates). **Recommendation: make the repo public, or build on a private repo only on tag pushes.**
- **Signing facts:**
  - [Electron code-signing docs](https://www.electronjs.org/docs/latest/tutorial/code-signing): macOS blocks unsigned apps unless the user does manual steps (Gatekeeper dialog "The app is damaged"); unsigned/ad-hoc apps misbehave with `safeStorage`, login items, and `autoUpdater` (Squirrel.Mac requires a signed app). Windows blocks unsigned apps with the same kind of workaround.
  - Apple Platform Security: Apple silicon "won't execute native arm64 code without a valid signature", and an ad hoc signature satisfies that ([Apple Platform Security excerpt, Rosetta/Apple silicon](https://support.apple.com/en-qa/guide/security-pdf/secebb113be1/web)); Apple's linker applies a linker-signed ad hoc signature to arm64 output ([Apple forums 791270](https://developer.apple.com/forums/thread/791270)).
  - electron-builder: `mac.sign.identity: null` "skip[s] signing entirely"; `"-"` yields an ad-hoc signature, documented as "app will only run on the machine that built it"; disable Hardened Runtime when not signing ([docs](https://www.electron.build/docs/mac/)). Community reports say `null` leaves the bundle unsealed and arm64 apps are reported as damaged ([agentshed #221](https://github.com/aloong-planet/agentshed/issues/221), [knightbook #30](https://github.com/ninicdennis/knightbook/pull/30); individual project reports, not authoritative). Also a reported regression: ad-hoc builds from 26.0.13 lost camera/mic on arm64 ([electron-builder #9529](https://github.com/electron-userland/electron-builder/issues/9529)); we need neither.
  - How an ad-hoc-signed app behaves when downloaded to another Mac is **UNVERIFIED** (the electron-builder text suggests it will not run there, community practice says it runs after Gatekeeper override). Test on a second Mac before promising anything.

### What users see and EXACT bypass steps

**macOS (Sequoia 15 and later, including current macOS 27)**
- Apple Developer News: in macOS Sequoia, users can "no longer Control-click to override Gatekeeper" for software that is not signed correctly or notarized; they must use System Settings > Privacy & Security ([Apple developer news](https://developer.apple.com/news/?id=saqachfa)). Older Apple pages still describe Control-click; the developer announcement is the authority.
- Steps ([Apple Support: Open a Mac app from an unidentified developer](https://support.apple.com/guide/mac-help/open-a-mac-app-from-an-unidentified-developer-mh40616/mac)):
  1. Open the app (double-click) and dismiss the block dialog.
  2. Apple menu > System Settings > Privacy & Security; scroll to Security.
  3. Click **Open Anyway** next to the app name (available for about an hour after the failed attempt).
  4. Enter the login password, click OK. The app is now an exception and opens normally.
- If the dialog says the app is "damaged" and offers only Move to Trash (the Electron docs show this wording): clear the quarantine attribute in Terminal with `xattr -dr com.apple.quarantine /Applications/Five\ Kingdoms.app`. **UNVERIFIED** against an Apple primary source (it is the commonly used command); only needed if the build is unsealed/unsigned or the download is corrupted. An ad-hoc signed build (`identity: "-"`) should avoid this on arm64.
- Distribute the DMG or ZIP via a GitHub Release; browser downloads set quarantine; the same file fetched with `curl` does not (**UNVERIFIED** this session).

**Windows 10/11**
- SmartScreen with no signature shows "Windows protected your PC"; the user must choose "Run anyway" (More info first); self-signed behaves the same ([Microsoft Learn, SmartScreen reputation, ms.date 2026-05-04](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation)). Steps: run the installer > **More info** > **Run anyway**.
- Unsigned files must build reputation anew for each version; EV certificates no longer bypass SmartScreen; Artifact Signing starts at $9.99/month and is the Microsoft-recommended non-Store route (same page). Out of budget, and not available in all countries per Electron docs.
- **Windows 11 Smart App Control** "will block execution of unsigned files unless the file has a positive reputation" and checks all executables (same page). There is no "Run anyway" in that case. Users with Smart App Control on (typically fresh Windows 11 installs, **UNVERIFIED** here) must turn it off in Windows Security > App & browser control > Smart App Control (**UNVERIFIED** path) or use the PWA instead.

### Bundled build vs hosted URL
**Recommendation: load the bundled web build through a custom `app://` protocol.** Reasons:
- Works offline for the UI and lets the Electron app reuse the same `dist` as the PWA; the game server is still remote over `wss://`.
- `file://` is non-standard: relative URLs, absolute-path assets (`/assets/...` from Expo's export), service workers, and `fetch` behave poorly. Electron's [protocol docs](https://www.electronjs.org/docs/latest/api/protocol) give an `app://` pattern: `registerSchemesAsPrivileged` (standard, secure, supportFetchAPI) before `ready`, then `protocol.handle` serving the bundle directory with path-traversal rejection. SPA fallback to `index.html` is a few lines in the handler.
- Hosted URL is simpler (always up to date, no auto-update needed) but breaks without the host and means unsigned installers carry no code. Because unsigned apps cannot use Squirrel auto-update, a bundled build forces manual re-download for each client update. A reasonable hybrid: bundled shell that checks a version endpoint and tells players to re-download only when the wire protocol changes; keep protocol versioned and backwards compatible for a few weeks.
- Set `contextIsolation: true`, no Node integration in the renderer, and restrict navigation to the `app://` origin and your Worker host ([Electron security checklist](https://www.electronjs.org/docs/latest/tutorial/security), standard guidance; not re-fetched).

### Risks & gotchas
- Unsigned builds cannot auto-update on macOS (Squirrel.Mac needs signed app) and Windows users re-hit SmartScreen on every new version.
- Windows Smart App Control can make the Windows build unusable for some users; the PWA is the fallback.
- Expo web export uses absolute asset paths; serve from `app://` host root, not `file://`.
- Electron major every 8 weeks, only the latest three supported; an unmaintained shell accumulates Chromium CVEs.
- arm64 needs at least ad-hoc signing; use `mac.sign.identity: "-"`, Hardened Runtime off, build x64 on `macos-15-intel` and arm64 on `macos-latest`.
- Private-repo CI minutes for macOS are scarce (~190/month) so make the repo public or build rarely.
- Expo web build size in a desktop shell is fine; WebSockets and `AudioContext` autoplay in Electron may also require a user gesture (**UNVERIFIED**; set `autoplayPolicy: 'no-user-gesture-required'` in webPreferences if needed, documented Electron option, not re-fetched).

## 5. react-native-macos / react-native-windows

**Confirmed: both lag core React Native, and Expo SDK 58 doesn't support macOS.** From the npm registry on 2026-11-11, core `react-native` is 0.88.1 (published 2026-10-27) and 0.89.0-rc.1 is in `next`, while `react-native-macos@latest` is 0.83.0 (2026-09-30; peer `react-native` 0.83.10; its `next` tag is 0.81.0), about five minor versions behind, and `react-native-windows@latest` is 0.85.0 (2026-10-19; peer `react-native ^0.85.0`), three minors behind ([npm: react-native](https://registry.npmjs.org/react-native), [react-native-macos](https://registry.npmjs.org/react-native-macos), [react-native-windows](https://registry.npmjs.org/react-native-windows)). Expo SDK 58 states plainly that it "does not support macOS yet" ([SDK 58 post](https://expo.dev/changelog/sdk-58)), and its RN 0.88 is newer than either target, so Expo's pinned native libraries (Reanimated 4.7, Gesture Handler 3.3, worklets 0.13) cannot be assumed to match the macOS/Windows forks. Gesture Handler's docs list macOS as a platform ([getting started](https://docs.swmansion.com/react-native-gesture-handler/docs/fundamentals/getting-started/)), but per-library status for Reanimated 4 on macOS/Windows could not be verified from primary sources: **UNVERIFIED**; treat "animation libs are limited" as probable, not proven. Our Electron-on-web-build plan avoids the whole problem.

### Risks & gotchas
- Choosing the native-desktop forks would pin the entire app below Expo SDK 58's RN and lose Expo tooling.
- The versions above were read from npm at one moment and drift; re-check if this decision is revisited.

## Open items (all UNVERIFIED above, cheap to settle by experiment)
1. Wrangler bundling a `workspace:*` TS package (run `wrangler deploy --dry-run --outdir dist`).
2. DO WebSocket-handler CPU cap on Free (10 ms vs 30 s); measure CPU per move.
3. Whether auto-response pings count in the 20:1 billing, and whether static assets/WS-upgrade Worker requests count against 100k.
4. Ad-hoc-signed Electron app launching on a second Mac after download; `xattr` need.
5. NSIS build from macOS (use CI instead).
6. Reanimated web performance on a mid-range iPhone with 7-player table.
7. Real iPhone backgrounding behavior of WebSockets in standalone mode.
