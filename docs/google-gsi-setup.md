/**
 * Google Identity Services (GSI) setup for Synapse
 *
 * Official guide:
 * https://developers.google.cn/identity/gsi/web/guides/get-google-api-clientid
 *
 * This project uses GSI **Sign In With Google** button on the web frontend.
 * The browser receives a Google ID token (JWT) and the backend verifies it with
 * `google-auth-library` (`verifyIdToken` + audience = Client ID).
 * No OAuth authorization-code redirect or client secret is required for main-site GSI login.
 */

# 1. Create a Google Cloud project
1. Open [Google Cloud Console](https://console.cloud.google.com/).
2. Create or select a project.

# 2. Configure the OAuth consent screen
1. Go to **APIs & Services → OAuth consent screen**.
2. Choose **External** (or Internal for Workspace-only).
3. Fill app name, support email, developer contact.
4. Add scopes if prompted; GSI basic profile/email is sufficient for this product.
5. Add test users while the app is in Testing.

# 3. Create a **Web application** OAuth client (required)
1. Go to **APIs & Services → Credentials**.
2. **Create credentials → OAuth client ID**.
3. Application type: **Web application** (not Desktop / iOS / Android / TV).
4. Name it e.g. `Synapse GSI`.
5. **Authorized JavaScript origins** (must match the browser origin exactly, no path):
   - Production: `https://tts.chloemlla.com` (or your real frontend origin)
   - Local Vite: `http://localhost:3001`
   - Local alternate: `http://127.0.0.1:3001`
6. **Authorized redirect URIs** are optional for GSI button/`ux_mode=popup` id_token flow.
   Only add redirect URIs if you later adopt a full OAuth redirect code flow.
7. Create and copy the **Client ID** (`….apps.googleusercontent.com`).
8. Optionally download the JSON — it should look like:

```json
{
  "web": {
    "client_id": "xxxxx.apps.googleusercontent.com",
    "project_id": "your-project",
    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
    "token_uri": "https://oauth2.googleapis.com/token",
    "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
    "javascript_origins": [
      "https://tts.chloemlla.com",
      "http://localhost:3001"
    ]
  }
}
```

> Important: a JSON rooted at `"installed": { ... }` is a **Desktop** client and **cannot** be used for GSI Web Sign-In. The admin importer will reject it.

# 4. Configure Synapse

## Option A — Admin runtime config (recommended)
1. Sign in as admin → Env / Runtime Config → **Google Auth 运行时配置**.
2. Paste the Client ID, or **导入 JSON** (web type only).
3. Save. Main-site login/register Google buttons appear when Client ID is set.

## Option B — Environment defaults
Set either or both:

```env
# Main-site GSI (also used as NexAI fallback if NEXAI_GOOGLE_CLIENT_ID is empty)
GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com

# Optional separate NexAI Google client
NEXAI_GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com

# Optional Synapse Android SIWG serverClientId override
SYNAPSE_ANDROID_GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com

# Optional Synapse Android Digital Asset Links defaults
SYNAPSE_ANDROID_PACKAGE_NAME=com.synapse.mobile
SYNAPSE_ANDROID_SHA256_CERT_FINGERPRINTS=E9:D8:5A:D2:52:C3:8D:86:C6:E4:B2:A8:C0:49:B8:B5:A9:FA:79:AC:6E:BB:11:8C:94:0A:83:03:B6:96:39:98
SYNAPSE_ANDROID_DISABLED=false
```

These seed Mongo runtime defaults on process start. Admin UI values stored under `GOOGLE_AUTH` and `SYNAPSE_ANDROID` override their corresponding startup defaults after save.

Synapse Android uses `GET /api/auth/google/config?client=synapse-android`. When the dedicated value is empty, the response falls back to `GOOGLE_CLIENT_ID`. Google ID token verification accepts both configured Web Client IDs, while the existing web config response remains unchanged.

# 5. What the app already does
| Layer | Behavior |
| --- | --- |
| Frontend | Loads `https://accounts.google.com/gsi/client`, `google.accounts.id.initialize` + `renderButton` |
| Frontend | Posts `idToken` to `/api/auth/google` or bind endpoints |
| Backend | Verifies JWT audience = configured Client ID |
| CSP | Allows `accounts.google.com`, `www.gstatic.com`, Google font/API hosts |
| COOP | `same-origin-allow-popups` for GSI popup compatibility |
| Admin | Rejects Desktop/Installed-only JSON; validates `*.apps.googleusercontent.com` |

# 6. Common failures
| Symptom | Likely cause |
| --- | --- |
| Google button missing | Client ID not configured / disabled |
| `origin_mismatch` / button error | Origin not listed in Authorized JavaScript origins |
| Import fails with Desktop message | Used `installed` OAuth client JSON |
| Token verify fails | Wrong Client ID, or token audience mismatch |
| Script load error | Network block / CSP missing `accounts.google.com` |

# 7. NexAI note
NexAI uses a separate runtime key `NEXAI.google.clientId` (env `NEXAI_GOOGLE_CLIENT_ID`). It is independent from main-site `GOOGLE_AUTH`, but may share the same Web Client ID if both UIs use the same origin set.
