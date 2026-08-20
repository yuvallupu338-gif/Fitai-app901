# vendor/

Third-party code, checked in rather than fetched.

## web-llm.js

`@mlc-ai/web-llm` 0.2.84, Apache-2.0, copied verbatim from the npm tarball —
`lib/index.js` from `https://registry.npmjs.org/@mlc-ai/web-llm/-/web-llm-0.2.84.tgz`.
`web-llm.provenance.json` records exactly what was taken and `web-llm.LICENSE` is
the licence that came with it.

It is here rather than loaded from a CDN so that `script-src` can stay `'self'`.
This origin also holds the FitAI API keys, and a CDN in `script-src` is a
standing offer to whoever compromises that CDN: they get to run script here, and
the keys go with it. Six and a half megabytes in the repository is a smaller
price than that.

It is the only third-party file in a repository whose whole point is that it has
no dependencies, and that is worth being uncomfortable about. It is confined to
one directory, loaded only when somebody switches the local model on, and
nothing else in the app imports it.

### Updating it

Fetch the tarball, copy `lib/index.js`, and update the provenance file. Then run
the model once in a browser with WebGPU — the version in the library and the
version in the model-library URLs (`modelVersion` inside it) have to agree, and
a mismatch shows up as a download that 404s rather than as an error anybody can
read.
