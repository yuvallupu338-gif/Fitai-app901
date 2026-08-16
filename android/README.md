# FitAI as an Android app

<div dir="rtl">

עטיפת אנדרואיד ל‑`app/`. אין כאן כתיבה מחדש — האפליקציה רצה בדיוק כפי שהיא,
מתוך `assets/`, ב‑WebView שמגיש אותה מ‑origin אמיתי של https.

</div>

```bash
export ANDROID_HOME=/path/to/android-sdk
node android/tools/build-apk.mjs            # -> dist/FitAI-debug.apk
```

No Android SDK to hand? Push, and `.github/workflows/android.yml` builds it on a
runner that has one and attaches the APK to the run.

---

## What this is

`app/` is already a complete offline application: static files, everything in
`localStorage`, no network calls. So the Android side is a shell — one activity,
about forty lines — and the build is mostly a file copy.

| | |
|---|---|
| package | `com.fitai.app` |
| min / target SDK | 24 (Android 7) / 34 |
| size | ~21 MB — 23.4 MB of assets, which are base64 text and halve under the packager's deflate |
| permissions | none |
| signature | debug, for sideloading — see below for a release |

### Why a WebView and not a rewrite

Nothing in this app wants to be native. It draws its own interface, keeps its
own data, and talks to nobody; a Kotlin rewrite would reproduce 4,500 lines of
working logic in order to change nothing the user can see. The wrapper is the
smaller and more honest option, and it means one codebase stays the truth.

### The one part that is not obvious

`MainActivity` serves the assets through `WebViewAssetLoader`, on
`https://appassets.androidplatform.net/`, rather than loading
`file:///android_asset/index.html` the way most WebView wrappers do.

That is not a preference. The app carries its own Content-Security-Policy and it
says `script-src 'self'`. Under a `file://` origin `'self'` matches nothing, so
all fifty scripts would be refused and the app would open as a blank page — the
same reason `app/` needs a server on the web. The asset loader gives it a real
origin, and everything resolves exactly as it does in a browser.

That origin is also what `localStorage` is keyed on. **Changing the domain in
`MainActivity` orphans every existing user's profile**, which is why it is a
constant with a comment on it rather than a string in a builder call.

### No permissions

The manifest declares none. The merged manifest picks up one —
`DYNAMIC_RECEIVER_NOT_EXPORTED`, which AndroidX adds to itself for targetSdk
33+ — but it is the app's own signature-level permission, not something the user
is asked to grant. The install screen shows nothing.

---

## Verifying a build

An emulator is the obvious test and is not always available. What is always
available is testing the bytes that actually shipped:

```bash
mkdir -p /tmp/apk && cd /tmp/apk
unzip -q dist/FitAI-debug.apk 'assets/*'
npx http-server -p 8097 -c-1 --silent /tmp/apk &
node app/tools/smoke.mjs          http://127.0.0.1:8097/assets/index.html
node app/tools/security-check.mjs http://127.0.0.1:8097/assets/index.html
```

Serving from a `/assets/` path is the same shape `WebViewAssetLoader` maps them
to, so this exercises the packaged tree at the packaged depth: a file the copy
missed, a relative path that assumed a different level, or a policy that stopped
resolving would all show up here. Both suites pass on the current build — the
questionnaire completes, all six tabs render, the profile survives a reload, no
console errors, and the CSP still refuses an injected handler.

What it does not cover is Android itself: the WebView's own quirks, the launcher
icon on a real device, and how the back key feels. Those need hardware or an
emulator.

## A release signature

The APK is debug-signed, which is what a sideloaded build wants and is not
something Play will take. For a release, make a key you keep:

```bash
keytool -genkeypair -v -keystore fitai-release.jks -keyalg RSA -keysize 4096 \
        -validity 10000 -alias fitai
```

then add a `signingConfigs` block to `app/build.gradle` reading the password from
the environment — never from a file in the repository — and build with
`node android/tools/build-apk.mjs --release`. Keep that keystore: Play ties the
app's identity to it, and losing it means the app can never be updated again.

## What is generated

`app/src/main/assets/` is copied from `app/` on every build and is gitignored —
23 MB has no business being in the tree twice.

The `mipmap-*` icons are also cut fresh on every build, from
`app/assets/logo-source.png`, but they *are* committed: they are about 100 KB in
total, and having them in the tree means anyone with only an Android SDK can run
`gradle assembleDebug` without a headless browser to redraw them. Either way the
source of truth is the artwork, so the APK's contents cannot quietly drift from
the web app's.
