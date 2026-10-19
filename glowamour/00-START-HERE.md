# GLOWAMOUR — Instagram Business Profile Playbook

**Prepared:** 19 October 2026 · **Market:** India (Gujarat / Ahmedabad focus) · **Products:** Night cream (main), Kesar Goti Soap (planned)

---

## Read this first: what I found in your own repository

You asked me to build this from scratch. Before I wrote a single recommendation I read what was already in this repo, because two files in here change the strategy materially:

| File | What it told me | Why it matters for Instagram |
|---|---|---|
| `src/lib/constants.ts`, `tests/*.tsx`, `README.md` | You already run an **order system**: WhatsApp → Google Sheets → printable shipping labels. Sample products are **Night Cream ₹499**, **Day Cream ₹449**, **Face Serum ₹699**. Customers in **Ahmedabad / Gandhinagar / Gujarat**. Delivery-charge rules like *"State = Gujarat AND Amount < ₹600 → ₹100"*. | Your ordering channel is **WhatsApp, not a website**. Every CTA, link, and highlight in this plan is built around that. It also means you already have real order data to prove demand. |
| `formulation/day-cream-v1-india-dossier.md` | A **"DAYLIGHT" day-cream v1.0** dossier dated 1 Oct 2026, explicitly marked *"Prototype formula for personal test batch. Not a licensed commercial product."* It contains your own honest claims table, a §9.8 disclaimer block, and a §8 "what changes if you want to sell this in India" section (Form COS-5/COS-6, BIS IS 4707, ASCI). | This is a **compliance landmine and a marketing asset at the same time**. You clearly understand honest skincare claims better than 90% of Indian beauty brands. That honesty is your positioning. But the dossier also proves you must not market a home batch as a finished product. |

**So this plan is written for the business you actually have**, not a hypothetical one: a Gujarat-based, WhatsApp-first, small-batch skincare brand with a genuine formulation capability and (as far as I can verify) no live e-commerce website yet.

### Three questions that would sharpen this plan
You told me to ask only the most useful questions. These are the three that unlock the rest — I have given you a complete, workable plan regardless, with `[VERIFY]` markers wherever an answer would change the output.

1. **Manufacturing status of the night cream.** Is the ₹499 night cream (a) made by a licensed third-party/contract manufacturer under your brand, (b) made by you under your own Form COS-5 licence, or (c) still a prototype like DAYLIGHT? This single answer decides whether you can legally sell, what label claims you may make, and whether you can publish a manufacturing licence number as a trust asset.
2. **Kesar Goti Soap — is saffron actually in the formula, and at what %?** "Kesar" in a product name is an ingredient claim. If saffron is present at a meaningful, documented level you can market it. If it is a fragrance-only "kesar" product, the name and every caption must be handled differently. *(Related: is it a cosmetic soap under Cosmetics Rules 2020, or marketed with any antibacterial/medicinal angle — which would drag it into Drugs & Magic Remedies Act territory?)*
3. **What proof-of-trust assets already exist?** Any of: GST number, manufacturing licence number, lab/stability/challenge-test reports, batch numbers on packs, real customer order screenshots, your own face/name as founder. Tell me which exist and I will slot them into the pinned posts and highlights; I have deliberately **not invented any** of them in this plan.

---

## ⚠️ Time-critical: you are inside the 2026 festival selling window

Today is **Monday 19 October 2026**. Here is what that means for a Gujarat skincare brand selling kesar-based products:

| Festival | Date | Commercial significance |
|---|---|---|
| **Dhanteras** | **Fri 6 Nov 2026** | The auspicious **buying** day in Gujarat — people deliberately purchase something new. A stronger commercial hook than Diwali itself, and most national brands aim only at Diwali |
| Choti Diwali | Sat 7 Nov 2026 | |
| **Diwali (Lakshmi Puja)** | **Sun 8 Nov 2026** | Peak gifting. Falls on a Sunday, so in Gujarat the notified weekday holidays are Bestu Varas and Bhai Bij |
| **Bestu Varas — Gujarati New Year** | **Tue 10 Nov 2026** | Gujarat-specific. "New year, fresh start" is a warm, claim-free brand moment |
| **Bhai Bij** (Gujarat's Bhai Dooj) | **Wed 11 Nov 2026** | Short-fuse, Gujarat-specific gifting moment almost nobody targets |
| Wedding season | Nov 2026 – Feb 2027 | Pre-bridal is a high-spend category; Segment 3 in `04-audience.md` |

**The catch:** gifts must physically arrive *before* the festival. Your real order-by deadline is therefore roughly **2 Nov for the rest of India and 4 Nov for Gujarat** (verify against your actual courier times). That means:

> **Your gifting content window opened this week and closes in about 14 days.**

Everything else in this playbook can slip a week without real cost. This cannot. `content-calendar-30-days.csv` is **dated from today** and built around exactly this arc — Day 11 (29 Oct) opens the Diwali push, Day 15 (2 Nov) starts the Dhanteras countdown, Day 21 (8 Nov) is the festival greeting, Days 24–25 cover Bestu Varas and Bhai Bij.

If you can only act on one thing today: **decide whether you can offer a Diwali gift set, and if yes, shoot it this week.**

---

## The 2026 platform facts this plan is built on

Everything below was checked against reporting and Meta/Instagram first-party material in October 2026. Instagram changes fast; anything marked `[VERIFY IN-APP]` may differ on your account, because Meta rolls features out unevenly and by region.

| # | Fact | Date | Source type | What it changes for you |
|---|---|---|---|---|
| 1 | **Top three ranking signals: watch time, likes, sends.** Mosseri: *"likes are slightly more important for connected content, and sends are slightly more important for unconnected content."* | Jan 2025 | First-party (Instagram head, on record) | Your content must be built to be **sent to a friend**, not just liked. This is the single biggest strategic lever in this whole plan. |
| 2 | **Hashtags capped at 5 per post/Reel** (down from 30). Instagram: *"fewer (up to 5) more targeted hashtags, rather than many generic ones."* Generic tags like `#reels`/`#explore` *"could, in fact, hurt your content's performance."* | 18 Dec 2025 | First-party (@creators + Help Center) | All hashtag sets in `02` are **5 tags maximum**, topic-specific, zero generic filler. Anyone still giving you 30-hashtag blocks is working from 2023 advice. |
| 3 | **Originality rule extended to photos and carousels.** Accounts that *"primarily post unoriginal reels, photos, or carousels you didn't create or edit in a material way"* lose recommendation eligibility. Rolling **30-day** window, judged at **account** level. Borders, watermarks, credits and speed changes do **not** count as original. Recovery: make most of your last 30 days original, or appeal via Account Status. | 30 Apr 2026 | First-party (Meta blog) + TechCrunch, Engadget, CNET, PetaPixel | **Never repost** stock skincare content, other brands' reels, or "aesthetic" Pinterest-style images. Shoot your own product. Check **Settings → Account → Account Status** monthly. |
| 4 | **Reels up to 3 minutes are recommended to non-followers; Reels over 3 minutes are not.** (Recording limit is now 20 min.) | Jan 2025 / Help Center Oct 2026 | First-party | Hard cap on your discovery Reels: **keep them under 3 minutes.** Practically, 15–45 s. |
| 5 | **Public posts from professional accounts (18+) are indexable by Google/Bing by default**, content from 1 Jan 2020 onward. Opt-out: Settings → Privacy → *"Allow public photos and videos to appear in search engine results."* Stories and Highlights excluded. | 10 Jul 2025 | First-party (Help Center) | Your captions are now **web pages competing on Google**, not just Instagram text. Write captions that would answer a real Google query. |
| 6 | **Google Search Console now reports Instagram posts** — first-party data tying your posts to actual Google queries. | ~Jul 2026 | Second-party (trade press) | A free measurement channel most Indian D2C brands are ignoring. Set it up. `[VERIFY IN-APP]` |
| 7 | **Instagram began AI-generating SEO headlines for posts** shown in search engines; Meta confirmed it and admitted the titles "are not always accurate." | Dec 2025 | First-party (Meta statement) | Write your own first caption line so clearly that an auto-generated headline has something good to work with. |
| 8 | **Search reads more than text.** Mosseri (Jul 2026): search uses **captions and comments as text**, plus **embedding models that analyse the photo/video itself**, mapped into the same space as the query. | Jul 2026 | First-party (Q&A) | Visual content must *look* like what it is about. A clear shot of a night cream jar on a bathroom shelf is more findable for "night cream" than an abstract mood shot. |
| 9 | **Edits app: bilingual on-screen captions in 15 languages including Gujarati and Hindi.** | 2 Jul 2026 | First-party (@creators) + India Today, GSMArena, TOI | **This is a gift for your Gujarat strategy.** Burn Gujarati + English captions into one Reel automatically, no translation work. |
| 10 | **Edits app (19 Aug 2026): compare up to 3 Reels side by side** on views/watch time/follows/interactions; **Audience section** shows follower locations, interests and active times; **PDF export**. AI assistant added 30 Sep 2026. Carousel editor added Oct 2026. | Aug–Oct 2026 | First-party | Free analytics and free editing. You do not need a paid tool to start. |
| 11 | **Trial Reels**: publish to non-followers only. Eligibility per Help Center = **public account, professional (Business/Creator) with ≥200 followers** (personal accounts need 1,000), **and the account must be eligible for recommendations**. Scheduling added Apr 2026 (creators report it intermittently greyed out since Sep 2026). | Dec 2024 → Sep 2026 | First-party (Help Center) | Once you pass 200 followers this is your **A/B testing lab**: test hooks on strangers without polluting your grid. |
| 12 | **Profile grid previews at 3:4 vertical**, not 1:1 square. Best feed post size **1080×1350 (4:5)**; Reels/Stories **1080×1920**. | 2026 | Second-party (widely corroborated) | Design every carousel and post as 4:5. Square designs get cropped in the grid preview. `[VERIFY IN-APP]` |
| 13 | **Grid reordering** (long-press → "Reorder grid") rolled out worldwide, plus **pin up to 3 posts**, plus **add tagged posts to your main grid** (10 Sep 2026). | Jun / Sep 2026 | First-party (Mosseri) | You can now curate the profile layout deliberately instead of it being a chronology. Tagged customer photos can sit on your grid as social proof. |
| 14 | **Instagram Shopping in India: no in-app checkout.** India is in the "open beta" group where *"some sellers may not have full capabilities."* Since Sep 2025 all Shops use **website checkout** — a product tag sends the shopper to *your* site. The Shop tab was removed from navigation in Feb 2023. | 2023–2025 | First-party (Meta help) + trade press | **Do not build your plan around Instagram Shop.** Without a website, product tags have nowhere to send people. Your conversion path is WhatsApp. |
| 15 | **"AI-generated profile" label.** Profiles featuring an AI-generated person must apply the label or **lose recommendation reach**. Using AI to edit photos, write captions or make graphics is explicitly exempt. | 31 Aug 2026 | First-party + TechCrunch, Engadget | Never use an AI-generated "brand face" or AI model as your spokesperson unlabelled. And never use AI-generated before/after skin images — that is fabricated evidence, not just a platform risk. |
| 16 | **Meta One** subscription launched 15 Sep 2026; **clickable links in feed posts and Reels** promoted 13 Oct 2026 for **Meta One Advanced tier and above** (reported ~$49.99/mo; link caps apply). Meta Verified for Business in India launched at **₹639/month for a single app**. | Jul 2024 / Sep–Oct 2026 | First-party (Meta India newsroom) + trade press | A paid, optional late-stage lever — not a launch requirement. Do not spend here until organic conversion is proven. |

### India-specific commercial facts I used
- **UPI MDR:** from **15 October 2026**, merchant UPI payments **above ₹2,000** attract 0.4% MDR capped at ₹300, borne by the merchant. Up to ₹2,000 remains exempt. Your ₹499 night cream sits comfortably under the threshold.
- **Gateway fees:** Razorpay ~2% + GST domestic; Cashfree ~1.6–1.95%. Razorpay reported a 90-day welcome offer waiving the 2% fee for new merchants up to ₹5,00,000 cumulative GMV (activation on/after 1 Jul 2026) — `[VERIFY, promotional and time-limited]`.
- **COD risk:** reported **~26% RTO** at the ₹150–300/order price point, with ₹150–300 cost per RTO order. At ₹499 you are in a better but still exposed band. This is why your existing tool's Gujarat-vs-rest-of-India delivery rules are smart, and why COD confirmation on WhatsApp matters.
- **Advertising law:** ASCI Code Chapter I requires every objective claim to be substantiable on demand. ASCI has **specific guidelines for skin-lightening/fairness advertising**. ASCI's FY26 reporting found personal care among the top influencer violation categories, with *"visible, rapid or guaranteed results"* the most common upheld breach, and **Meta platforms accounting for ~79.8% of digital violations**. The CCPA has fined companies for unsubstantiated whitening claims and warned of ₹50 lakh penalties for repeats. Full detail in `11-compliance-claims.md`.

---

## What's in this playbook

| File | What you get | Do it when |
|---|---|---|
| **`01-profile-setup.md`** | Username shortlist + availability verification method, display-name options, **6 character-counted bios**, logo spec, category choice, contact buttons, link strategy, CTA system, account type, and ~25 specific settings with paths | **Day 1–2. Start here.** |
| **`02-seo-keywords.md`** | Keyword bank in 9 segments (brand, product, concern, buying-intent, Gujarat, Gujarati, routine, gifting, competitor-adjacent), a placement map for every Instagram surface, and **5-tag hashtag sets** per content type | Day 1–3 |
| **`03-profile-layout-trust.md`** | Pinned posts, **11 Story Highlights with exact contents**, grid architecture, the 7-second visitor test, and a **Trust Evidence Inventory** listing every asset you need to collect (nothing invented) | Week 1 |
| **`04-audience.md`** | **7 audience segments** with interests, pre-purchase questions, hesitations and the content that answers each. Every insight labelled *Researched* / *Hypothesis — test it* | Week 1–2 |
| **`05-content-strategy.md`** | 6 content pillars with mix %, **30 Reel ideas**, 12 carousel ideas, 20 hooks, caption formulas, and **8 fully written captions in English / Hinglish / Gujarati** | Week 2 onward |
| **`06-algorithm-growth.md`** | Ranking signals per surface, what you control vs don't, the sends-per-reach system, a no-budget 90-day growth plan, and the tactics that will hurt you | Week 2 onward |
| **`07-measurement.md`** | The metrics that matter (with 2026 naming: Views/Viewers/Sends), where each lives, a weekly 15-minute review, a 4-week decision framework, and a copy-paste tracking sheet | Week 4 onward |
| **`08-implementation-plan.md`** | 12 phases / 60+ steps. Each has: what to do, exact Instagram location, why, and how to verify it worked | **Follow in order** |
| **`09-dm-scripts.md`** | Copy-paste DM and WhatsApp scripts: price, COD, "is it safe", ingredients, complaint, RTO recovery, review request | Week 1 |
| **`10-master-checklist.md`** | One-page prioritised checklist, P0 → P3 | Print this |
| **`11-compliance-claims.md`** | Approved vs banned claim language for Indian cosmetics, ASCI/CCPA/Cosmetics Rules 2020 exposure, label requirements, before/after rules | Read before your first post |
| **`content-calendar-30-days.csv`** | Day-by-day launch calendar **dated from today (19 Oct 2026)** and built around the real festival arc: format, pillar, hook, on-screen text, caption reference, 5 hashtags, CTA tier | Week 2 |
| **`glowamour-weekly-tracker.csv`** | 60-column weekly measurement sheet pre-filled with 13 week-commencing dates. Copy into Google Sheets so it sits next to your existing order data | Week 4 |

---

## The 10 decisions, in one screen

| Decision | Recommendation | File |
|---|---|---|
| Username | **`glowamour.in`** — fall back through a ranked list of 9 | `01` |
| Display name | **`GLOWAMOUR | Night Cream India`** (29/30 chars) | `01` |
| Bio | **Option A** — product + proof + geography + one CTA (125/150 units) | `01` |
| Account type | **Business** (not Creator) | `01` |
| Category | Best available match to *skin care / cosmetics brand*; check whether **"Beauty Brand"** appears in your list | `01` |
| Links | **WhatsApp first**, then store/catalogue. No link shorteners | `01` |
| Primary CTA | **"DM 'GLOW' to order"** — a keyword trigger you can read, track and later automate | `01` |
| Content engine | 3–4 Reels/wk (≤3 min, own footage) + 1 carousel + daily Stories, built for **sends** | `05`, `06` |
| Trust engine | Honest-labels positioning + real batch numbers + founder face + WhatsApp conversation | `03`, `11` |
| Measurement | Sends-per-reach, average watch time, profile visits, WhatsApp inquiries, orders | `07` |

---

## One positioning insight worth stating plainly

Your dossier says: *"No cosmetic product is '100% side-effect free'"* and it refuses hydroquinone, steroids and mercury on principle. ASCI's own data says 98% of scrutinised Indian beauty ads needed modification, and that *"visible, rapid or guaranteed results"* is the most-upheld violation in personal care.

**That gap is your brand.** In a market where the loudest claims are the least substantiated, a Gujarat skincare brand that publishes its full ingredient list, its batch number, its realistic timeline and its patch-test instructions is not being boring — it is being **distinguishable**. It is also, conveniently, the only positioning that keeps you out of ASCI and CCPA trouble.

So the through-line of everything in this playbook is: **radical, specific, verifiable honesty as a growth strategy** — sold through WhatsApp, in English/Hinglish/Gujarati, to people in and around Ahmedabad first.
