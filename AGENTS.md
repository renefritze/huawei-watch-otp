# Agent guidance — OTPWatch

OTPWatch is a TOTP authenticator for Huawei LiteWearable (HarmonyOS, ~466×466 px round display).
All cryptography is pure-JS with zero dependencies so it runs on JerryScript (the embedded engine).

## Runtime constraints

- **No `crypto.subtle`, no Node builtins, no npm packages.** The device runtime is JerryScript.
  Keep all code in `entry/src/main/js/` strictly ES5-compatible and self-contained.
- **`var`, not `let`/`const`.** The biome config explicitly disables the `noVar` rule because
  JerryScript does not support block scoping reliably.
- **No template literals, no optional chaining, no nullish coalescing.** Biome rules reflect this.

## Code style

Formatting and linting are enforced by Biome (`biome.json`):

```
npx @biomejs/biome check --write entry/src/main/js/
```

The pre-commit hook runs this automatically. Never skip it (`--no-verify`).
Key settings: 2-space indent, single quotes, semicolons, line width 100, trailing commas off.

## Project layout

```
entry/src/main/js/default/
  app.js                  # LiteWearable app lifecycle
  common/totp.js          # RFC 6238 / RFC 4226 crypto — the only shared module
  pages/index/            # Main account list + countdown arc
  pages/add/              # Add-account form (name + Base32 secret)
```

## Crypto module (`totp.js`)

`base32Decode` → `sha1` → `hmacSha1` → `hotp` → `totp`.
All functions are exported via `module.exports`.  Any change here must preserve the
public API (`base32Decode`, `hmacSha1`, `hotp`, `totp`, `secondsUntilNextCode`).

## Storage

Accounts are persisted with `@system.storage` (HarmonyOS LiteWearable API).
No network permissions are declared; the app is entirely offline.

## Building

```bash
ohpm install --all
hvigorw assembleHap --mode module -p product=default --no-parallel --no-daemon --stacktrace
```

Output: `entry/build/default/outputs/default/entry-default-signed.hap`

Signing material lives in `signing/` which is `.gitignore`d. CI reconstructs it from
base64-encoded GitHub Secrets (`SIGNING_KEYSTORE_B64`, `SIGNING_CERT_B64`, `SIGNING_PROFILE_B64`,
`SIGNING_STORE_PASSWORD`, `SIGNING_KEY_PASSWORD`).

## What to avoid

- Do not introduce any npm/ohpm runtime dependency — zero-dependency is a hard requirement.
- Do not use ES6+ syntax (`let`, `const`, arrow functions, classes, `Promise`, `async/await`).
- Do not add network permissions or any outbound calls.
- Do not commit anything under `signing/`.
