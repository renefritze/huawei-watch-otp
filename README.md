# OTPWatch

A TOTP authenticator app for Huawei LiteWearable (HarmonyOS, round ~466 × 466 px display).

All TOTP/HOTP cryptography (RFC 6238 / RFC 4226) is implemented in **pure vanilla JS** with
zero dependencies — no `crypto.subtle`, no Node builtins — so it runs on the JerryScript engine
embedded in the LiteWearable runtime.

---

## 1. Overview

OTPWatch stores TOTP accounts on-device and generates time-based one-time passwords that refresh
every 30 seconds. The main screen shows all configured accounts with their current 6-digit codes
and a circular countdown arc. Tapping an account copies the code to the clipboard; long-pressing
opens a delete confirmation.

Built because most wearable TOTP apps require a companion phone app or cloud sync — this one
needs neither.

---

## 2. Prerequisites

| Tool | Notes |
|------|-------|
| Huawei Developer account | Required to sign `.hap` files for real hardware |
| JDK 17+ | Required by hvigor |
| `hdc` CLI | For flashing `.hap` to device over USB |
| DevEco Studio 3.1+ *(optional)* | The IDE; not required for CLI builds |

---

## 3. One-time signing setup

### Generate keystore + CSR

```bash
# Generate a 2048-bit RSA keystore
keytool -genkeypair \
  -alias otp_watch_key \
  -keyalg RSA \
  -keysize 2048 \
  -validity 3650 \
  -keystore signing/otp_watch.p12 \
  -storetype PKCS12

# Export a CSR to submit to AppGallery Connect
keytool -certreq \
  -alias otp_watch_key \
  -keystore signing/otp_watch.p12 \
  -file signing/otp_watch.csr
```

### AppGallery Connect

1. Log in to [AppGallery Connect](https://developer.huawei.com/consumer/en/service/josp/agc/index.html).
2. Navigate to **Users and permissions → Certificates** → upload `signing/otp_watch.csr`
   and download the resulting **`.cer`** file → save as `signing/otp_watch.cer`.
3. Navigate to **My Projects → your project → HarmonyOS app → HAP Packages** →
   **Manage Profiles** → create a debugging or distribution profile and download the
   **`.p7b`** file → save as `signing/profile.p7b`.

### Encode for GitHub Secrets

```bash
base64 -w 0 signing/otp_watch.p12 | xclip -selection clipboard
# Paste as secret:  SIGNING_KEYSTORE_B64

base64 -w 0 signing/otp_watch.cer | xclip -selection clipboard
# Paste as secret:  SIGNING_CERT_B64

base64 -w 0 signing/profile.p7b   | xclip -selection clipboard
# Paste as secret:  SIGNING_PROFILE_B64
```

Add two more secrets for the passwords you chose during key generation:

| Secret name | Value |
|-------------|-------|
| `SIGNING_STORE_PASSWORD` | keystore password |
| `SIGNING_KEY_PASSWORD`   | key entry password |

The `signing/` directory is `.gitignore`d — never commit these files.

---

## 4. Local development

### Install toolchain (without DevEco Studio)

```bash
# 1. Download the HarmonyOS command-line tools from
#    https://developer.huawei.com/consumer/en/doc/harmonyos-guides/ide-command-line-building-0000001053439524
#    and extract to ~/harmonyos-sdk

# 2. Install ohpm
npm install -g @ohos/ohpm

# 3. hvigorw is a wrapper script bundled in the project root after first build;
#    alternatively download hvigor globally:
npm install -g @ohos/hvigor @ohos/hvigor-ohos-plugin
```

### Build

```bash
# Install JS dependencies (none at present, but sets up hvigor plugins)
ohpm install --all

# Build a debug HAP
hvigorw assembleHap --mode module -p product=default --no-parallel --no-daemon --stacktrace
```

The signed HAP lands at:

```
entry/build/default/outputs/default/entry-default-signed.hap
```

### Flash to device

```bash
# Ensure the watch is in developer mode and connected over USB
hdc install entry/build/default/outputs/default/entry-default-signed.hap
```

---

## 5. CI/CD

The GitHub Actions workflow (`.github/workflows/build.yml`) triggers on every push to `main`,
on pull requests targeting `main`, and on manual dispatch. It:

1. Checks out the repo.
2. Sets up `ohpm` and `hvigorw` via `Snapp-Mobile/oh-action@v0.1`.
3. Decodes the signing files from base64 secrets into `signing/`.
4. Patches placeholder passwords in `build-profile.json5` with real secret values.
5. Runs `ohpm install --all` then `hvigorw assembleHap`.
6. Uploads the built `.hap` as a workflow artifact named `otp-watch-hap`.

---

## 6. Adding accounts

1. Open OTPWatch on the watch.
2. Tap **+** (top-right corner, or centre button on empty screen).
3. Enter the **account name** (e.g. "GitHub") and the **Base32 secret key** (the string
   shown when you enable 2FA in a service's settings — it looks like `JBSWY3DPEHPK3PXP`).
4. Tap **Save**. The app validates the secret before storing it.

Secrets are stored on-device via the LiteWearable storage API and are never transmitted
over any network.

---

## 7. Security notes

- **On-device only.** Secrets are stored with `@system.storage` on the watch itself.
  HarmonyOS LiteWearable storage is local to the device and is not cloud-synced.
- **No network access.** The app declares no network permissions and makes no outbound
  connections. Time is read from `Date.now()` (device clock).
- **No special permissions.** The app does not request any sensitive permissions
  (`READ_CONTACTS`, location, etc.).
- **Clipboard.** When you tap an account, the code is copied to the on-device clipboard
  via `@system.clipboard`. The clipboard is cleared when the watch screen turns off on
  most firmware versions.
- **Backup caveat.** If you factory-reset the watch, stored secrets are lost. Export your
  recovery codes from each service before relying solely on OTPWatch.
