# TurboScribe.ai — Public Product Features & Integration Surface

**Research date:** 2026-07-21  
**Purpose:** Comparison-oriented inventory of publicly documented TurboScribe product features, pricing/auth model, and developer/integration surface.  
**Scope:** Official site, blog, legal pages (live + Internet Archive), company site, and secondary public discussion. Live product shell pages (`/`, `/pricing`, many blog posts) returned **HTTP 403** to non-browser / automated clients during this research; content below relies heavily on [Internet Archive](https://web.archive.org/) captures and the still-public live blog index.

---

## 1. Product overview

| Item | Public claim |
|------|----------------|
| Product | **TurboScribe** — AI audio/video → text transcription |
| Site | https://turboscribe.ai |
| Engine | OpenAI **Whisper** family, run **in-house** (no third-party transcription APIs per security FAQ) |
| Accuracy claim | **~99.8%** on common languages (marketing) |
| Scale claims (official social) | **98+ languages**, **10M+ hours** transcribed, millions of users |
| Product model | Consumer/prosumer **web app** (upload → transcribe → edit/export); not an API-first platform |

Positioning (launch, Aug 2023): “world’s first unlimited and affordable AI transcription,” flat subscription rather than per-minute metering.

---

## 2. Transcription modes, languages, advanced settings

### 2.1 Transcription modes (Cheetah / Dolphin / Whale)

Documented in official blog *Transcription Modes, Explained* (2023-08-23, Leif Foged).

| Mode | Role | Approx. speed (1 hour audio) | Whisper model (as of 2023 post) |
|------|------|------------------------------|--------------------------------|
| **Cheetah** | Fastest | ~20–45 seconds / ~30 seconds marketing | `base` (~74M params); early site also mentioned `base.en` |
| **Dolphin** | Balanced accuracy/speed | ~3 minutes | `small` (~244M); early site also `small.en` |
| **Whale** | Max accuracy (default) | &lt;10 minutes (examples also ~3 min on GPU) | `large` / **large-v2** (~1.55B params) |

**User guidance (official):** Start with **Whale** for accuracy; switch to Dolphin/Cheetah when speed matters.  
**Free tier:** Whale was opened to free users (Sep 2023); free tier historically had 3–4 files/day depending on period (see Pricing).

**Under the hood notes from official post:**

- GPU cluster for speed; times vary with file size, silent audio, preprocessing.
- Larger models better at contextual disambiguation (e.g., “Habeas Corpus” vs. phonetic errors).
- Uses **file metadata** (filename, title, description) to improve ambiguous terms (names, etc.).

### 2.2 Audio languages

- **Transcription:** **98+ spoken languages** (product-wide claim).
- Upload flow: user **selects audio language** after file upload (*Getting Started*, 2024).
- Marketing “best results” language list (homepage FAQ, 2023 archive) includes e.g. English, Spanish, French, German, Italian, Portuguese, Dutch, Chinese, Japanese, Russian, Arabic, Hindi, Nordic languages, many European languages, Korean, Tagalog, Indonesian, Thai, Turkish, Hebrew, Vietnamese, and others (partial list in sources).
- **Translate speech → English** called out as a Whisper-era capability on marketing pages (“Transcribe audio in any language directly to English”).

### 2.3 Translation (text)

- **Post-transcript translation** to **134+ languages** (pricing/feature bullets; Getting Started “Translation Tool”).
- Applies to transcripts and subtitles in marketing copy.

### 2.4 Speaker recognition (diarization)

From *Getting Started with TurboScribe*:

- Optional **Speaker Recognition** for multi-speaker audio (meetings, interviews, podcasts).
- Options: **specify speaker count** or **“Detect Automatically”**.
- Auto-detect can improve separation but may **overestimate** speaker count.
- Transcript shows speaker labels (examples in modes blog: “Speaker 1”, “Speaker 2”).
- Click-to-play: click transcript text to scrub/play audio at that timestamp.

### 2.5 Upload / media settings

| Setting | Free (public) | Unlimited (public) |
|---------|---------------|--------------------|
| Max duration / file | **30 minutes** | **10 hours** |
| Max size / file | (not always stated on free) | **5 GB** |
| Concurrent upload | **1 file** at a time | **Up to 50 files** at a time |
| Queue priority | Lower | Highest (auto-scale GPU capacity; parallel jobs) |
| Storage | Account storage | Marketing: **unlimited storage** |

**Supported media formats (homepage FAQ archive):**  
MP3, M4A, MP4, MOV, AAC, WAV, OGG, OPUS, MPEG, WMA, WMV, AVI, FLAC, AIFF, ALAC, 3GP, MKV, WEBM, VOB, RMVB, MTS, TS, QuickTime, DivX, and “more.”

**Not strongly documented publicly as first-class product features:**

- Explicit **verbatim vs. cleaned** toggle (users treat output as high-fidelity/verbatim-ish Whisper text; no official “verbatim mode” named).
- Native **YouTube URL** import (common user workflow is download then upload; not confirmed as official feature in primary docs retrieved).
- Dedicated **changelog** or **status page** (no public `status.turboscribe.ai` content retrieved).

---

## 3. Export formats

### 3.1 Confirmed formats

| Format | Documented |
|--------|------------|
| **TXT** | Yes — simple download + bulk |
| **DOCX** (Microsoft Word) | Yes |
| **PDF** | Yes |
| **CSV** | Yes |
| **SRT** | Yes (subtitles) |
| **VTT** | Yes (subtitles) |
| **JSON** | Yes on **launch/early homepage** (“PDF, DOCX, VTT, SRT, JSON, CSV, TXT”); **not** listed in later bulk-export blog (PDF, DOCX, TXT, CSV, VTT, SRT). Treat JSON as historically advertised; re-verify in UI. |

**UI labels (Getting Started):**

- Quick download examples: **TXT, DOCX, SRT**.
- **“Advanced Export”** for timestamps and additional formats.

### 3.2 Bulk export

From *Export Transcripts and Manage Files in Bulk* (2023-09-14):

- Multi-select files → **Bulk Actions** bar.
- Export **up to 50 transcripts** at once, choice of format(s).
- Bundled as a **ZIP** download.
- Folder export: security FAQ states entire folders up to **1,000 transcripts** at a time.

### 3.3 Related non-file “exports”

- **ChatGPT prompt pack** (copy prompts for summaries, outlines, blog posts, social, discussion questions); long transcripts auto-split for context limits.
- Later product: **TurboScribe GPT** (blog, May 2024) — “transcribe and chat with audio & video using ChatGPT.”
- Footer link **WhatsApp** (integration/channel; page not archived in this research).

---

## 4. File management

Publicly documented capabilities:

| Action | Support | Notes |
|--------|---------|--------|
| **Organize folders** | Yes | Create folders; bulk **move** between folders |
| **Bulk delete** | Yes | Multi-file delete; delete folder deletes contents |
| **Delete single file** | Yes | Permanent; not recoverable (security FAQ) |
| **Download original media** | Yes | “Download any media files or transcripts at any time” (security FAQ) |
| **Bulk export transcripts** | Yes | See §3.2 |
| **Share transcripts** | Implied | Privacy FAQ: “Unless you **share** your transcripts with others, only you can view or edit…” — share mechanism details (link, email, permissions) **not** fully documented in retrieved pages |
| **Rename** | Not explicitly documented | Not covered in bulk-actions blog text retrieved |
| **Edit transcript in-app** | Yes (editor) | Click-to-play sync; timestamps show/hide |
| **Translate in place** | Yes | Translation tool |

Account deletion: content inaccessible immediately; purged from active systems ~7 days (Terms) / backups ~90 days (Privacy/Terms).

---

## 5. Pricing & authentication model

### 5.1 Plans (public marketing, 2023–2025 archives + consistent social)

| Plan | Price (public) | Limits / features |
|------|----------------|-------------------|
| **TurboScribe Free** | $0 | **3 transcripts/day** in recent marketing/X (some 2023 pages said **4/day**); **30 min**/file; 1 concurrent upload; lower priority; modes including Whale (after Sep 2023) |
| **TurboScribe Unlimited** | **$20/month** billed monthly, or **$10/month** (**$120/year**, “save 50%”) | Unlimited transcriptions **for one person**; 10 h / 5 GB files; 50 concurrent uploads; all modes; translation 134+; bulk export; unlimited storage; highest priority |
| **TurboScribe for Teams** | Not publicly itemized $ on pages retrieved | Blog (Jun 2024): “Simplified billing and unlimited transcription for **multiple users**”; official X: consolidated billing + access management |

**“Unlimited” rules (official):**

- No overall hour caps/quotas in marketing; examples include hundreds to 1,000+ hours/month.
- **Do not share login/account** (single-person Unlimited).
- Soft practical limits: per-file 10 h / 5 GB; concurrency; some users report heavier enforcement/billing friction (anecdotal, secondary sources).

**Payments:** **Stripe**; card data not stored on TurboScribe servers.  
**Refunds:** Terms (2022 archive) state purchases generally **non-refundable**; early homepage also advertised a **30-day satisfaction guarantee** if &lt;25 hours transcribed (email `leif@turboscribe.ai`) — may conflict with Terms; treat as historical/marketing.

### 5.2 Auth / access model

| Mechanism | Public evidence |
|-----------|-----------------|
| **Email + password** sign-up | Homepage CTAs |
| **Google** sign-in | “Start for free with Google” |
| **Log In / Sign Up** web accounts | Required for dashboard (free tier still account-based in Getting Started) |
| **Bots/automated signup** | Forbidden (Terms: “You must be a human”) |
| **API keys / OAuth apps** | **No public developer OAuth/API key product** found |

**Not a developer API product.** Auth is end-user SaaS (email/Google + session), not programmatic access credentials.

---

## 6. Official API, Zapier, Make.com, webhooks, developer docs

### 6.1 Findings (as of research date)

| Surface | Status |
|---------|--------|
| Public REST/GraphQL **API** | **Not found** — no `/docs`, OpenAPI, or API product page content retrieved; live `/api` returned 403 (same as many pages) |
| **Zapier** app | **No evidence** of official TurboScribe integration |
| **Make.com** / IFTTT | **No evidence** |
| **Webhooks** | **Not documented** publicly |
| **SDK** | **None** public |
| **ChatGPT** | **Product-side** GPT / import helpers (not a public transcription API) |
| **WhatsApp** | Footer link only (details unknown) |

**Secondary signal:** Users publicly wish for an API (“If only it had an api…”), consistent with absence of a documented developer surface.

### 6.2 Automation implications for competitors/comparison

- Integration path today is **UI + export files** (or ChatGPT handoff), not event-driven webhooks.
- Account Terms ban automated account registration; scraping/automating the web UI would likely violate Terms (“bots… not permitted”).

---

## 7. Company identity & related domains

| Entity | Detail |
|--------|--------|
| **Legal entity** | **Leif Erikson Ventures, LLC** (U.S.) — named in Privacy Policy & Terms as operator of products |
| **Holding / brand site** | https://www.leiferiksonventures.com (and leiferiksonventures.com) — minimal page: brand, **contact@leiferiksonventures.com**, prominent link to TurboScribe, footer **©2026 Leif Erikson Ventures, LLC** |
| **Product domain** | https://turboscribe.ai |
| **Founder / owner** | **Leif Foged** — blog author; email **leif@turboscribe.ai**; X @leiffoged (“owner @turboscribe”) |
| **Data residency** | Primary infrastructure in the **United States** |
| **Other products** | Privacy/Terms apply to “all products” of Leif Erikson Ventures, LLC; public venturing site currently highlights **TurboScribe** only |

No public funding/valuation/headcount package found in this pass.

---

## 8. Public content surface: blog, help, legal, status

### 8.1 Blog (live index as of 2026-07-21)

https://turboscribe.ai/blog — accessible during research. Listed posts:

| Date (index) | Title | Theme |
|--------------|-------|--------|
| 2026-01-30 | Getting Started with TurboScribe | Language, speakers, download |
| 2025-03-19 | Security and Privacy FAQ | Privacy/security |
| 2024-06-29 | TurboScribe for Teams and Organizations | Multi-user billing |
| 2024-05-20 | TurboScribe GPT | ChatGPT chat over transcripts |
| 2023-09-14 | Export Transcripts and Manage Files in Bulk | Bulk export/folders/delete |
| 2023-09-13 | Transcribe and Import… into ChatGPT | Prompt import tool |
| 2023-09-08 | TurboScribe Unlimited, Explained | Unlimited plan |
| 2023-09-07 | Free Tier Just Got Bigger (Whale) | Free Whale mode |
| 2023-08-24 | Transcription Modes, Explained | Cheetah/Dolphin/Whale |
| 2023-08-22 | Introducing TurboScribe | Launch |

**Note:** Individual post HTML often **403** to automated clients; many still available via Wayback Machine `id_` captures.

### 8.2 Site nav / footer (recurring)

- **Home, Blog, Pricing, FAQs, Reviews, Support**
- **TurboScribe GPT, WhatsApp**
- **Terms, Privacy**
- CTAs: Log In, Sign Up / Try Free

### 8.3 Legal

| Page | Notes |
|------|--------|
| `/privacy` | Policy applies to Leif Erikson Ventures products; no data sale; AES-256 at rest (security FAQ); U.S. storage |
| `/terms` | Account security, human-only accounts, Stripe-style prepaid billing language, non-refundable baseline, cancellation in-app |

### 8.4 Help center / changelog / status

| Asset | Finding |
|-------|---------|
| Dedicated Help Center (Intercom/Zendesk-style) | **Not confirmed**; “Support” / “Help & Support” footer links |
| Changelog | **No dedicated public changelog** found |
| Status page | **No working public status page** retrieved (`status.turboscribe.ai` 403/unavailable in this environment) |
| FAQs | Product FAQs on homepage + `/FAQs` nav (live `/faq` 403 here); content mirrored in archives |

### 8.5 Official social

- X/Twitter: [@TurboScribe](https://x.com/TurboScribe) — product updates, free tier, Teams, security FAQ links.

---

## 9. Feature matrix (comparison-ready)

| Capability | TurboScribe (public) |
|------------|----------------------|
| STT engine | Whisper (in-house GPUs) |
| Speed/accuracy modes | Cheetah / Dolphin / Whale |
| Languages (transcribe) | 98+ |
| Languages (translate text) | 134+ |
| Speaker diarization | Optional; fixed count or auto |
| Timestamps | Yes; toggle in UI; subtitle formats |
| Export | PDF, DOCX, TXT, CSV, SRT, VTT (+ JSON historically) |
| Bulk ops | Export (≤50 / folder ≤1000), move, delete |
| Folders | Yes |
| Media download | Yes (original uploads) |
| Share | Mentioned; details thin |
| Free tier | 3×30 min/day (current marketing) |
| Paid model | Flat unlimited $10/yr-eq or $20/mo |
| Teams | Multi-user + consolidated billing |
| Public API | **No** |
| Zapier/Make/webhooks | **No public evidence** |
| ChatGPT | GPT product + export/import helpers |
| Company | Leif Erikson Ventures, LLC (Leif Foged) |

---

## 10. Research limitations & confidence

| Topic | Confidence | Caveat |
|-------|------------|--------|
| Modes, exports, bulk, security FAQ, company LLC | **High** | Direct archive/live primary text |
| Live 2026 pricing page exact copy | **Medium** | Live `/pricing` 403; 2024–archive pricing + 2026 social align on $10/$20 and 3/day free |
| JSON export still available | **Medium** | Early marketing yes; bulk post omits |
| Share/rename UX | **Low–medium** | Share implied; rename not documented |
| Teams seat pricing | **Low** | Feature exists; $ not public in sources used |
| No API / no Zapier | **High for “no public docs”** | Absence of evidence ≠ absolute guarantee of zero private enterprise API |

**Bot blocking:** Many turboscribe.ai routes return **403** to scripted clients; use browser or Wayback for re-verification.

---

## 11. Sources

### Primary (official / archive)

1. Live blog index — https://turboscribe.ai/blog (retrieved 2026-07-21)
2. Leif Erikson Ventures — https://www.leiferiksonventures.com (retrieved 2026-07-21)
3. Wayback: Homepage — https://web.archive.org/web/20231010022630/https://turboscribe.ai/
4. Wayback: Homepage (launch-era) — https://web.archive.org/web/20230831172202/https://turboscribe.ai/
5. Wayback: Pricing — https://web.archive.org/web/20240721101553/https://turboscribe.ai/pricing
6. Wayback: Transcription Modes — https://web.archive.org/web/20240918125309/https://turboscribe.ai/blog/transcription-modes-explained
7. Wayback: Bulk export — https://web.archive.org/web/20241107080153/https://turboscribe.ai/blog/export-and-manage-files-in-bulk
8. Wayback: Unlimited explained — https://web.archive.org/web/20240807025304/https://turboscribe.ai/blog/turboscribe-unlimited-explained
9. Wayback: Free tier Whale — https://web.archive.org/web/20231214022005/https://turboscribe.ai/blog/free-tier-just-got-bigger
10. Wayback: Introducing TurboScribe — https://web.archive.org/web/2024/https://turboscribe.ai/blog/introducing-turboscribe
11. Wayback: Getting Started — https://web.archive.org/web/20240415044104/https://turboscribe.ai/blog/getting-started-with-turboscribe
12. Wayback: ChatGPT import — https://web.archive.org/web/20240209104125/https://turboscribe.ai/blog/turboscribe-chat-gpt
13. Wayback: Security & Privacy FAQ — https://web.archive.org/web/20240409102817/https://turboscribe.ai/blog/security-and-privacy-faq
14. Wayback: Privacy Policy — https://web.archive.org/web/20231108225149/https://turboscribe.ai/privacy
15. Wayback: Terms of Service — https://web.archive.org/web/20231108225133/https://turboscribe.ai/terms
16. Live post URLs (may bot-block):  
    - https://turboscribe.ai/blog/transcription-modes-explained  
    - https://turboscribe.ai/blog/export-and-manage-files-in-bulk  
    - https://turboscribe.ai/blog/turboscribe-unlimited-explained  
    - https://turboscribe.ai/blog/security-and-privacy-faq  
    - https://turboscribe.ai/blog/turboscribe-for-teams  
    - https://turboscribe.ai/blog/getting-started-with-turboscribe  
    - https://turboscribe.ai/pricing  

### Secondary (social / discussion; corroboration only)

17. Official X @TurboScribe — free tier (3/day, 30 min), Teams, security FAQ announcements  
18. X @leiffoged — ownership / product narrative  
19. User discussion: export formats (PDF/DOCX/SRT/VTT/CSV/TXT), lack of API wishes, Unlimited ~$20/mo

---

## 12. Bottom line for comparison documents

TurboScribe is a **Whisper-powered, flat-fee “unlimited” web transcription SaaS** with strong **mode (speed/accuracy), multilingual, diarization, export, and folder/bulk** product depth, owned by **Leif Erikson Ventures, LLC (Leif Foged)**. It is **not** a public developer platform: **no documented API, Zapier, Make, or webhook surface** was found. Competitive differentiation is price model + consumer UX + in-house privacy claims, not integration ecosystem.
