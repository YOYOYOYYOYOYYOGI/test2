# 07 — Analytics & Continuous Improvement

## Part 1 — Where everything lives (2026 naming)

Instagram renamed its core metrics, which is why most guides you read will use the wrong words. Here is the current vocabulary:

| Old name | **2026 name** | What it counts |
|---|---|---|
| Impressions / Plays | **Views** | Every time content was displayed or played, **repeats included**. Retired for good in April 2025 |
| Reach / Accounts reached | **Viewers** | **Unique accounts** that saw your content on screen at least once. For Reels, counts accounts that saw it even if it did not play |
| Reach breakdown | **Accounts engaged** | Unique accounts that took an action. Needs 100+ followers |
| Engagement | **Interactions** | Likes + comments + saves + shares + other actions |
| Shares | **Sends** | Times content was sent privately in a DM ⭐ **Your most important growth metric** |
| — | **Watch time** | Total time your Reel played, **including replays** |
| — | **Average watch time** | Watch time ÷ number of **initial views** (an initial view = when your Reel starts playing for the first time in a reel session) |
| — | **Follows** | Accounts that followed you after viewing that Reel |
| — | **Profile activity** | Profile visits, follows and link taps that came from a specific post or story |
| — | **Link taps** | Website/link taps. Reported for Stories since **June 2026** |
| — | **Contact button taps** | Taps on your Email/WhatsApp/Phone buttons (`profile_links_taps` via API, broken down by button type) |

**New in April 2026:** Insights was redesigned with tabs for **Engagement** and **Audience**, plus three new measures — **share rate**, **skip rate** and **views over time**. `[VERIFY IN-APP — rollout is uneven]`

### How to get there
| What | Path |
|---|---|
| Account-level Insights (mobile) | **Profile → Professional dashboard → See all insights** |
| If the dashboard is missing | Profile → ☰ → **Settings and activity → For professionals → Insights** |
| One post/Reel | Open it → **View insights** |
| One Story | Swipe up on the active Story, or ☰ on an archived one → View insights |
| Desktop | `instagram.com` → **Dashboard** in the left menu → Insights → Account or Content |
| Cross-platform, scheduling, inbox | **Meta Business Suite** (`business.facebook.com`) — needs a connected Facebook Page |
| Reel analytics + comparison + audience interests | **Edits app** (free) — Aug 2026 update: compare up to **3 Reels side by side** on views/watch time/follows/interactions; an **Audience** section showing follower locations, **interests** and active times; **PDF export** |
| Account health / recommendation eligibility | **Settings → Account → Account Status** ⭐ |
| Google performance of your Instagram posts | **Google Search Console** — reports Instagram posts and the queries that surfaced them (~Jul 2026) `[VERIFY availability]` |

**Retention limits:** account-level data covers **any range in the past 90 days**; individual posts/Reels/Stories keep their own insights for **up to 2 years**. Demographics need **100+ accounts reached or engaged** in the selected period — so a small account may show nothing for "Last 7 days" but a full breakdown for "Last 30 days."

**Export now:** because account-level history only goes back 90 days, **copy your numbers into a sheet every week.** After a year you will have a dataset Instagram will not give you.

---

## Part 2 — The metrics that matter for GLOWAMOUR

Ranked by how directly they connect to your stated goal: *relevant audience → trust → sustainable sales.*

### Tier A — Look at these every week

| # | Metric | Where | Why it matters for you | Target behaviour |
|---|---|---|---|---|
| 1 | **Sends per reach** ⭐ | Post insights: Sends ÷ Viewers | The signal Instagram weights most for **non-follower** distribution. Directly measures "was this worth forwarding?" | Should be your highest on educational and honesty content. If a post has high views and near-zero sends, the topic was not useful enough to share |
| 2 | **Average watch time** | Reel insights | The #1 named ranking signal. Tells you whether your hook worked | Compare against Reel length. A 30 s Reel averaging 20 s is strong; averaging 8 s means the hook failed |
| 3 | **Profile visits → Follows** | Profile activity + Total followers | Measures whether your **profile** converts, independent of your content | If reach is good but follows are flat, fix the profile (`03`), not the content |
| 4 | **Non-follower share of Viewers** | Post insights: followers vs non-followers breakdown | The whole point of Reels. Tells you whether you are growing or just talking to yourself | Healthy Reels should be majority non-follower |
| 5 | **Link taps + Contact button taps** | Profile activity / Story insights | The closest thing Instagram gives you to a purchase signal | Track which link (WhatsApp vs store) actually gets used |
| 6 | **WhatsApp inquiries** ⭐ | **Your own WhatsApp**, not Instagram | Instagram cannot see this. **You must count it manually.** It is your true top-of-funnel sales number | Log daily. Attribute to source when you can |
| 7 | **Orders + revenue** | Your Google Sheet (already built) | The only number that ultimately matters | Already captured: order number, customer, city, state, pincode, product, qty, payment status, delivery charge, total |

### Tier B — Look at these monthly

| Metric | Where | Why |
|---|---|---|
| **Saves per reach** | Post insights | Measures reference-value. Your carousels should win here |
| **Likes per reach** | Post insights | Named ranking signal; more important for **connected** (follower) distribution |
| **Comment quality** | Read them | Not the count — the content. Every "does it work for oily skin?" is a keyword and a Reel idea |
| **Follower growth rate** | Total followers | Directional only. Do not optimise for it directly |
| **Audience demographics** (city, age, gender) | Audience tab | ⭐ **Check whether Gujarat/Ahmedabad is actually over-represented.** If your reach is mostly Delhi and Mumbai, your local strategy needs adjusting |
| **Most active times** | Audience tab / Edits | When to post. Minor optimisation |
| **Audience interests** | Edits app (Aug 2026) | Tells you what else your followers care about — direct content-calendar input |
| **Top content** | Content library | What worked, sorted. Make more of it |
| **Story completion & drop-off** | Story insights | Where you lose people |
| **Accounts engaged** | Account insights | Depth of relationship, not breadth |

### Tier C — Ignore these
- **Total follower count** as a standalone number. Instagram does not rank on it. It is a lagging vanity metric.
- **Views on their own** — the biggest number and the least informative. Always divide by Viewers.
- **Any single post's performance.** One post is noise. Judge on 4-week patterns.
- **Comparison to large accounts.** Their ratios are structurally different from yours.

---

## Part 3 — Derived ratios you should compute yourself

Instagram gives you raw numbers; the insight is in the ratios. Add these five columns to your weekly sheet:

```
Sends per reach      = Sends ÷ Viewers          ← growth signal (MOST IMPORTANT)
Saves per reach      = Saves ÷ Viewers          ← reference value
Likes per reach      = Likes ÷ Viewers          ← connected-content signal
Engagement rate      = (Likes+Comments+Saves+Sends) ÷ Viewers
Watch-through        = Average watch time ÷ Reel length   ← hook quality
Follow conversion    = Follows ÷ Profile visits ← profile quality
Inquiry rate         = WhatsApp inquiries ÷ Profile visits ← commercial quality
Order rate           = Orders ÷ WhatsApp inquiries ← your closing skill
Cost per order       = (Product + delivery + RTO losses) ÷ orders
```

**The two that will tell you the most:**
- **Sends per reach** → whether your content deserves non-follower distribution.
- **Order rate (Orders ÷ WhatsApp inquiries)** → whether *you* are closing. This one is entirely a conversation-quality problem, fixable with the scripts in `09-dm-scripts.md`, and most small brands never measure it.

### Benchmarks — read this before you look at any number
Published engagement benchmarks are averages across every industry, account size and country, and most of them are self-reported by tool vendors. **Do not use them to judge your account.**

The only benchmark that is meaningful is **your own 4-week trailing average.** In week 1 you will have no data at all, and that is fine — week 1 exists to create a baseline, not to be judged.

One thing that is safe to say: engagement rates across Instagram have been declining for years, and small accounts typically see *higher* per-reach ratios than large ones, because their audiences are more interested. If a big-brand benchmark says 0.5% and you are at 3%, you are not doing something magic — you are doing something normal for your size. Compare yourself to yourself.

---

## Part 4 — The weekly 15-minute review

Same day, same time, every week. Do not skip it — this is the habit that separates a brand that improves from one that just posts.

### Step 1 — Copy the numbers (5 min)
Profile → Professional dashboard → See all insights → **Last 7 days**. Record into `glowamour-weekly-tracker.csv` (template below):
- Views · Viewers · Accounts engaged · Total followers (net change) · Profile visits · Link taps · Content published count

Then open your **top 3 posts** of the week individually and record: Views · Viewers · Sends · Saves · Likes · Comments · Follows · Average watch time · % non-follower.

### Step 2 — Count what Instagram cannot see (3 min)
From your own records:
- WhatsApp inquiries this week (count the "GLOW" DMs separately)
- Orders placed · Revenue · COD vs prepaid split
- Cities/states those orders came from (your sheet already has this)
- RTO / cancelled / returned orders

### Step 3 — Compute the ratios (2 min)
Sends per reach, saves per reach, watch-through, follow conversion, inquiry rate, order rate.

### Step 4 — Answer five questions (5 min)
1. **What was my best post by sends per reach?** Why? (Topic? Hook? Format? Language?) → *Make three more like it next week.*
2. **What was my worst?** Was it the hook (low average watch time) or the topic (good watch time, no sends)? → *Low watch time = fix the first 3 seconds. Good watch time but no sends = the content was not useful enough to forward.*
3. **Did any Reel drive an actual inquiry?** Which one? → *That is your commercial content archetype.*
4. **Are my Viewers mostly from Gujarat?** If not, is that a problem or an opportunity? → *Adjust local content or accept national reach*
5. **Is my Account Status clean?** → *Settings → Account → Account Status. 20 seconds. Do it every single week.*

### Step 5 — Write next week's three changes
Not five. **Three.** One content change, one profile change, one conversation change. Write them down. Check them the following week.

---

## Part 5 — Diagnosing weak performance

| Symptom | Most likely cause | Fix |
|---|---|---|
| **Low Views across the board** | Not being distributed. Either (a) Account Status problem, (b) unoriginal content pattern, (c) inconsistent posting, or (d) content is not matching any interest cluster | Check **Account Status** first. Then confirm 100% original footage. Then check posting consistency. Then tighten your niche |
| **Good Views, low average watch time** | The **hook failed**. People saw it and left in 2 seconds | Rewrite the first 3 seconds. Keyword on screen + spoken. Payoff stated, not teased. Cut every pause |
| **Good watch time, low sends** | Content was pleasant but not **useful to a specific other person** | Apply the send test (`06` Part 3). Add checklists, warnings, comparisons, radical honesty |
| **Good sends, low follows** | People enjoy the content but the **profile does not convince them** | Reel covers → bio line 1 → pinned posts → Highlights → grid consistency. This is a `03` problem, not a content problem |
| **Good follows, low inquiries** | Your content is educational but never commercial, or prices/CTAs are unclear | Raise Pillar 6 to ~10%. Publish prices. Add "DM GLOW" to every post |
| **Good inquiries, low orders** | Your **DM conversation** is losing them | This is a sales problem, not a content problem. Use `09-dm-scripts.md`. Measure response time. Publish prices so nobody has to ask |
| **High reach, wrong geography** | Interest clustering is off, or location signals are weak | Tag real Ahmedabad/Gujarat locations. Add Gujarati on-screen text. Put the city in your bio and Name field. Engage genuinely with local accounts |
| **Reach suddenly collapsed** | Account Status change, a policy flag, or a 30-day originality window problem | **Account Status** → read the message → appeal if wrong → post 30 days of clearly original content to recover |
| **Sudden drop after a good run** | Normal variance. Reels are lottery tickets | Do not react to one week. Judge on 4-week patterns |
| **Engagement from accounts that never buy** | You are reaching Segment 7 (beginners) not Segment 1 (buyers) | That is *fine and healthy* — they drive your distribution. Add more buying-intent content (`02` Segment 4) without reducing the educational volume |

---

## Part 6 — How to test properly

### Rule 1 — Change one variable at a time
If you change the hook, the length, the topic and the posting time together, you learn nothing. Test one thing.

### Rule 2 — Give every test 4 weeks or 8 posts
Single-post results are noise. A format needs 8 attempts before you can call it.

### Rule 3 — Use Trial Reels once you pass 200 followers ⭐
This is the only real A/B test Instagram offers, and it is free:
1. Make **2–3 versions** of the same idea with genuinely different hooks (not the same video with different text overlays — duplicate detection catches that).
2. Toggle **Trial** on the share screen → publishes to **non-followers only**, hidden from your grid and your followers.
3. Wait ~24 hours for insights: views, likes, comments, sends, plus a comparison against your previous trials.
4. Tap **Share to everyone** on the winner. Archive the losers.
5. Optional: **Share to everyone automatically** lets Instagram graduate a strong trial for you. Note it applies to all future trials until you turn it off.

**Eligibility:** public professional account, **≥200 followers**, and **recommendation-eligible** (if you lose eligibility you lose Trial Reels too). Trial Reel *scheduling* was added in April 2026 but creators have reported it greyed out since September 2026 — do not depend on it. `[VERIFY IN-APP]`

### Rule 4 — Test in this priority order
Highest information value first:

| Priority | Test | Why first |
|---|---|---|
| 1 | **Hook variations** on your best topic | Biggest single lever on watch time |
| 2 | **Language** — Gujarati-first vs English-first vs Hinglish | Determines your entire audience composition. Nobody can answer this for you |
| 3 | **Format** — Reel vs carousel on the same topic | Tells you where to spend production effort |
| 4 | **CTA** — "DM GLOW" vs "tap WhatsApp" vs "save this" | Directly affects inquiries |
| 5 | **Name field rotation** (`01` §2) | Cheap, 14-day cycles, affects search profile visits |
| 6 | **Posting time** | Smallest effect. Test last |
| 7 | **Price presentation** — price in cover text vs not | Affects both reach quality and inquiry volume |

### Rule 5 — Log every test
| Test ID | Variable | Version A | Version B | Dates | Metric | Result | Decision |
|---|---|---|---|---|---|---|---|
| T-001 | Hook | "Your night cream isn't the problem" | "3 products wasting your money" | 1–14 Nov | Sends/reach | | |
| T-002 | Language | Gujarati-first | English-first | 15–28 Nov | Profile visits | | |

---

## Part 7 — Weekly tracker template

`glowamour-weekly-tracker.csv` is created alongside this file. One row per week. Copy it to Google Sheets — your existing workflow already lives there, so your Instagram metrics and your order data will sit in the same tool.

**The most valuable join you can make:** your Google Sheet already has `City`, `State`, `Pincode`, `Product`, `Total`, `Payment Status`. Add three columns — **`Source`** (which Reel/post/campaign), **`First Question Asked`**, **`Repeat? Y/N`**. Within 8 weeks you will be able to answer "which content actually produces paying customers in Gujarat," which is a question almost no brand your size can answer. That is worth more than any analytics subscription.

---

## Part 8 — The monthly strategic review (45 minutes)

1. **Trend lines.** Plot 4 weeks of sends-per-reach, profile visits, inquiries and orders. Are they rising, flat or falling?
2. **Top 5 and bottom 5 posts.** What do the winners share? Topic, format, language, length, hook type? Write down the pattern in one sentence.
3. **Audience shift.** Is Gujarat's share of Viewers growing? Is the age band moving toward buyers (25–45) or away (18–24)?
4. **Revenue per content hour.** Orders ÷ hours spent producing. If this is falling, you are producing the wrong kind of content.
5. **Repeat rate.** How many of this month's buyers bought before? If zero, your retention sequence (`03` Part 5) is not running.
6. **Keyword wins.** Search your P0/P1 keywords (`02` Part 1). Do you appear? Mark anything you now rank for as **WON**.
7. **Google Search Console.** Which queries surfaced your Instagram posts? Those are free content ideas with proven demand.
8. **Account Status.** Eligible for recommendations? Any limits? Any appeals needed?
9. **Rewrite `04-audience.md`.** Compare your hypotheses to your actual order data. **When they conflict, the data wins.**
10. **Set three priorities** for next month. Not ten. Three.

---

## Part 9 — What good looks like at 30 / 60 / 90 days

Not targets — **diagnostic checkpoints**. If you are nowhere near these, something specific is wrong and Part 5 will tell you what.

| Day | What should be true |
|---|---|
| **30** | Profile fully built per `01`/`03`. 12–16 posts live. 3 pins. 8 Highlights. WhatsApp Business + catalogue running. You have a **baseline** for every Tier A metric. You know which 2 formats get the best watch time. First inquiries from Instagram. |
| **60** | 30+ posts. You can name your top format and your worst. A repeatable weekly batch-shoot rhythm. First orders attributable to specific content. Gujarat share of Viewers measurably present. Approaching or past 200 followers. |
| **90** | Trial Reels unlocked and in use. Your top 3 posts by sends-per-reach identified and each replicated 3×. A documented DM → order conversion rate. Real customer feedback collected honestly and published with permission. A decision made on paid amplification, based on data. `04-audience.md` rewritten from your own order data. |

**The single most important sentence in this file:** after 90 days, your own WhatsApp inbox and Google Sheet will know more about your customers than this playbook does. **Trust them over me.** Tell me what you found and I will rewrite the strategy around the facts.
