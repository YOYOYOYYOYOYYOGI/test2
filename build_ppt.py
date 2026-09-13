"""
Build RANGAT NATURALS CEO Growth Strategy PPT — expanded to ~50 slides
"""
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.enum.shapes import MSO_SHAPE
from pptx.dml.color import RGBColor

# Brand palette
SAFFRON = RGBColor(0xE2, 0xA0, 0x4B)
TERRACOTTA = RGBColor(0xC5, 0x65, 0x4B)
CREAM = RGBColor(0xF7, 0xF2, 0xEA)
FOREST = RGBColor(0x2F, 0x4F, 0x3E)
DARK_TEXT = RGBColor(0x1A, 0x1A, 0x1A)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)

prs = Presentation()
prs.slide_width = Inches(13.333)
prs.slide_height = Inches(7.5)
SW = prs.slide_width
SH = prs.slide_height
BLANK = prs.slide_layouts[6]


def add_bg(slide, color=CREAM):
    bg = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, SW, SH)
    bg.fill.solid()
    bg.fill.fore_color.rgb = color
    bg.line.fill.background()


def add_title_band(slide, title, accent=TERRACOTTA):
    band = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, SW, Inches(1.1))
    band.fill.solid()
    band.fill.fore_color.rgb = accent
    band.line.fill.background()
    tf = band.text_frame
    tf.margin_left = Inches(0.6)
    tf.margin_top = Inches(0.22)
    p = tf.paragraphs[0]
    r = p.add_run()
    r.text = title
    r.font.size = Pt(32)
    r.font.bold = True
    r.font.color.rgb = WHITE
    r.font.name = "Georgia"


def add_footer(slide, text):
    f = slide.shapes.add_textbox(Inches(0.4), Inches(7.1), Inches(12.5), Inches(0.3))
    p = f.text_frame.paragraphs[0]
    r = p.add_run()
    r.text = text
    r.font.size = Pt(9)
    r.font.color.rgb = FOREST
    r.font.italic = True


def add_textbox(slide, left, top, width, height, text, font_size=16, bold=False, color=DARK_TEXT, font_name="Calibri"):
    box = slide.shapes.add_textbox(left, top, width, height)
    tf = box.text_frame
    tf.word_wrap = True
    lines = text.split("\n")
    for i, line in enumerate(lines):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.space_after = Pt(4)
        r = p.add_run()
        r.text = line
        r.font.size = Pt(font_size)
        r.font.bold = bold
        r.font.color.rgb = color
        r.font.name = font_name


def add_bullets(slide, left, top, width, height, items, font_size=14):
    box = slide.shapes.add_textbox(left, top, width, height)
    tf = box.text_frame
    tf.word_wrap = True
    for i, item in enumerate(items):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.space_after = Pt(6)
        r = p.add_run()
        r.text = "• " + item
        r.font.size = Pt(font_size)
        r.font.color.rgb = DARK_TEXT
        r.font.name = "Calibri"


def add_table(slide, data, left=Inches(0.5), top=Inches(1.5), col_widths=None, font_size=11):
    rows = len(data)
    cols = len(data[0])
    width = Inches(12.3)
    height = Inches(5.0)
    tbl = slide.shapes.add_table(rows, cols, left, top, width, height).table
    if col_widths:
        for i, w in enumerate(col_widths):
            tbl.columns[i].width = Inches(w)
    for r in range(rows):
        for c in range(cols):
            cell = tbl.cell(r, c)
            cell.text = ""
            tf = cell.text_frame
            tf.word_wrap = True
            p = tf.paragraphs[0]
            run = p.add_run()
            run.text = str(data[r][c])
            run.font.size = Pt(font_size)
            run.font.name = "Calibri"
            if r == 0:
                run.font.bold = True
                run.font.color.rgb = WHITE
                cell.fill.solid()
                cell.fill.fore_color.rgb = TERRACOTTA
            else:
                run.font.color.rgb = DARK_TEXT
                cell.fill.solid()
                cell.fill.fore_color.rgb = CREAM if r % 2 == 1 else WHITE


# ============================================================
# SLIDE 1 — TITLE
# ============================================================
slide = prs.slides.add_slide(BLANK)
add_bg(slide, CREAM)
left_band = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, Inches(0.6), SH)
left_band.fill.solid()
left_band.fill.fore_color.rgb = SAFFRON
left_band.line.fill.background()

title = slide.shapes.add_textbox(Inches(1), Inches(1.6), Inches(11.5), Inches(2.5))
tf = title.text_frame
p = tf.paragraphs[0]
r = p.add_run()
r.text = "RANGAT NATURALS"
r.font.size = Pt(72)
r.font.bold = True
r.font.color.rgb = TERRACOTTA
r.font.name = "Georgia"

p2 = tf.add_paragraph()
r2 = p2.add_run()
r2.text = "The Founder's CEO Growth Strategy"
r2.font.size = Pt(32)
r2.font.color.rgb = FOREST
r2.font.name = "Georgia"

p3 = tf.add_paragraph()
p3.space_before = Pt(15)
r3 = p3.add_run()
r3.text = "From Zero to India's Trusted Skincare Brand"
r3.font.size = Pt(22)
r3.font.italic = True
r3.font.color.rgb = DARK_TEXT

pill = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(1), Inches(4.8), Inches(11), Inches(0.9))
pill.fill.solid()
pill.fill.fore_color.rgb = FOREST
pill.line.fill.background()
ptf = pill.text_frame
ptf.margin_top = Inches(0.18)
p = ptf.paragraphs[0]
p.alignment = 2
r = p.add_run()
r.text = "\"Skin you can trust. Routines you can actually follow.\""
r.font.size = Pt(22)
r.font.italic = True
r.font.color.rgb = WHITE

add_textbox(slide, Inches(1), Inches(6.3), Inches(11), Inches(0.5),
            "v1.0  •  September 2026  •  Gujarat → India → Global", font_size=14, color=FOREST)


# ============================================================
# SLIDE 2 — AGENDA
# ============================================================
slide = prs.slides.add_slide(BLANK)
add_bg(slide)
add_title_band(slide, "Agenda — 18 Sections + Plans")
add_bullets(slide, Inches(0.6), Inches(1.4), Inches(12), Inches(5.5), [
    "1. Brand Positioning  •  2. Unique Selling Proposition",
    "3. First Product Strategy  •  4. Pricing Strategy (₹299 → ₹699)",
    "5. Gujarat Launch Strategy (Ahmedabad, Surat, Vadodara, Rajkot)",
    "6. Customer Acquisition Ladder (10 → 10,000 customers)",
    "7. Low-Budget Playbook (₹10K → ₹1L)",
    "8. Organic Sales (Instagram, WhatsApp, salons, events)",
    "9. Social Media Strategy  •  10. Advertising (Meta, Google, Amazon)",
    "11. Trust Building  •  12. Repeat Purchase & LTV",
    "13. Competitor Strategy  •  14. Offline + Online Channels",
    "15. Brand Expansion Roadmap (Phase 1 → Phase 4)",
    "16. Sales Targets (Month 1 → Month 12)",
    "17. 20 Biggest Mistakes to Avoid",
    "18. CEO Verdict  •  30-Day  •  60-Day  •  90-Day Plans",
], font_size=15)
add_footer(slide, "RANGAT NATURALS — CEO Growth Strategy  •  Slide 2 of ~52")


# ============================================================
# SECTION 1 — POSITIONING (3 slides)
# ============================================================
slide = prs.slides.add_slide(BLANK)
add_bg(slide)
add_title_band(slide, "1.1 The Strategic Reality")
add_textbox(slide, Inches(0.5), Inches(1.4), Inches(12.3), Inches(0.5),
            "Indian skincare is a paradox:", font_size=18, bold=True, color=TERRACOTTA)
add_bullets(slide, Inches(0.7), Inches(1.9), Inches(12), Inches(2.0), [
    "1.4 billion people, Rs 25,000+ crore market, growing ~9% CAGR",
    "Digitally native middle class buying skincare like never before",
    "Shelf already crowded: pharma giants, derm brands, heritage, D2C, Instagram brands, Amazon generics",
    "A new brand cannot win by being a 'better Minimalist' or 'cheaper Cetaphil'",
    "It must win by owning a position NOBODY else owns",
], font_size=14)
add_textbox(slide, Inches(0.5), Inches(4.5), Inches(12.3), Inches(0.4),
            "The positioning question:", font_size=18, bold=True, color=FOREST)
add_textbox(slide, Inches(0.7), Inches(4.9), Inches(12), Inches(1.5),
            "\"When a 22-year-old Gujarati woman sees this brand, what does she IMMEDIATELY understand it stands for, that no other brand stands for?\"",
            font_size=18, color=TERRACOTTA, bold=True)


# 1.2 Positioning statement
slide = prs.slides.add_slide(BLANK)
add_bg(slide)
add_title_band(slide, "1.2 The Positioning Statement")
add_textbox(slide, Inches(0.5), Inches(1.4), Inches(12.3), Inches(2.5),
            "For young Indian women (18-35) in Tier-1 and Tier-2 cities who want real skincare results without paying luxury prices and without applying 12-step Korean routines, RANGAT NATURALS is the honest, transparent, ingredient-led skincare brand from Gujarat that combines traditional Indian botanicals with clinically proven actives, at prices every Indian middle-class household can afford.",
            font_size=15, color=FOREST, bold=True)

add_textbox(slide, Inches(0.5), Inches(4.2), Inches(12.3), Inches(0.4),
            "Taglines:", font_size=18, bold=True, color=TERRACOTTA)
add_textbox(slide, Inches(0.7), Inches(4.6), Inches(12), Inches(1.0),
            "Primary (English): \"Skin you can trust. Routines you can actually follow.\"\nGujarati: \"ત્વચાને સાચો ભરોસો\" (Tvachane sacho bharoso)",
            font_size=14)


# 1.3 Brand pillars
slide = prs.slides.add_slide(BLANK)
add_bg(slide)
add_title_band(slide, "1.3 Brand Pillars + Personality")
brand_pillars = [
    ["Pillar", "What it means", "What we DO", "What we DON'T"],
    ["Honesty", "No fake claims, no 12-hour miracles", "List active % on pack, real before/afters, plain-English", "Photoshop glow, anti-aging without SPF, hide ingredients"],
    ["Indian + Modern", "Botanicals + actives, not either-or", "Saffron, kumkumadi, niacinamide, vitamin C, bakuchiol", "Pretend pure Ayurveda OR pretend clinical with no soul"],
    ["Affordable Luxury", "Premium feel, mass-market price", "Glass-like look, ₹299-₹599, generous 50ml size", "₹1,500 serums OR ₹99 chemist plastic"],
    ["Made for India", "Skin, climate, water", "Tested Gujarat humidity, SPF for Indian UV, niacinamide for pigmentation", "Copy-paste Korean or American formulations"],
    ["Founder-led", "Customers buy from people", "Founder face on insert, video messages, WhatsApp", "Hide behind logo, ignore DMs, outsource trust"],
]
add_table(slide, brand_pillars, top=Inches(1.4), col_widths=[1.7, 3.0, 3.8, 3.8], font_size=11)

add_textbox(slide, Inches(0.5), Inches(5.7), Inches(12.3), Inches(0.5),
            "Visual identity: Saffron #E2A04B • Terracotta #C5654B • Cream #F7F2EA • Forest #2F4F3E  |  Hand-drawn rangoli-inspired 'R' logo. Earth-warm palette — nobody else owns this.",
            font_size=12, color=FOREST, bold=True)


# ============================================================
# SECTION 2 — USP (3 slides)
# ============================================================
slide = prs.slides.add_slide(BLANK)
add_bg(slide)
add_title_band(slide, "2.1 The USP Stack — 5 Layers")
add_textbox(slide, Inches(0.5), Inches(1.4), Inches(12.3), Inches(0.4),
            "Each layer alone is weak. Together unbeatable.", font_size=14, color=FOREST, bold=True)
usp_data = [
    ["Layer", "What we do", "Why competitors can't copy easily"],
    ["1. Transparent actives", "List active % on FRONT of pack: 'Vitamin C 10%'", "Pharma giants hide INCI at back; new brands want to copy but choose not to"],
    ["2. Gujarat-tested", "6-week founder-led testing in 42°C, 85% humidity, 1100 ppm hard water", "Big brands have global R&D optimizing for global SKUs, not Indian conditions"],
    ["3. Founder-accessible", "Founder WhatsApp inside every box; responds < 4 hrs (first 6 months)", "Himalaya & Minimalist CEOs don't reply to DMs"],
    ["4. 3-step routine", "Cleanse → treat → protect; not 10-step Korean", "Most brands sell 14 products; we sell the routine"],
    ["5. Price-for-value", "Compete on actives per ₹, not cheapest. ₹499 with 10% beats ₹299 with 3%", "Once explained in content, customers become loyal on logic, not price"],
]
add_table(slide, usp_data, top=Inches(1.9), col_widths=[2.0, 5.0, 5.3], font_size=11)


# 2.2 USP sentence + battle cards
slide = prs.slides.add_slide(BLANK)
add_bg(slide)
add_title_band(slide, "2.2 The USP in One Sentence")
add_textbox(slide, Inches(0.5), Inches(1.4), Inches(12.3), Inches(1.5),
            "\"RANGAT NATURALS is the only Indian skincare brand that prints active % on the front, tests every product in Gujarat's heat, gives you the founder's WhatsApp, and fits in a 3-step routine — at ₹299 to ₹599.\"",
            font_size=18, color=FOREST, bold=True)

add_textbox(slide, Inches(0.5), Inches(3.3), Inches(12.3), Inches(0.4),
            "Battle cards — how we beat each competitor:", font_size=16, bold=True, color=TERRACOTTA)
battle_data = [
    ["Competitor", "Their pitch", "Our counter"],
    ["Himalaya / Patanjali", "Natural, Ayurvedic", "Plus we disclose active % — their aloe is mostly water"],
    ["Cetaphil / CeraVe", "Derm-recommended", "Great. Our ₹499 serum has 3x the actives"],
    ["Minimalist / Derma Co", "Actives-focused", "Same actives + founder DMs + climate-tested"],
    ["mCaffeine / Plum", "Trendy, packaging", "Same energy + ₹100 less + Indian botanicals"],
    ["Instagram brands", "Instagram-famous", "ISO mfg + batch testing + 6-week trials"],
    ["Local chemist", "Cheap", "Cheap AND effective — here's the lab report"],
]
add_table(slide, battle_data, top=Inches(3.7), col_widths=[2.8, 3.0, 6.5], font_size=11)


# 2.3 What we never use
slide = prs.slides.add_slide(BLANK)
add_bg(slide)
add_title_band(slide, "2.3 What RANGAT Will NEVER Claim")
add_textbox(slide, Inches(0.5), Inches(1.4), Inches(12.3), Inches(0.4),
            "These phrases are dead. Customers see through them in 0.4 seconds.", font_size=14, color=FOREST, bold=True)
add_bullets(slide, Inches(0.7), Inches(1.9), Inches(12), Inches(5), [
    "❌ \"Ayurvedic\" alone (every brand claims it, no one believes it)",
    "❌ \"Chemical-free\" (a meaningless phrase — everything is chemicals, including water)",
    "❌ \"Korean / Japanese technology\" (Gujarat customer doesn't care about K-beauty origin)",
    "❌ \"Celebrity-endorsed\" (we don't have one, and shouldn't claim)",
    "❌ \"FDA-approved\" (cosmetics don't need FDA approval in India — only CDSCO notification)",
    "❌ \"Cures pigmentation / eczema / acne\" (medical claims — illegal & damages trust)",
    "❌ \"Anti-aging without SPF data\" (fear-based marketing)",
    "❌ Photoshopped \"glow\" photos / AI-generated skin",
    "❌ Hidden ingredient order — we list every active with % on FRONT",
    "❌ Sponsored content that pretends to be organic (we always mark Sponsored)",
], font_size=13)


# ============================================================
# SECTION 3 — FIRST PRODUCT (3 slides)
# ============================================================
slide = prs.slides.add_slide(BLANK)
add_bg(slide)
add_title_band(slide, "3.1 The Hero SKU — Glow Serum")

add_textbox(slide, Inches(0.5), Inches(1.4), Inches(12.3), Inches(0.4),
            "Why ONE product first (not 10):", font_size=18, bold=True, color=TERRACOTTA)
add_textbox(slide, Inches(0.7), Inches(1.9), Inches(12), Inches(1.0),
            "Mamaearth (aloe vera gel first), Minimalist (vitamin C first), The Derma Co. (aha first), mCaffeine (under-eye first) all proved: single hero SKU → prove demand → expand. Launching 8 SKUs at once with no sales = death.",
            font_size=13, color=FOREST)

add_textbox(slide, Inches(0.5), Inches(3.2), Inches(12.3), Inches(0.4),
            "Product #1 specification:", font_size=18, bold=True, color=TERRACOTTA)
hero_data = [
    ["Attribute", "Detail"],
    ["Name", "RANGAT NATURALS Glow Serum — 'Ujaalo' (Gujarati for brightness)"],
    ["Format", "30ml dark amber glass dropper bottle"],
    ["Hero actives", "10% L-Ascorbic Acid + 1% Hyaluronic Acid + 0.5% Ferulic Acid"],
    ["Supporting", "Vitamin E 0.5%, Kakadu plum extract (Vit C booster), saffron extract"],
    ["Free from", "Mineral oil, parabens, sulphates, synthetic fragrance"],
    ["MRP", "₹499"],
    ["Cost to us", "₹85-95 (incl. packaging)"],
    ["Gross margin", "~78% before marketing"],
]
add_table(slide, hero_data, top=Inches(3.6), col_widths=[2.5, 9.8], font_size=11)


# 3.2 Why this first
slide = prs.slides.add_slide(BLANK)
add_bg(slide)
add_title_band(slide, "3.2 Why This Is the FIRST Product (8 Reasons)")
add_bullets(slide, Inches(0.6), Inches(1.4), Inches(12), Inches(5.5), [
    "1. Massive search demand, low brand loyalty — 6.2 lakh monthly Google searches for 'vitamin C serum' in India",
    "2. Solves a real, visible, emotional problem — pigmentation, dullness, uneven tone (every Indian woman 19-35 wants this)",
    "3. Repeat purchase built in — 30ml ÷ 4-5 drops/day = ~60 days (natural 2-month reorder cycle)",
    "4. Easy to manufacture — every contract mfr (Ozone, Vedic, Marico arms) can make it; not asking for a custom molecule",
    "5. Content-rich — 60+ pieces of content (Reels, carousels, before/after, myth-busting, ingredient deep-dive) about a single serum",
    "6. Testable in 4-6 weeks — vitamin C results show in 4-6 weeks; perfect testimonial window for ads",
    "7. Founder-friendly price — ₹499 is the sweet spot for first-time online skincare buyer (impulse-buy zone, above ₹199-299 'cheap junk' zone)",
    "8. Founder has personal experience — authentically recommends, not from a slide deck",
], font_size=14)


# 3.3 Target customer + product roadmap
slide = prs.slides.add_slide(BLANK)
add_bg(slide)
add_title_band(slide, "3.3 Target Customer + Product Roadmap")

add_textbox(slide, Inches(0.5), Inches(1.4), Inches(6), Inches(0.4),
            "Target customer — 'Aisha, 24, Ahmedabad':", font_size=16, bold=True, color=TERRACOTTA)
add_bullets(slide, Inches(0.7), Inches(1.8), Inches(6), Inches(5.0), [
    "Age: 21-32 (sweet spot 23-28); 90% women, men as secondary after M4",
    "Income: ₹25-75K/month household/personal",
    "City: Tier-1 & Tier-2 (Ahmedabad, Surat, Vadodara → Bangalore, Pune, Mumbai, Hyderabad)",
    "Education: college-educated, English-comfortable, Instagram-active",
    "Skin concern: dullness, pigmentation from sun, post-acne marks, uneven tone",
    "Behaviour: tried 2-4 products (Himalaya, ponds, plum, minimalist); not loyal; doesn't want 10-step routine",
    "Purchase trigger: wedding season, college reunion, festival look, 'glow up for reels'",
    "Primary persona: marketing exec, ₹35K/month, Prahlad Nagar, spends ₹1,500-2,000/month on beauty, wants 'glass skin', trusts real reviews over ads",
], font_size=12)

add_textbox(slide, Inches(7), Inches(1.4), Inches(6), Inches(0.4),
            "Product roadmap (lock-in routine):", font_size=16, bold=True, color=FOREST)
add_bullets(slide, Inches(7.2), Inches(1.8), Inches(6), Inches(5.0), [
    "#1 (M1): Glow Serum ₹499 — 60% of revenue target",
    "#2 (M3-4): Hydra-Repair Moisturizer (5% niacinamide + ceramides) ₹399 — natural next ask",
    "#3 (M5-6): Sunshield SPF 50 PA++++ ₹599 — completes 3-step routine",
    "#4+ (M7+): face wash ₹299 entry, night cream ₹699 (bakuchiol + retinol 0.3%), under-eye ₹449, lip mask ₹299, hair oil ₹399, body lotion ₹399",
    "Rule: don't launch unless we can name 100 customers asking for it",
    "Routine lock-in: 3-step customer = ₹1,497 over 6 months, LTV ₹900+",
    "Bundle strategy: 'Glow Starter' ₹699 (save ₹199), 'RANGAT Routine' ₹1,099 (save ₹398)",
], font_size=12)


# ============================================================
# SECTION 4 — PRICING (3 slides)
# ============================================================
slide = prs.slides.add_slide(BLANK)
add_bg(slide)
add_title_band(slide, "4.1 Unit Economics Reality")
add_textbox(slide, Inches(0.5), Inches(1.4), Inches(12.3), Inches(0.4),
            "Why unit economics matter:", font_size=18, bold=True, color=TERRACOTTA)
add_textbox(slide, Inches(0.7), Inches(1.9), Inches(12), Inches(1.0),
            "A new brand cannot compete on price against giants. We compete on value density (active per ₹). Unit economics MUST work: 60-70% gross margin leaves money for ads, retargeting, inserts, and profit.",
            font_size=13, color=FOREST)

add_textbox(slide, Inches(0.5), Inches(3.0), Inches(12.3), Inches(0.4),
            "Pricing architecture:", font_size=18, bold=True, color=TERRACOTTA)
arch_data = [
    ["Price Point", "Use", "Product example"],
    ["₹299", "Traffic-pull SKU", "Face wash (100ml), Lip balm (10g), Mini trial (15ml)"],
    ["₹399", "Volume SKU (repeat)", "Moisturizer (50g), Under-eye (15g), Hair oil (100ml)"],
    ["₹499", "Hero / Cash cow (60% revenue)", "Vitamin C Glow Serum (30ml), Sunscreen (50g)"],
    ["₹599", "Premium mid", "SPF 50 PA++++ (50g), Night cream retinol (30g)"],
    ["₹699", "Bundle or advanced", "Advanced Night Repair, full Routine Kits"],
    ["₹999+", "Avoid until 50K+ customers", "Luxury positioning not yet earned"],
]
add_table(slide, arch_data, top=Inches(3.4), col_widths=[2.0, 3.5, 6.8], font_size=11)


# 4.2 Price point breakdown
slide = prs.slides.add_slide(BLANK)
add_bg(slide)
add_title_band(slide, "4.2 Price Point Breakdown (₹299 → ₹699)")
price_data = [
    ["Price", "Product Cost", "Packaging", "Inbound+Storage", "Payment (3%)", "Marketplace", "Total Cost", "GM D2C", "Mktg", "Profit"],
    ["₹299", "28-38", "22-30", "8", "9", "30", "97-115", "61-68%", "75", "77-127"],
    ["₹399", "40-55", "28-38", "8", "12", "35", "123-148", "63-69%", "100", "116-141"],
    ["₹499", "70-95", "35-50", "8", "15", "40", "168-208", "58-66%", "125", "126-166"],
    ["₹599", "90-115", "45-60", "8", "18", "45", "206-246", "59-66%", "150", "163-203"],
    ["₹699", "110-140", "55-75", "8", "21", "50", "244-294", "58-65%", "175", "180-230"],
]
add_table(slide, price_data, top=Inches(1.4), col_widths=[0.9, 1.4, 1.3, 1.3, 1.0, 1.2, 1.5, 1.3, 0.9, 1.5], font_size=10)

add_textbox(slide, Inches(0.5), Inches(4.5), Inches(12.3), Inches(0.4),
            "What each price point is for:", font_size=16, bold=True, color=TERRACOTTA)
add_bullets(slide, Inches(0.7), Inches(4.9), Inches(12), Inches(2.0), [
    "₹299 — Traffic-pull: gateway product to acquire first-time customers",
    "₹399 — Volume: best for repeat purchase (moisturizer, body lotion)",
    "₹499 — Hero: cash cow, 60% of revenue target; sweet spot for impulse buy",
    "₹599 — Premium mid: products with multiple actives (sunscreen + niacinamide)",
    "₹699 — Bundle or advanced: multi-active serums, retinol",
], font_size=12)


# 4.3 Bundles + discount policy
slide = prs.slides.add_slide(BLANK)
add_bg(slide)
add_title_band(slide, "4.3 Bundles + Discount Policy")
add_textbox(slide, Inches(0.5), Inches(1.4), Inches(12.3), Inches(0.4),
            "Bundles — lock in 3-product customers:", font_size=16, bold=True, color=TERRACOTTA)
bundle_data = [
    ["Bundle", "MRP", "Bundle Price", "Customer Saves", "Our Margin"],
    ["Glow Starter (Serum + Moisturizer)", "₹898", "₹699 (22% off)", "₹199", "~52%"],
    ["RANGAT 3-Step (Serum + Moisturizer + Sunscreen)", "₹1,497", "₹1,099 (27% off)", "₹398", "~50%"],
    ["Night Ritual (Night Cream + Lip Mask + Under-eye)", "₹1,447", "₹1,099 (24% off)", "₹348", "~51%"],
]
add_table(slide, bundle_data, top=Inches(1.9), col_widths=[4.0, 1.5, 2.0, 2.0, 2.0], font_size=11)

add_textbox(slide, Inches(0.5), Inches(4.5), Inches(12.3), Inches(0.4),
            "Discount policy (CRITICAL — protects margin):", font_size=16, bold=True, color=FOREST)
add_bullets(slide, Inches(0.7), Inches(4.9), Inches(12), Inches(2.2), [
    "Never discount on Amazon unless Amazon pays (Great Indian Festival etc.)",
    "First 100 customer freebies / ₹100 vouchers — Founder can approve",
    "Influencer codes: 15-25% off (never 50% — signals 'not worth full price')",
    "Subscribe & Save: 10% off + free shipping (locks repeat purchase)",
    "Festival/occasion discount capped at 20% (protects premium perception)",
    "Target AOV across all customers: ₹650 (60% buy 1 product, 40% buy 2+)",
], font_size=12)


# ============================================================
# SECTION 5 — GUJARAT (3 slides)
# ============================================================
slide = prs.slides.add_slide(BLANK)
add_bg(slide)
add_title_band(slide, "5.1 Why Gujarat First")
add_textbox(slide, Inches(0.5), Inches(1.4), Inches(12.3), Inches(0.4),
            "Three reasons that outweigh 'national launch':", font_size=18, bold=True, color=TERRACOTTA)
add_bullets(slide, Inches(0.7), Inches(1.9), Inches(12), Inches(5.0), [
    "1. Founder is in Gujarat — founder's WhatsApp is on the box; customers in Ahmedabad reach a real human = 100x trust signal vs chatbot",
    "2. Gujarati consumers are early adopters — Gujarat has highest per-capita retail spend in India after MH; female purchasing power is high; UPI/Jio/WhatsApp penetration is highest",
    "3. Lower CAC — competition in Gujarat skincare is lower than Mumbai/Bangalore; influencer rates 30-50% lower; salons accessible",
    "Strategy: dominate Gujarat in M1-6, then use Gujarat as case study + content library + review bank to expand",
    "By M6, every Gujarati skincare buyer should hear of RANGAT from 2+ of: family → WhatsApp → parlour staff → local press",
], font_size=14)


# 5.2 City-level plan
slide = prs.slides.add_slide(BLANK)
add_bg(slide)
add_title_band(slide, "5.2 City-by-City Plan")
city_data = [
    ["City", "When", "Levers", "Target by M6"],
    ["Ahmedabad (HQ)", "M1-3, 60% focus", "Founder IG, 30 salons, exhibitions, society demos, college ambassadors, derm sampling, garba stalls", "600 customers, ₹3L revenue"],
    ["Gandhinagar", "M1-2 opportunistic", "Govt employee wives network, Infocity/Sargasan IT HR tie-ups, school gifting", "100 customers"],
    ["Surat (diamond capital)", "M3-4", "Diamond merchants' wives, textile showroom collabs, 5 Surat micro-influencers, salon chains (Looks, Lakme)", "400 customers, ₹2L"],
    ["Vadodara", "M4-5", "MSU + Parul student ambassadors, Sayajirao Park walkers, Maruti-Suzuki welfare groups", "250 customers, ₹1.25L"],
    ["Rajkot + Bhavnagar + Jamnagar", "M6+", "Founder's family networks, Saurashtra creators ₹2-3K each, shiprocket delivery", "500 customers, ₹2.5L"],
]
add_table(slide, city_data, top=Inches(1.4), col_widths=[2.2, 1.7, 5.6, 2.8], font_size=11)


# 5.3 Gujarati content + communities
slide = prs.slides.add_slide(BLANK)
add_bg(slide)
add_title_band(slide, "5.3 Gujarati Content + Communities")

add_textbox(slide, Inches(0.5), Inches(1.4), Inches(6), Inches(0.4),
            "Gujarati content playbook:", font_size=16, bold=True, color=TERRACOTTA)
add_bullets(slide, Inches(0.7), Inches(1.8), Inches(6), Inches(5.0), [
    "Half Gujarat's online population consumes Gujarati content",
    "Not translated — culturally Gujarati: 'Kem cho?' hooks, 'dikri ne' tone",
    "Navratri-special: 'Garba ra 9 raat ma skin glow karva nu plan'",
    "Festival-tied drops: Diwali gift sets, Uttarayan dry-skin kits",
    "Local landmark backgrounds (Sabarmati, Law Garden, Kankaria)",
    "Founder testimonials with friends/family ('mari best friend pan have RANGAT vapre che')",
    "Gujarati slang + memes ('sambhalo' warnings)",
    "Mix: 50% English / 30% Hindi / 20% Gujarati (M1-6)",
], font_size=12)

add_textbox(slide, Inches(7), Inches(1.4), Inches(6), Inches(0.4),
            "Communities to tap:", font_size=16, bold=True, color=FOREST)
add_bullets(slide, Inches(7.2), Inches(1.8), Inches(6), Inches(5.0), [
    "Apartment WhatsApp groups (Bodakdev, Prahlad Nagar, Vastrapur) — founder joins as resident",
    "College WhatsApp groups (HL, NID, IIM-A) — friends add founder",
    "Salon customer WhatsApp lists (owner shares info)",
    "Gyms/yoga: Gold's, Cult, Fitness One (post-workout glow)",
    "Wedding planners (10 in Ahmedabad) — bridesmaid gift sets ₹1,499",
    "Maternal & baby stores — mother & baby expo sampling (high repeat)",
    "Garba grounds (HDK, GMDC) — banner + sample distribution",
    "Local press: Gujarat Samachar, Sandesh, Divya Bhaskar, Ahmedabad Mirror",
], font_size=12)


# ============================================================
# SECTION 6 — ACQUISITION LADDER (3 slides)
# ============================================================
slide = prs.slides.add_slide(BLANK)
add_bg(slide)
add_title_band(slide, "6.1 The Principle — Tiered Acquisition")
add_textbox(slide, Inches(0.5), Inches(1.4), Inches(12.3), Inches(0.4),
            "We don't 'launch a marketing campaign.' We acquire customers one tier at a time, each tier funding the next.",
            font_size=14, color=FOREST, bold=True)
tier_data = [
    ["Tier", "Customers", "Months", "CAC", "Funding source"],
    ["1", "First 10", "M0-1", "₹0-50", "Founder's network"],
    ["2", "First 50", "M1", "₹30-80", "Word of mouth + samples"],
    ["3", "First 100", "M1-2", "₹80-120", "Micro-influencers + salon"],
    ["4", "First 500", "M2-3", "₹100-180", "Reels + WhatsApp + exhibitions + first ads"],
    ["5", "First 1,000", "M3-4", "₹150-220", "First paid ads (small) + Amazon"],
    ["6", "First 5,000", "M4-6", "₹180-260", "Scaling Meta + Amazon"],
    ["7", "First 10,000", "M6-9", "₹200-280", "Multi-channel, repeat purchase flywheel"],
]
add_table(slide, tier_data, top=Inches(2.1), col_widths=[0.8, 2.0, 1.5, 1.5, 5.5], font_size=11)


# 6.2 Tier 1-3 deep dive
slide = prs.slides.add_slide(BLANK)
add_bg(slide)
add_title_band(slide, "6.2 Tier 1-3 Deep Dive (First 100 Customers)")
add_textbox(slide, Inches(0.5), Inches(1.4), Inches(6), Inches(0.4),
            "TIER 1 — First 10 (Founder's network)", font_size=14, bold=True, color=TERRACOTTA)
add_bullets(slide, Inches(0.7), Inches(1.8), Inches(6), Inches(2.5), [
    "Personal WhatsApp to 50 known contacts (real humans)",
    "Offer ₹349 (₹150 off). 'I'll refund personally if it doesn't work'",
    "Numbered bottles #1-#10 (special feeling)",
    "Follow up Day 7 personally",
    "Conversion: 20-30% → 10-15 orders",
    "Reorder: 50% by D30 = 5 orders",
], font_size=11)

add_textbox(slide, Inches(7), Inches(1.4), Inches(6), Inches(0.4),
            "TIER 2 — First 50 (Samples + WOM)", font_size=14, bold=True, color=FOREST)
add_bullets(slide, Inches(7.2), Inches(1.8), Inches(6), Inches(2.5), [
    "50 sample kits (5ml mini + insert + ₹50-off coupon)",
    "Hand-deliver to apartment, office, college, gym, family",
    "Sample-to-buy rate: 60-70%",
    "50 samples → 30-35 orders at ₹449",
    "+ 10-15 from Tier 1 = Total 50",
    "Reorder: 60% by D35 = 30 orders",
], font_size=11)

add_textbox(slide, Inches(0.5), Inches(4.5), Inches(6), Inches(0.4),
            "TIER 3 — First 100 (Salons + Influencers)", font_size=14, bold=True, color=TERRACOTTA)
add_bullets(slide, Inches(0.7), Inches(4.9), Inches(6), Inches(2.0), [
    "3-5 salons (Prahlad Nagar, Bodakdev) give samples during facials",
    "5 micro-influencers gifted + unique code",
    "First Gujarati Reels hit 50K+ views",
    "First exhibition (HL College fest, IIM-A cultural)",
    "30 salon + 25 influencer + 10 founder + 35 IG = 100 customers",
    "Cost: ₹3-5K (samples only, no cash influencer)",
], font_size=11)

add_textbox(slide, Inches(7), Inches(4.5), Inches(6), Inches(0.4),
            "Conversion math:", font_size=14, bold=True, color=FOREST)
add_textbox(slide, Inches(7.2), Inches(4.9), Inches(6), Inches(2.0),
            "Tier 1: 10 orders\nTier 2: +40 orders (samples)\nTier 3: +50 orders (salons + influencers + IG)\n= 100 customers cumulative\nCost blended: ₹80-120 per customer\nRevenue: ₹40-50K (AOV ₹450)",
            font_size=12, color=DARK_TEXT)


# 6.3 Tier 4-7
slide = prs.slides.add_slide(BLANK)
add_bg(slide)
add_title_band(slide, "6.3 Tier 4-7 (500 → 10,000 Customers)")
add_textbox(slide, Inches(0.5), Inches(1.4), Inches(12.3), Inches(0.4),
            "Each tier mixes organic + paid; repeat orders compound.", font_size=14, color=FOREST, bold=True)

tier_more = [
    ["Tier", "When", "Channels (mix)", "Expected orders", "CAC"],
    ["4: First 500", "M2-3", "100 IG organic + 150 Meta ads (₹15K) + 100 WhatsApp+referrals + 100 salons/exhibitions + 50 Amazon", "500 cumulative", "₹100-180"],
    ["5: First 1,000", "M3-4", "400 Meta (₹45K) + 200 Amazon (₹20K ads) + 150 IG/referrals + 100 salons/exhibitions + 100 Nykaa/WA + 50 Surat/Vadodara", "1,000 cumulative", "₹150-220"],
    ["6: First 5,000", "M4-6", "National Meta ₹1.5L/mo + Google ₹30-50K + Amazon Sponsored + 100 micro-influencers + PR + launch Sunscreen + cross-sell", "5,000 cumulative", "₹180-260"],
    ["7: First 10,000", "M6-9", "Brand search ads + retargeting 50K+ visitors + 300+ creators + 1,500-2K subscribers + RANGAT Club loyalty + corporate gifting 30 IT companies", "10,000 cumulative", "₹200-280"],
]
add_table(slide, tier_more, top=Inches(2.0), col_widths=[1.8, 1.3, 6.7, 1.8, 1.2], font_size=10)


# ============================================================
# SECTION 7 — LOW BUDGET (2 slides)
# ============================================================
slide = prs.slides.add_slide(BLANK)
add_bg(slide)
add_title_band(slide, "7.1 The Budget Hierarchy")
add_textbox(slide, Inches(0.5), Inches(1.4), Inches(12.3), Inches(0.4),
            "Most Indian D2C founders start with ₹1-3 lakh personal savings. We plan like every rupee is the last.",
            font_size=14, color=FOREST, bold=True)

budget_data = [
    ["Phase", "Monthly", "Largest line items"],
    ["₹10K Bootstrapping", "Founder time + 10 free samples", "Founder sweat equity"],
    ["₹25K Launch", "Inventory + first paid ads", "Product (₹7.5K) + Meta test (₹4.2K) + stall (₹5K)"],
    ["₹50K Growth", "Inventory + scaled Meta + Amazon", "Ads + Amazon (₹22K + ₹15K + ₹8K)"],
    ["₹1L Scale", "Ads dominate (50%+ budget)", "Meta + Google + Amazon + Influencers"],
    ["₹3L+ National", "Ads + team + marketplaces", "Meta + Amazon + team salaries"],
    ["₹10L+ Established", "TV/OOH/celeb (Phase 3 only)", "Mix of paid channels"],
]
add_table(slide, budget_data, top=Inches(2.0), col_widths=[2.5, 4.0, 5.8], font_size=11)


# 7.2 Budget breakdown
slide = prs.slides.add_slide(BLANK)
add_bg(slide)
add_title_band(slide, "7.2 Budget Breakdown (₹10K / ₹25K / ₹50K / ₹1L)")
breakdown_data = [
    ["Item", "₹10K", "₹25K", "₹50K", "₹1L"],
    ["First batch product", "1,500", "7,500", "22,000", "50,000"],
    ["Free samples", "1,500", "3,000", "3,000", "—"],
    ["Meta ads", "—", "4,200", "15,000", "50,000"],
    ["Amazon setup + first reviews", "—", "—", "8,000", "15,000"],
    ["Exhibition stall", "—", "5,000", "8,000", "—"],
    ["Salon partnership samples", "—", "1,500", "4,500", "—"],
    ["Influencer gifting", "—", "—", "7,500", "20,000"],
    ["Surat activation (exhibitions + salons + creators)", "—", "—", "—", "25,000"],
    ["Nykaa onboarding + listing photos", "—", "—", "—", "15,000"],
    ["Packaging insert + design", "200", "1,500", "2,000", "8,000"],
    ["Subscription tool (Loop)", "—", "—", "—", "2,500"],
    ["Shipping subsidies", "800", "3,000", "8,000", "—"],
    ["Misc / buffer", "5,000+", "2,300", "4,000", "9,500"],
    ["TOTAL (approx)", "10K", "25K", "81K (funded by 25K+25K rev)", "1.95L (funded by 1L+revenue)"],
]
add_table(slide, breakdown_data, top=Inches(1.4), col_widths=[4.0, 2.0, 2.0, 2.0, 3.3], font_size=10)

add_textbox(slide, Inches(0.5), Inches(6.3), Inches(12.3), Inches(0.5),
            "Golden rule at every budget: 40-50% INVENTORY • 30-40% CUSTOMER ACQUISITION • 10-15% BRAND/PACKAGING • 5-10% BUFFER",
            font_size=13, color=TERRACOTTA, bold=True)


# ============================================================
# SECTION 8 — ORGANIC (3 slides)
# ============================================================
slide = prs.slides.add_slide(BLANK)
add_bg(slide)
add_title_band(slide, "8.1 Why Organic First")
add_textbox(slide, Inches(0.5), Inches(1.4), Inches(12.3), Inches(0.4),
            "The principle:", font_size=18, bold=True, color=TERRACOTTA)
add_textbox(slide, Inches(0.7), Inches(1.9), Inches(12), Inches(1.5),
            "Paid ads are the easiest way to spend money. Organic is the hardest way to make money. That is exactly why we start organic — and only move to paid when organic is exhausted. A brand that can't sell organically will fail the day its ad budget runs out.",
            font_size=14, color=FOREST)

add_textbox(slide, Inches(0.5), Inches(3.8), Inches(12.3), Inches(0.4),
            "What organic gives us:", font_size=16, bold=True, color=TERRACOTTA)
add_bullets(slide, Inches(0.7), Inches(4.2), Inches(12), Inches(2.5), [
    "Customer learnings — what hooks work, what objections come up, what language customers use, what builds trust",
    "We then feed these learnings into paid ads (creative + audience + offer)",
    "Lower CAC, compounding returns, sustainable flywheel",
    "Real testimonials and UGC that money can't buy",
], font_size=14)


# 8.2 Instagram organic
slide = prs.slides.add_slide(BLANK)
add_bg(slide)
add_title_band(slide, "8.2 Instagram Organic Playbook")

add_textbox(slide, Inches(0.5), Inches(1.4), Inches(6), Inches(0.4),
            "Content pillars (5 types, rotate weekly):", font_size=16, bold=True, color=TERRACOTTA)
add_bullets(slide, Inches(0.7), Inches(1.8), Inches(6), Inches(5.0), [
    "Educational (Ingredients) — 25%",
    "Founder-led (Human) — 25%",
    "Customer (UGC + testimonials) — 20%",
    "Routine / How-to — 20%",
    "Promo / Product — 10%",
    "Posting cadence: 5-7 Reels/week, 2-3 carousels, daily stories, 1 weekly live",
    "Best times IST: 9 PM, 12 PM, 8 PM",
    "Bio: 'Honest skincare from Gujarat 🌿 | 10% Vit C @ ₹499 | Shop👇'",
    "Highlights: Our Story • Ingredients • Reviews • Routine • FAQs",
], font_size=12)

add_textbox(slide, Inches(7), Inches(1.4), Inches(6), Inches(0.4),
            "Production (DIY — total cost ~₹2K/month):", font_size=16, bold=True, color=FOREST)
add_bullets(slide, Inches(7.2), Inches(1.8), Inches(6), Inches(5.0), [
    "Equipment: phone (iPhone 12+/flagship Android) + ring light ₹500 + tripod ₹400 + lavalier mic ₹600",
    "Format: vertical 9:16, 15-60 sec, first 1.5 sec = hook",
    "Editing: CapCut (free) + captions (text-on-screen) + trending audio + 1080p export",
    "30 proven hooks (e.g., 'Stop scrolling if you've ever wasted money on skincare')",
    "20 carousel ideas (5 mistakes with vitamin C, morning vs night routine)",
    "Daily stories: BTS, customer DMs, polls, question box, product in hand",
    "Weekly Live Sunday 8 PM: 30-45 min, founder-led, Q&A + demo + special offer",
], font_size=12)


# 8.3 WhatsApp + offline organic
slide = prs.slides.add_slide(BLANK)
add_bg(slide)
add_title_band(slide, "8.3 WhatsApp + Offline Organic")
add_textbox(slide, Inches(0.5), Inches(1.4), Inches(6), Inches(0.4),
            "WhatsApp — most underused channel in Indian D2C:", font_size=16, bold=True, color=TERRACOTTA)
add_bullets(slide, Inches(0.7), Inches(1.8), Inches(6), Inches(5.0), [
    "Tools: WhatsApp Business App (free, first 1K customers); Wati/Interakt (₹1,500/mo from M6)",
    "Funnel: lead capture → nurture → conversion → retention",
    "D0: order placed welcome + tracking",
    "D3: 'Start with 3 drops on clean skin in the morning'",
    "D7: 'How's your skin feeling? Reply with good or irritated'",
    "D30: reorder + ₹50 off",
    "D45: cross-sell moisturizer (₹100 off)",
    "D60: 'Tell a friend, get ₹100'",
    "5 broadcast lists of 256 each (1,280 max)",
    "Daily WhatsApp status: BTS, packing, founder life (5-10/day)",
], font_size=12)

add_textbox(slide, Inches(7), Inches(1.4), Inches(6), Inches(0.4),
            "Offline organic selling:", font_size=16, bold=True, color=FOREST)
add_bullets(slide, Inches(7.2), Inches(1.8), Inches(6), Inches(5.0), [
    "Exhibitions: college fests, garba grounds, Diwali mela, wedding expos (30-300/event)",
    "Pop-up stores: high-street malls (₹8-25K/weekend, 20-50 bottles)",
    "Society commerce: founder joins 5-10 apartment WhatsApp groups; clubhouse demos (15-25 customers/event)",
    "Office commerce: HR teams of 5-10 IT companies; 'wellness Wednesday' (10-15% conversion)",
    "Wedding commerce: 10 planners × bridesmaid gift boxes ₹999 × 10-30 boxes/wedding",
    "Community: WhatsApp Glow Circle of 100-200 customers; quarterly offline 'Skincare 101' workshop",
    "Expected: at M12, organic = 30-40% of total orders",
], font_size=12)


# ============================================================
# SECTION 9 — SOCIAL MEDIA (2 slides)
# ============================================================
slide = prs.slides.add_slide(BLANK)
add_bg(slide)
add_title_band(slide, "9.1 Platform Priority + Multilingual Mix")
add_textbox(slide, Inches(0.5), Inches(1.4), Inches(12.3), Inches(0.4),
            "Platform priority (M1-6):", font_size=18, bold=True, color=TERRACOTTA)
plat_data = [
    ["#", "Platform", "Why"],
    ["1", "Instagram", "Indian women 18-35 live here; visual, shoppable, Reels-friendly"],
    ["2", "WhatsApp", "Most direct, highest-conversion channel in India"],
    ["3", "YouTube", "Long-form reviews, ingredient deep-dives, SEO compounding (5+ year shelf life)"],
    ["4", "Facebook", "Older demo (30-50), retargeting only"],
    ["5", "Pinterest", "Skincare boards, drives Google traffic for years"],
    ["6", "Twitter/X", "PR, founder thought leadership"],
    ["7", "LinkedIn", "B2B, recruitment, PR (founder personal)"],
    ["Skip", "Snapchat/TikTok", "Low ROI / banned in India"],
]
add_table(slide, plat_data, top=Inches(1.9), col_widths=[0.7, 2.5, 9.1], font_size=11)

add_textbox(slide, Inches(0.5), Inches(5.5), Inches(12.3), Inches(0.4),
            "Multilingual content:", font_size=16, bold=True, color=FOREST)
add_bullets(slide, Inches(0.7), Inches(5.9), Inches(12), Inches(1.2), [
    "50% English / 30% Hindi (Hinglish) / 20% Gujarati in M1-6 (when 70% revenue is Gujarat)",
    "By M9, English dominates as national reach kicks in",
], font_size=12)


# 9.2 Weekly template + hooks
slide = prs.slides.add_slide(BLANK)
add_bg(slide)
add_title_band(slide, "9.2 Weekly Calendar + 30 Hooks")
cal_data = [
    ["Day", "Format", "Topic"],
    ["Mon", "Reel", "Educational (ingredient)"],
    ["Tue", "Carousel", "Routine / how-to"],
    ["Wed", "Reel", "Founder-led (personal)"],
    ["Thu", "Static + Story", "Customer UGC"],
    ["Fri", "Reel", "Trending hook / relatable"],
    ["Sat", "Live", "Q&A / Routine demo"],
    ["Sun", "Reel", "Promo / product spotlight"],
]
add_table(slide, cal_data, top=Inches(1.4), col_widths=[1.5, 2.5, 8.3], font_size=11)

add_textbox(slide, Inches(0.5), Inches(4.3), Inches(12.3), Inches(0.4),
            "Top 12 Reel hooks (first 1.5 seconds decide watch/skip):", font_size=16, bold=True, color=TERRACOTTA)
add_bullets(slide, Inches(0.7), Inches(4.7), Inches(12), Inches(2.4), [
    "\"Stop scrolling if you've ever wasted money on skincare\"  •  \"I tried 30 vitamin C serums — here's what I learned\"",
    "\"Why I left my job to make ₹499 serums\"  •  \"Apply your serum like THIS, not like that\"",
    "\"The biggest lie in Indian skincare\"  •  \"5 ingredients your dermatologist actually wants you to use\"",
    "\"If your serum is ₹299, this is why\"  •  \"Customer review that made me tear up\"",
    "\"Why we put 10% on the front of the box\"  •  \"What ₹499 buys you at RANGAT NATURALS\"",
    "\"The one skincare mistake I see everywhere\"  •  \"Don't buy sunscreen until you watch this\"",
], font_size=11)


# ============================================================
# SECTION 10 — ADVERTISING (3 slides)
# ============================================================
slide = prs.slides.add_slide(BLANK)
add_bg(slide)
add_title_band(slide, "10.1 When to Start Ads (Critical)")
add_textbox(slide, Inches(0.5), Inches(1.4), Inches(12.3), Inches(0.6),
            "DO NOT run paid ads in Month 1.", font_size=22, bold=True, color=TERRACOTTA)
add_textbox(slide, Inches(0.7), Inches(2.1), Inches(12), Inches(1.5),
            "Most new Indian brands burn their budget on Day 1 ads and have no money for M2. Paid ads require creative + audience + offer + funnel + retargeting. None exist on Day 1. Without them, every rupee is wasted.",
            font_size=14, color=FOREST)

add_textbox(slide, Inches(0.5), Inches(3.8), Inches(12.3), Inches(0.4),
            "Right sequence:", font_size=16, bold=True, color=TERRACOTTA)
seq_data = [
    ["Stage", "Ad spend allowed", "Why"],
    ["0-50 customers", "₹0", "Build organic (IG + WhatsApp + salons + samples)"],
    ["50-500", "₹15K/mo total", "First Meta test ₹500/day; validate"],
    ["500-2,000", "₹50K-1L/mo", "Scale what works; Amazon ads"],
    ["2,000-5,000", "₹1.5-3L/mo", "Multi-channel (Meta + Google + Amazon + influencers)"],
    ["5,000+", "₹3-10L/mo", "Brand search + retargeting + loyalty"],
]
add_table(slide, seq_data, top=Inches(4.2), col_widths=[3.0, 3.0, 6.3], font_size=11)


# 10.2 Meta Ads structure
slide = prs.slides.add_slide(BLANK)
add_bg(slide)
add_title_band(slide, "10.2 Meta Ads — Campaign Structure (Month 3 Starter)")
add_textbox(slide, Inches(0.5), Inches(1.4), Inches(12.3), Inches(0.4),
            "3 campaigns × ₹500/day = ₹1,500/day = ₹45,000/month to start", font_size=14, color=FOREST, bold=True)

camp_data = [
    ["Campaign", "Objective", "Budget", "Audience", "Creative"],
    ["Top of Funnel (Awareness)", "Video views / Profile visits", "₹500/day", "Women 21-32, Ahmedabad + 50km; interests: minimalist, plum, mCaffeine, skincare", "Best-performing Reels (already viral organically)"],
    ["Middle of Funnel (Consideration)", "Website visits / Add to cart", "₹500/day", "Women 21-35, India; interests: skincare, beauty", "Carousel of ingredient breakdown + founder video"],
    ["Bottom of Funnel (Conversion)", "Purchase / Add to cart", "₹500/day", "Retargeting: website visitors + IG engagers + customer lookalikes", "UGC testimonials + offer ('₹100 off first order')"],
]
add_table(slide, camp_data, top=Inches(1.9), col_widths=[2.2, 2.2, 1.3, 3.5, 3.1], font_size=10)


# 10.3 Google + Amazon + scaling
slide = prs.slides.add_slide(BLANK)
add_bg(slide)
add_title_band(slide, "10.3 Google + Amazon Ads + Scaling Roadmap")

add_textbox(slide, Inches(0.5), Inches(1.4), Inches(6), Inches(0.4),
            "Google Ads (start M4-5):", font_size=14, bold=True, color=TERRACOTTA)
add_bullets(slide, Inches(0.7), Inches(1.8), Inches(6), Inches(5.0), [
    "Search: 'vitamin c serum', 'niacinamide serum', 'sunscreen no white cast' (₹1-2K/day, CPC ₹5-15, CVR 3-5%)",
    "Shopping: visual product ads",
    "YouTube pre-roll: on competitor videos (₹500/day)",
    "Brand search (defense): 'rangatnaturals serum' (₹100-300/day, CVR 8-15%)",
    "Monthly: M4-5: ₹15-45K → M6-9: ₹45-90K → M9-12: ₹90-150K",
], font_size=11)

add_textbox(slide, Inches(7), Inches(1.4), Inches(6), Inches(0.4),
            "Amazon Ads (start M3-4):", font_size=14, bold=True, color=FOREST)
add_bullets(slide, Inches(7.2), Inches(1.8), Inches(6), Inches(5.0), [
    "Sponsored Products (keyword bidding, ₹500-1,500/day)",
    "Sponsored Brands (banner on Amazon, ₹300-500/day)",
    "Sponsored Display (retarget browsers, ₹300-500/day)",
    "Deals: Lightning/Save during sales",
    "ACoS target: 25-35% early → 20-25% later; TACoS < 15%",
], font_size=11)

add_textbox(slide, Inches(0.5), Inches(5.4), Inches(12.3), Inches(0.4),
            "Meta scaling roadmap:", font_size=14, bold=True, color=TERRACOTTA)
add_textbox(slide, Inches(0.7), Inches(5.8), Inches(12), Inches(1.2),
            "M3: ₹500-1,500/day, 3-5 ad sets, ROAS 1.5-2x  •  M4: ₹1,500-2,500/day, 6-10 ad sets, ROAS 1.8-2.5x  •  M5: ₹2,500-5,000/day, 10-15 ad sets, ROAS 2.0-2.8x  •  M6: ₹5,000-8,000/day, 15-20 ad sets, ROAS 2.2-3.0x  •  M9: ₹8,000-15,000/day, 20-30 ad sets, ROAS 2.5-3.5x",
            font_size=12, color=FOREST, bold=True)


# ============================================================
# SECTION 11 — TRUST (2 slides)
# ============================================================
slide = prs.slides.add_slide(BLANK)
add_bg(slide)
add_title_band(slide, "11.1 Why Trust Is the Hardest Part")
add_textbox(slide, Inches(0.5), Inches(1.4), Inches(12.3), Inches(0.4),
            "For an unknown brand, trust > product. Customers can buy a similar product from a known brand. We remove the risk in their head:",
            font_size=14, color=FOREST, bold=True)
add_bullets(slide, Inches(0.7), Inches(2.0), Inches(12), Inches(1.5), [
    "\"What if it's fake?\"  •  \"What if it ruins my skin?\"  •  \"What if I don't get a refund?\"  •  \"What if they don't reply to my complaint?\"",
], font_size=14)

add_textbox(slide, Inches(0.5), Inches(3.7), Inches(12.3), Inches(0.4),
            "The Trust Stack (10 layers):", font_size=16, bold=True, color=TERRACOTTA)
trust_data = [
    ["#", "Layer", "Where it shows"],
    ["1", "Visible ingredient % on FRONT of pack", "Packaging, website, ads"],
    ["2", "Founder WhatsApp in box", "Inside every box"],
    ["3", "Social proof: reviews, UGC, testimonials", "Website, Amazon, IG"],
    ["4", "Manufacturing transparency: ISO/GMP/city", "Box, website, factory Reels"],
    ["5", "Compliance: CDSCO notified, cruelty-free", "Packaging, website footer"],
    ["6", "Risk reversal: 7-day money-back guarantee", "Banner, ads, product page"],
    ["7", "Customer support: < 1 hr WhatsApp reply", "DMs, WhatsApp"],
    ["8", "Return/refund: 7-day no questions asked", "Website, insert"],
    ["9", "Consistent content (daily posts, weekly lives)", "Instagram"],
    ["10", "Public proof (founder packing, factory visit)", "Reels, LinkedIn, PR"],
]
add_table(slide, trust_data, top=Inches(4.1), col_widths=[0.7, 5.5, 6.1], font_size=11)


# 11.2 Reviews + testimonials
slide = prs.slides.add_slide(BLANK)
add_bg(slide)
add_title_band(slide, "11.2 Reviews + Compliance + Refunds")

add_textbox(slide, Inches(0.5), Inches(1.4), Inches(6), Inches(0.4),
            "Reviews roadmap:", font_size=16, bold=True, color=TERRACOTTA)
add_bullets(slide, Inches(0.7), Inches(1.8), Inches(6), Inches(5.0), [
    "M3: 50-100 reviews, target 4.4+",
    "M6: 300-500 reviews, target 4.5+",
    "M12: 2,000+ reviews, target 4.5+",
    "M6: 30 video testimonials",
    "M12: 200 video testimonials",
    "Methods: in-box insert, WhatsApp follow-up, Amazon Vine (₹5-15K for 30 reviews), gifting",
    "NEVER: buy fake reviews, incentivize 5-stars only, use stock photos as reviews",
    "Before/after: consent + same lighting + 'results may vary'",
    "Refund target: < 2% (vs industry 3-5%)",
    "NPS: 50+ by M6, 65+ by M12",
], font_size=11)

add_textbox(slide, Inches(7), Inches(1.4), Inches(6), Inches(0.4),
            "Compliance + certifications:", font_size=16, bold=True, color=FOREST)
add_bullets(slide, Inches(7.2), Inches(1.8), Inches(6), Inches(5.0), [
    "Mandatory (Indian law): CDSCO Sugam notification (₹5-10K/product), mfg license (in mfr cost), INCI labelling, batch number, MRP, expiry, net weight",
    "Voluntary trust signals: Cruelty-free / Vegan (₹0-15K/yr), Dermatologically tested (₹30-80K/product), GMP-certified (already required)",
    "What we display on pack: 'Made in India 🇮🇳', 'Cruelty-free 🐰', 'Dermatologically tested', 'Manufactured in GMP-certified facility', batch/MFG/EXP, MRP, net weight, customer care, founder WhatsApp (first 6 months), QR code → full ingredient breakdown",
    "RANGAT Promise: '7-day no-questions refund; if skin reacts, refund + derm-recommended alternative; damaged product replaced immediately'",
], font_size=11)


# ============================================================
# SECTION 12 — REPEAT PURCHASE (3 slides)
# ============================================================
slide = prs.slides.add_slide(BLANK)
add_bg(slide)
add_title_band(slide, "12.1 Why Repeat Purchase Is THE Metric")
add_textbox(slide, Inches(0.5), Inches(1.4), Inches(12.3), Inches(0.4),
            "The math:", font_size=18, bold=True, color=TERRACOTTA)
add_textbox(slide, Inches(0.7), Inches(1.9), Inches(12), Inches(1.2),
            "New skincare brand with 1,000 customers: spend ₹200 to acquire 1/day → 365 new customers/year, OR get 30% to reorder → 300 orders from same base. Option B is 5x cheaper — and the foundation of a brand.",
            font_size=14, color=FOREST)

add_textbox(slide, Inches(0.5), Inches(3.3), Inches(12.3), Inches(0.4),
            "Reorder cycles by product (drives the calendar):", font_size=16, bold=True, color=TERRACOTTA)
cycle_data = [
    ["Product", "Daily usage", "Size", "Reorder cycle"],
    ["Glow Serum (30ml)", "0.25ml", "30ml", "120 days (4 mo)"],
    ["Hydra Moisturizer (50g)", "0.8g", "50g", "62 days (2 mo)"],
    ["Sunshield SPF (50g)", "1.2g", "50g", "42 days (1.5 mo)"],
    ["Face Wash (100ml)", "1.5ml", "100ml", "67 days (2 mo)"],
    ["Night Cream (30g)", "0.5g", "30g", "60 days (2 mo)"],
    ["Hair Oil (100ml)", "2ml", "100ml", "50 days (1.7 mo)"],
]
add_table(slide, cycle_data, top=Inches(3.7), col_widths=[4.0, 2.5, 2.5, 3.3], font_size=11)


# 12.2 Reorder + cross-sell engine
slide = prs.slides.add_slide(BLANK)
add_bg(slide)
add_title_band(slide, "12.2 Reorder + Cross-Sell + Subscription")

add_textbox(slide, Inches(0.5), Inches(1.4), Inches(6), Inches(0.4),
            "WhatsApp reorder engine:", font_size=16, bold=True, color=TERRACOTTA)
add_bullets(slide, Inches(0.7), Inches(1.8), Inches(6), Inches(5.0), [
    "D0: Order placed welcome + tracking",
    "D3: 'Start with 3 drops on clean skin'",
    "D7: 'How's your skin feeling?' + ask for review",
    "D14: Real customer results (carousel)",
    "D30: Reorder + ₹50 off (1-tap)",
    "D45 (if not reordered): Last chance ₹50 off",
    "D45 (cross-sell): 'Pair with moisturizer ₹100 off: PAIR100'",
    "D60: '87% pair with moisturizer'",
    "D75: Bundle last call (Serum + Moisturizer ₹699)",
    "Email parallel sequence with same cadence",
], font_size=11)

add_textbox(slide, Inches(7), Inches(1.4), Inches(6), Inches(0.4),
            "Subscriptions + loyalty:", font_size=16, bold=True, color=FOREST)
add_bullets(slide, Inches(7.2), Inches(1.8), Inches(6), Inches(5.0), [
    "Subscribe & Save: every 30/45/60 days; 15% off + free shipping (Loop app ₹1.5K/mo)",
    "Subscription % targets: M3 5% → M6 10% → M12 15-20%",
    "Bundles: 'Glow Starter' ₹699, 'RANGAT 3-Step' ₹1,099, 'Night Ritual' ₹1,099, 'Travel Kit' ₹599",
    "Bundle conversion target: 15-20% of single-product customers in 90 days",
    "Loyalty: RANGAT Glow Club (3 tiers — Starter ₹0-2K, Hero ₹2-5K, Legend ₹5K+)",
    "Points: 1/₹10 → 100 pts = ₹100 off; 1000 pts = free product",
    "Referral: 'Give ₹100, Get ₹100' (5-8% in Y1, 15% in Y2)",
    "Win-back: D90 (slipping), D180 (lapsed), D365 (churned)",
], font_size=11)


# 12.3 LTV math
slide = prs.slides.add_slide(BLANK)
add_bg(slide)
add_title_band(slide, "12.3 LTV Calculation + Scorecard")
add_textbox(slide, Inches(0.5), Inches(1.4), Inches(12.3), Inches(0.4),
            "LTV formula: AOV × Purchase Frequency × Customer Lifespan × Gross Margin",
            font_size=14, color=FOREST, bold=True)

ltv_data = [
    ["Cohort: 1,000 customers (Year 1)", "Conservative", "Realistic", "Optimistic"],
    ["AOV", "₹500", "₹550", "₹600"],
    ["Orders per customer", "1.5", "2.0", "2.5"],
    ["Gross margin", "55%", "60%", "65%"],
    ["LTV per customer", "₹413", "₹660", "₹975"],
    ["CAC (target ₹200)", "—", "—", "—"],
    ["LTV:CAC ratio", "2.1:1", "3.3:1 ✓", "4.9:1"],
]
add_table(slide, ltv_data, top=Inches(1.9), col_widths=[5.5, 2.2, 2.2, 2.4], font_size=12)

add_textbox(slide, Inches(0.5), Inches(4.7), Inches(12.3), Inches(0.4),
            "Repeat purchase scorecard:", font_size=16, bold=True, color=TERRACOTTA)
scorecard_data = [
    ["Metric", "M3", "M6", "M12"],
    ["Repeat purchase (90-day)", "25%", "35%", "45%"],
    ["Bundle attach", "5%", "12%", "20%"],
    ["Subscription conversion", "3%", "8%", "15%"],
    ["Referral rate", "2%", "6%", "12%"],
    ["AOV (all customers)", "₹500", "₹600", "₹700"],
    ["LTV (Year 1)", "₹400", "₹600", "₹900"],
    ["LTV:CAC", "2:1", "3:1", "4:1"],
]
add_table(slide, scorecard_data, top=Inches(5.1), col_widths=[5.5, 2.2, 2.2, 2.4], font_size=11)


# ============================================================
# SECTION 13 — COMPETITORS (2 slides)
# ============================================================
slide = prs.slides.add_slide(BLANK)
add_bg(slide)
add_title_band(slide, "13.1 The Landscape Map")
landscape_data = [
    ["Category", "Examples", "Price band", "Their weakness"],
    ["Pharma giants", "Himalaya, Patanjali, Cipla, Emami", "₹50-₹500", "Weak actives, no innovation"],
    ["Derm brands", "Cetaphil, CeraVe, Eucerin", "₹400-₹1,500", "Imported, weak for Indian climate"],
    ["Heritage Indian", "Forest Essentials, Kama, Biotique", "₹500-₹3,000", "No actives, 'pure' Ayurveda"],
    ["Modern D2C", "Minimalist, Plum, mCaffeine, The Derma Co.", "₹300-₹800", "Crowded, expensive CAC, copy-paste"],
    ["Instagram brands", "Sugandha, Pahadi, Just Herbs", "₹300-₹900", "No lab, scaling issues"],
    ["Amazon generics", "50+ no-name brands", "₹99-₹499", "No brand, no loyalty"],
    ["Pharmacy skincare", "Simple, Bioderma, La Roche-Posay", "₹400-₹2,500", "Imported, weak Indian formulation"],
]
add_table(slide, landscape_data, top=Inches(1.4), col_widths=[2.5, 4.0, 2.0, 3.8], font_size=11)


# 13.2 Gap + don't copy
slide = prs.slides.add_slide(BLANK)
add_bg(slide)
add_title_band(slide, "13.2 The Gap + What We Never Do")

add_textbox(slide, Inches(0.5), Inches(1.4), Inches(12.3), Inches(0.5),
            "The white space:", font_size=18, bold=True, color=TERRACOTTA)
add_textbox(slide, Inches(0.7), Inches(1.9), Inches(12), Inches(1.5),
            "No brand combines (1) active-led formulation, (2) Indian climate testing, (3) founder accessibility, (4) routine simplicity, at ₹299-₹599, with full ingredient transparency. Minimalist has 1+4, not 2+3. Himalaya has 1+4 weakly, not 3. Forest Essentials has 4, not 1. RANGAT owns all four.",
            font_size=14, color=FOREST, bold=True)

add_textbox(slide, Inches(0.5), Inches(3.7), Inches(12.3), Inches(0.4),
            "The 'Don't Copy' Manifesto:", font_size=16, bold=True, color=TERRACOTTA)
add_bullets(slide, Inches(0.7), Inches(4.1), Inches(12), Inches(3.0), [
    "❌ Use Minimalist's grey / Plum's purple / mCaffeine's black",
    "❌ Use the word 'minimalist' (it's their word)",
    "❌ Claim 'Korean / Japanese' inspiration (we are proudly Indian)",
    "❌ Launch 30 SKUs in Year 1 (focused, not scattered)",
    "❌ Buy 5-star reviews (we earn them)",
    "❌ Fear-based marketing (we are honest)",
    "❌ Sponsor Bollywood celebrity at our stage (we sponsor founder WhatsApp)",
    "❌ Hide actives in the back (we put them on the front)",
    "Pricing: mid-market ₹299-₹699  •  Moat: founder trust + Gujarat distribution + review depth",
], font_size=12)


# ============================================================
# SECTION 14 — CHANNELS (2 slides)
# ============================================================
slide = prs.slides.add_slide(BLANK)
add_bg(slide)
add_title_band(slide, "14.1 Channel Priority — The 20-Channel Map")
add_textbox(slide, Inches(0.5), Inches(1.4), Inches(12.3), Inches(0.4),
            "Trying all 20 at once is the #1 reason Indian D2C brands fail. Cash + attention spread thin.",
            font_size=14, color=FOREST, bold=True)

ch_data = [
    ["#", "Channel", "When", "#", "Channel", "When"],
    ["1", "Instagram organic", "Day 1", ["11", "Nykaa", "M4-5"], ],
    ["2", "WhatsApp Business", "Day 1", ["12", "Google Ads", "M4-5"], ],
    ["3", "D2C website (Shopify)", "Week 1", ["13", "Society commerce", "M3+"], ],
    ["4", "Salons (offline)", "Week 2-3", ["14", "Wedding commerce", "M4+"], ],
    ["5", "Local exhibitions", "Week 3-4", ["15", "Meesho", "M6+"], ],
    ["6", "Amazon India", "M2-3", ["16", "Beauty clinics", "M6+"], ],
    ["7", "Meta ads", "M3+", ["17", "Local cosmetic stores", "M6+"], ],
    ["8", "Micro-influencer network", "M2+", ["18", "Pharmacies", "Phase 2"], ],
    ["9", "YouTube long-form", "M2+", ["19", "Big retail chains", "Phase 2-3"], ],
    ["10", "Flipkart", "M4-5", ["20", "International", "Phase 4"], ],
]
# Reformat as table
ch_table = [
    ["#", "Channel", "When", "#", "Channel", "When"],
    ["1", "Instagram organic", "Day 1", "11", "Nykaa", "M4-5"],
    ["2", "WhatsApp Business", "Day 1", "12", "Google Ads", "M4-5"],
    ["3", "D2C website (Shopify)", "Week 1", "13", "Society commerce", "M3+"],
    ["4", "Salons (offline)", "Week 2-3", "14", "Wedding commerce", "M4+"],
    ["5", "Local exhibitions", "Week 3-4", "15", "Meesho", "M6+"],
    ["6", "Amazon India", "M2-3", "16", "Beauty clinics", "M6+"],
    ["7", "Meta ads", "M3+", "17", "Local cosmetic stores", "M6+"],
    ["8", "Micro-influencer network", "M2+", "18", "Pharmacies", "Phase 2"],
    ["9", "YouTube long-form", "M2+", "19", "Big retail chains", "Phase 2-3"],
    ["10", "Flipkart", "M4-5", "20", "International", "Phase 4"],
]
add_table(slide, ch_table, top=Inches(1.9), col_widths=[0.6, 3.0, 1.8, 0.6, 3.0, 2.3], font_size=10)


# 14.2 Target mix + decision tree
slide = prs.slides.add_slide(BLANK)
add_bg(slide)
add_title_band(slide, "14.2 Target Mix + Decision Tree")

add_textbox(slide, Inches(0.5), Inches(1.4), Inches(12.3), Inches(0.4),
            "Target channel mix at Month 12:", font_size=16, bold=True, color=TERRACOTTA)
mix_data = [
    ["Channel", "% of revenue"],
    ["D2C website (Shopify)", "35-40%"],
    ["Amazon", "25-30%"],
    ["Instagram/WhatsApp organic", "15-20%"],
    ["Salons + offline events", "5-10%"],
    ["Nykaa", "5-8%"],
    ["Flipkart", "3-5%"],
    ["Other (Meesho, society, wedding)", "2-5%"],
]
add_table(slide, mix_data, top=Inches(1.9), col_widths=[6.5, 5.8], font_size=12)

add_textbox(slide, Inches(0.5), Inches(5.0), Inches(12.3), Inches(0.4),
            "Decision tree:", font_size=16, bold=True, color=FOREST)
add_textbox(slide, Inches(0.7), Inches(5.4), Inches(12), Inches(1.6),
            "Are you at < 100 customers? → Focus ONLY on Instagram + WhatsApp + salons. Nothing else.\n< 1,000? → Add D2C site + Amazon + micro-influencers + exhibitions.\n< 5,000? → Add Meta ads + Google ads + Nykaa + Flipkart.\n5,000+? → Add Meesho + beauty clinics + local cosmetic stores.",
            font_size=13, color=DARK_TEXT)


# ============================================================
# SECTION 15 — EXPANSION (2 slides)
# ============================================================
slide = prs.slides.add_slide(BLANK)
add_bg(slide)
add_title_band(slide, "15.1 The 4-Phase Roadmap")

phase_data = [
    ["Phase", "Geography", "Duration", "Revenue Target", "Customers"],
    ["1: Gujarat Domination", "Gujarat only", "M1-9", "₹25-35L cumulative", "1,500-2,500"],
    ["2: National D2C", "Pan-India online", "M9-18", "₹1-2 Cr annual", "10,000-15,000"],
    ["3: National Scale", "Pan-India + offline", "M18-36", "₹5-15 Cr annual", "50,000-100,000"],
    ["4: International", "SE Asia, UAE, UK, US", "Y3-5", "₹50+ Cr annual", "200,000+"],
]
add_table(slide, phase_data, top=Inches(1.4), col_widths=[2.5, 2.5, 1.7, 2.5, 3.1], font_size=12)

add_textbox(slide, Inches(0.5), Inches(4.5), Inches(12.3), Inches(0.4),
            "Phase 1 detail — Gujarat Domination:", font_size=16, bold=True, color=TERRACOTTA)
add_bullets(slide, Inches(0.7), Inches(4.9), Inches(12), Inches(2.0), [
    "Strategy: 50% Gujarati / 30% Hindi / 20% English content  •  Distribution: D2C 35% + Salons 25% + Amazon 20% + Events 15% + WhatsApp 5%",
    "Marketing: 60% organic + 30% Meta ads + 10% influencer  •  Team: founder + 1 helper + freelance designer + freelance video editor",
    "KPIs at M9: 1,500-2,500 customers, 35% repeat, AOV ₹550, ₹30-35L cumulative, 25K IG followers, 500+ reviews, NPS 50+",
], font_size=12)


# 15.2 Triggers
slide = prs.slides.add_slide(BLANK)
add_bg(slide)
add_title_band(slide, "15.2 Phase Transition Triggers")

add_textbox(slide, Inches(0.5), Inches(1.4), Inches(12.3), Inches(0.4),
            "Every phase transition has explicit triggers. We don't move forward until they're met.",
            font_size=14, color=FOREST, bold=True)

trig_data = [
    ["Transition", "Triggers (ALL must be met)"],
    ["PHASE 1 → PHASE 2", "1,500+ Gujarat customers • 35% repeat • 3 SKUs selling • LTV:CAC > 3:1 • Profitable unit economics"],
    ["PHASE 2 → PHASE 3", "₹1 Cr annual run rate • Meta+Google ROAS > 2.5x • Amazon top 500 in category • 10K customers • Team of 5+"],
    ["PHASE 3 → PHASE 4", "₹5 Cr+ revenue • 20%+ aided brand awareness in metros • 5+ SKUs • Team of 15+ • International regulatory readiness"],
]
add_table(slide, trig_data, top=Inches(2.0), col_widths=[3.5, 8.8], font_size=12)

add_textbox(slide, Inches(0.5), Inches(5.0), Inches(12.3), Inches(0.4),
            "Expansion philosophy:", font_size=16, bold=True, color=TERRACOTTA)
add_textbox(slide, Inches(0.7), Inches(5.4), Inches(12), Inches(1.6),
            "\"Don't expand to grow. Expand because customers are pulling you.\" If Mumbai customers find RANGAT on Amazon organically, that's a signal to expand. If no one in Mumbai is buying, no amount of advertising fixes that. Customer-led expansion beats CEO-led expansion every time.",
            font_size=14, color=FOREST, bold=True)


# ============================================================
# SECTION 16 — TARGETS (2 slides)
# ============================================================
slide = prs.slides.add_slide(BLANK)
add_bg(slide)
add_title_band(slide, "16.1 Sales Targets — M1 → M12")
add_textbox(slide, Inches(0.5), Inches(1.4), Inches(12.3), Inches(0.4),
            "Conservative, realistic. Most Indian D2C founders overestimate. We will not.",
            font_size=14, color=FOREST, bold=True)

tgt_data = [
    ["Metric", "M1", "M2", "M3", "M6", "M12"],
    ["Orders", "50-80", "100-150", "200-280", "600-900", "1,500-2,500"],
    ["New customers", "50-80", "80-130", "150-200", "400-600", "800-1,500"],
    ["Repeat customers", "0", "20", "50-80", "200-300", "700-1,000"],
    ["AOV", "₹450", "₹470", "₹500", "₹580", "₹650-700"],
    ["Revenue", "₹25-40K", "₹47-70K", "₹1-1.4L", "₹3.5-5.2L", "₹9.75-17.5L/mo"],
    ["Cumulative revenue", "₹30K", "₹1L", "₹2.5L", "₹14L", "₹75L+"],
    ["Marketing spend", "₹5K", "₹15K", "₹25K", "₹1L", "₹2.5L/mo"],
    ["Net (after mktg)", "₹5-15K", "₹13-27K", "₹35-60K", "₹1.1-2.1L", "₹3.35-8L/mo"],
    ["CAC", "₹0-50", "₹100", "₹125-150", "₹180-220", "₹200-280"],
    ["LTV (early)", "₹350", "₹400", "₹450", "₹700", "₹900-1,200"],
    ["LTV:CAC", "—", "4:1", "3:1", "3:1", "4:1"],
    ["Repeat (90-day)", "—", "15%", "25%", "30-35%", "40-45%"],
    ["Subscription %", "—", "—", "3%", "5-8%", "12-15%"],
    ["Cumulative customers", "60", "180", "280", "1,800", "10,000-15,000"],
]
add_table(slide, tgt_data, top=Inches(1.9), col_widths=[3.5, 1.7, 1.7, 1.7, 1.7, 2.0], font_size=10)


# 16.2 Revenue mix + P&L
slide = prs.slides.add_slide(BLANK)
add_bg(slide)
add_title_band(slide, "16.2 Revenue Mix + M12 P&L")

add_textbox(slide, Inches(0.5), Inches(1.4), Inches(6), Inches(0.4),
            "Revenue mix by month:", font_size=14, bold=True, color=TERRACOTTA)
mix_data2 = [
    ["Channel", "M1", "M3", "M6", "M12"],
    ["D2C site", "₹12K", "₹48K", "₹1.4L", "₹4.5L"],
    ["Amazon", "₹0", "₹20K", "₹1.2L", "₹3.5L"],
    ["IG/WhatsApp organic", "₹10K", "₹30K", "₹70K", "₹1.5L"],
    ["Salons + offline", "₹3K", "₹15K", "₹40K", "₹80K"],
    ["Nykaa", "₹0", "₹0", "₹30K", "₹90K"],
    ["Flipkart", "₹0", "₹0", "₹15K", "₹60K"],
    ["Referrals + reorders", "₹0", "₹7K", "₹50K", "₹2L"],
    ["TOTAL", "₹25K", "₹1.2L", "₹4L", "₹12L"],
]
add_table(slide, mix_data2, top=Inches(1.9), col_widths=[3.5, 1.7, 1.7, 1.7, 1.7], font_size=10)

add_textbox(slide, Inches(7), Inches(1.4), Inches(6), Inches(0.4),
            "Month 12 P&L:", font_size=14, bold=True, color=FOREST)
pnl_data = [
    ["Line item", "Monthly (₹)", "Annual (₹)"],
    ["Revenue", "12,00,000", "1,44,00,000"],
    ["COGS", "4,80,000", "57,60,000"],
    ["Gross profit (60%)", "7,20,000", "86,40,000"],
    ["Marketing spend", "2,50,000", "30,00,000"],
    ["Team salaries", "1,50,000", "18,00,000"],
    ["Rent + software", "50,000", "6,00,000"],
    ["Misc + buffer", "30,000", "3,60,000"],
    ["EBITDA (20%)", "2,40,000", "28,80,000"],
]
add_table(slide, pnl_data, top=Inches(1.9), left=Inches(7.0), col_widths=[3.0, 1.5, 1.5], font_size=10)

add_textbox(slide, Inches(0.5), Inches(6.2), Inches(12.3), Inches(0.5),
            "Goal: profitable at EBITDA level by M12. Many Indian brands reach ₹1 Cr revenue but burn cash. We aim to be profitable.",
            font_size=13, bold=True, color=TERRACOTTA)


# ============================================================
# SECTION 17 — MISTAKES (3 slides)
# ============================================================
slide = prs.slides.add_slide(BLANK)
add_bg(slide)
add_title_band(slide, "17.1 The 20 Mistakes (Part 1 of 2)")

mistakes_part1 = [
    ["#", "Mistake", "Why fatal"],
    ["1", "Launching 10 SKUs at once", "No SKU gets traction; inventory scattered"],
    ["2", "Spending ₹50K on Day 1 ads", "No PMF means ads buy wrong customers"],
    ["3", "Hiring ₹25-50K/mo marketing agency", "Agency optimizes for its revenue, not yours"],
    ["4", "Building custom-coded website", "Buggy, slow, low conversion = revenue loss"],
    ["5", "Listing on 6 marketplaces on Day 1", "Each listing has 0 reviews, 0 sales"],
    ["6", "Buying fake reviews", "Amazon catches + bans; reputation destroyed"],
    ["7", "Celebrity post before ₹1 Cr revenue", "Celebrity customers don't repeat purchase"],
    ["8", "Ignoring repeat purchase", "Brand busy replacing churners, never profitable"],
    ["9", "Manufacturing internationally for premium feel", "Customer can't tell; ₹15L locked"],
    ["10", "Skipping founder accessibility", "Customers buy BECAUSE founder is accessible"],
]
add_table(slide, mistakes_part1, top=Inches(1.4), col_widths=[0.6, 5.5, 6.2], font_size=11)


# 17.2 Mistakes part 2
slide = prs.slides.add_slide(BLANK)
add_bg(slide)
add_title_band(slide, "17.2 The 20 Mistakes (Part 2 of 2)")
mistakes_part2 = [
    ["#", "Mistake", "Why fatal"],
    ["11", "Competing on price alone", "Race to bottom, no money for ads"],
    ["12", "Faking before/after photos", "ASCI fines + bad reviews cascade"],
    ["13", "Founder face but bad product", "Founder-led amplifies bad reviews faster"],
    ["14", "Ignoring operations", "Late/wrong shipments kill more than bad marketing"],
    ["15", "Building a warehouse on Day 1", "Burns cash for show; bedroom works"],
    ["16", "Skipping CDSCO compliance", "Illegal; listing removed, inventory unsellable"],
    ["17", "Trusting 'gurus' over customers", "Generic advice fails for specific brands"],
    ["18", "Expanding geography before profitability", "Scale without profit = death"],
    ["19", "Founder burnout", "Founder IS the brand. If founder breaks, brand breaks"],
    ["20", "Giving up too early", "Most D2C take 12-18 months to find PMF; quitting M3 = common"],
    ["21*", "Hiring friends/family without skills", "Avoid: hire for skill, not relationship"],
]
add_table(slide, mistakes_part2, top=Inches(1.4), col_widths=[0.7, 5.5, 6.1], font_size=11)

add_textbox(slide, Inches(0.5), Inches(5.7), Inches(12.3), Inches(0.4),
            "Hierarchy:", font_size=16, bold=True, color=TERRACOTTA)
add_bullets(slide, Inches(0.7), Inches(6.1), Inches(12), Inches(1.0), [
    "CATASTROPHIC (kills brand): 1, 2, 4, 6, 8, 11, 16, 19, 20  •  Serious (sets back 3-6 months): 3, 5, 7, 10, 14, 17, 18  •  Avoidable (slows growth): 9, 12, 13, 15, 21",
], font_size=11)


# ============================================================
# SECTION 18 — CEO VERDICT + 30/60/90 PLANS (4 slides)
# ============================================================
slide = prs.slides.add_slide(BLANK)
add_bg(slide)
add_title_band(slide, "18.1 CEO Verdict")

v = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.5), Inches(1.4), Inches(12.3), Inches(3.0))
v.fill.solid()
v.fill.fore_color.rgb = FOREST
v.line.fill.background()
tf = v.text_frame
tf.margin_left = Inches(0.4)
tf.margin_top = Inches(0.25)
tf.word_wrap = True
p = tf.paragraphs[0]
r = p.add_run()
r.text = "THE VERDICT"
r.font.size = Pt(20)
r.font.bold = True
r.font.color.rgb = SAFFRON
r.font.name = "Georgia"

p2 = tf.add_paragraph()
p2.space_before = Pt(8)
r2 = p2.add_run()
r2.text = "RANGAT NATURALS is a Gujarat-origin, founder-led, ingredient-transparent Indian skincare brand for the modern Indian woman who wants effective skincare without luxury prices or 12-step routines."
r2.font.size = Pt(15)
r2.font.color.rgb = WHITE

p3 = tf.add_paragraph()
p3.space_before = Pt(8)
r3 = p3.add_run()
r3.text = "Launch in Ahmedabad with ONE hero product (10% Vitamin C Serum at ₹499). 1,000 customers in 4 months. ₹12L/month by M12. ₹1.5-2 Cr annual by M18. Household skincare brand from Gujarat in 3-5 years."
r3.font.size = Pt(15)
r3.font.color.rgb = WHITE
r3.font.bold = True

add_textbox(slide, Inches(0.5), Inches(4.7), Inches(12.3), Inches(0.4),
            "Why this works:", font_size=18, bold=True, color=TERRACOTTA)
add_bullets(slide, Inches(0.7), Inches(5.1), Inches(12), Inches(1.5), [
    "Defensible white space (active % + climate testing + founder + routine simplicity + Gujarat origin) — no competitor owns this combo",
    "Unit economics work: 60% gross margin, 25-30% marketing, profitable from M6",
    "Customer is real (6.2 lakh monthly 'vitamin C serum' searches, +18% YoY)",
    "Repeat engine built in (40-50% reorder rate achievable)",
    "Execution roadmap is concrete: every day, every rupee, every metric defined",
], font_size=12)

add_textbox(slide, Inches(0.5), Inches(6.8), Inches(12.3), Inches(0.4),
            "THE DECISION IS CLEAR: BUILD. →", font_size=22, bold=True, color=TERRACOTTA)


# 18.2 What to do FIRST + 30-day plan
slide = prs.slides.add_slide(BLANK)
add_bg(slide)
add_title_band(slide, "What to Do FIRST + 30-Day Plan")
add_textbox(slide, Inches(0.5), Inches(1.4), Inches(12.3), Inches(1.0),
            "If you read this entire document and only have time to do ONE thing today:",
            font_size=16, color=FOREST, bold=True)
add_textbox(slide, Inches(0.7), Inches(2.0), Inches(12), Inches(1.5),
            "Open WhatsApp. Text 30 friends and family with a personal message: \"I'm launching a skincare brand. I want to make the first 10 bottles for people I know. Will you be one of them?\"\n\nThat's it. That's the start. Everything else flows from there.",
            font_size=14, color=TERRACOTTA, bold=True)

add_textbox(slide, Inches(0.5), Inches(4.0), Inches(12.3), Inches(0.4),
            "30-DAY PLAN (Week by Week):", font_size=16, bold=True, color=FOREST)
plan30 = [
    ["Week", "Goal", "Key actions", "Result by week end"],
    ["W1 (D1-7)", "Foundation", "Lock formula, order 50 bottles + 100 samples, Shopify site, IG setup, 3 posts", "Site live, IG live, ₹15-20K spent"],
    ["W2 (D8-14)", "Personal network", "WhatsApp to 50 contacts (personal), 10 orders, pack + ship + collect reviews", "10-15 customers, ₹5-7K revenue"],
    ["W3 (D15-21)", "Sampling + salons", "5 salons × 30 samples (150 total), 20 influencer DMs, comparison Reel, apartment demo, first exhibition booked", "30-50 customers, ₹20-30K revenue"],
    ["W4 (D22-30)", "Scale organic", "Daily Reels, ₹349 launch offer to 30 units, review push, Amazon prep (20 reviews), BTS content", "60-80 customers, ₹25-40K, 800-1K IG"],
]
add_table(slide, plan30, top=Inches(4.4), col_widths=[1.5, 2.0, 5.5, 3.0], font_size=10)


# 18.3 60-day plan
slide = prs.slides.add_slide(BLANK)
add_bg(slide)
add_title_band(slide, "60-Day Plan — Validate Ads + Amazon + Reorder")

plan60 = [
    ["Phase", "Goal", "Key actions", "Result"],
    ["D31-45: Amazon launch", "100-130 customers", "Amazon Seller Central + Brand Registry, photography, listing + A+ content, Vine program, first Meta ad test ₹300/day, micro-influencer gifting (10 creators)", "100-130 customers, ₹50-70K revenue, 20-30 Amazon reviews, first ad data"],
    ["D46-60: Scale what's working", "130-180 customers", "Meta ads scale to ₹500/day if ROAS > 2x, 5 more salons, first college fest, GMB + Justdial listings, IG Live Q&A, WhatsApp automation upgrade (Interakt), reorder push to all 60 customers", "130-180 customers, ₹70-100K, 1.5-2.5K IG, 8-12 salons, 10-15 influencers"],
]
add_table(slide, plan60, top=Inches(1.5), col_widths=[1.8, 2.5, 5.5, 2.5], font_size=10)

add_textbox(slide, Inches(0.5), Inches(4.0), Inches(12.3), Inches(0.4),
            "60-day KPI summary:", font_size=16, bold=True, color=TERRACOTTA)
add_bullets(slide, Inches(0.7), Inches(4.4), Inches(12), Inches(2.5), [
    "Cumulative customers: 130-180  •  Revenue: ₹70-100K  •  Amazon reviews: 30-50  •  IG followers: 1,500-2,500",
    "Salon partners: 8-12  •  Influencer relationships: 10-15  •  First Meta ad ROAS data  •  Reorder engine validated",
    "Marketing spend: ₹15-20K  •  Founder operates 60 hrs/week  •  Sustainability plan: 50 hrs max, 1 day off/week, vacations",
], font_size=12)


# 18.4 90-day plan
slide = prs.slides.add_slide(BLANK)
add_bg(slide)
add_title_band(slide, "90-Day Plan — Validate ₹1L+ Monthly Revenue")

plan90 = [
    ["Phase", "Goal", "Key actions", "Result"],
    ["D61-75: First paid scale", "200-250 customers", "Meta ₹1K/day if ROAS validated, Google test ₹500/day, 5 new influencer partnerships, Nykaa application, second product prep (Hydra Moisturizer), first YouTube video, society commerce, wedding planner outreach (3)", "200-250 customers, ₹1L revenue cumulative since launch"],
    ["D76-90: Optimize + lock repeat", "240-300 cumulative, ₹1.2L monthly", "Subscription setup (Loop), loyalty preview, customer-of-month feature, bundle launch ₹699, reorder rate measurement, win-back campaign, first helper hired, weekly metrics review", "₹1-1.5L monthly, ₹2-2.5L cumulative, 25% repeat, 2K-3K IG, 40-70 Amazon reviews"],
]
add_table(slide, plan90, top=Inches(1.5), col_widths=[1.8, 2.5, 5.5, 2.5], font_size=10)

add_textbox(slide, Inches(0.5), Inches(4.2), Inches(12.3), Inches(0.4),
            "90-day KPI summary:", font_size=16, bold=True, color=TERRACOTTA)
kpi90 = [
    ["Metric", "Target", "Stretch"],
    ["Cumulative customers", "250", "350"],
    ["Month 3 revenue", "₹1.2L", "₹1.8L"],
    ["Total revenue since launch", "₹2.5L", "₹3.5L"],
    ["Repeat purchase rate", "25%", "35%"],
    ["Instagram followers", "2,500", "4,000"],
    ["Amazon reviews", "40", "70"],
    ["Salon partners", "15", "25"],
    ["Influencer relationships", "20", "35"],
    ["Team size", "1.5 (founder + helper)", "2.5"],
    ["Net profit (cumulative)", "₹10-30K", "₹50-80K"],
]
add_table(slide, kpi90, top=Inches(4.6), col_widths=[5.5, 3.4, 3.4], font_size=11)


# 18.5 Founder schedule + decision rules + final word
slide = prs.slides.add_slide(BLANK)
add_bg(slide)
add_title_band(slide, "Founder Schedule + Decision Rules + Final Word")

add_textbox(slide, Inches(0.5), Inches(1.4), Inches(12.3), Inches(0.4),
            "Founder's daily schedule (after D60) — 60 hrs/week, sustainable for 18 months:", font_size=14, color=FOREST, bold=True)

sched_data = [
    ["Time", "Activity"],
    ["7-8 AM", "Skincare routine (use own product), Instagram story"],
    ["8-9 AM", "Review yesterday's metrics, plan the day"],
    ["9-11 AM", "Customer support (WhatsApp + email + DMs)"],
    ["11 AM-1 PM", "Content creation (shoot Reels, write captions)"],
    ["2-4 PM", "Operations (process orders, packaging, ship)"],
    ["4-5 PM", "Influencer + salon outreach + meetings"],
    ["5-6 PM", "Ad review (Meta + Amazon dashboard)"],
    ["6-7 PM", "Customer feedback calls (weekly)"],
    ["8-10 PM", "Content editing + posting"],
    ["10 PM", "Day close, plan tomorrow, sleep"],
]
add_table(slide, sched_data, top=Inches(1.9), col_widths=[2.0, 10.3], font_size=10)

add_textbox(slide, Inches(0.5), Inches(5.5), Inches(12.3), Inches(0.4),
            "Decision rules (when in doubt):", font_size=16, bold=True, color=FOREST)
add_bullets(slide, Inches(0.7), Inches(5.9), Inches(12), Inches(1.0), [
    "Helps get/keep customers + builds trust + scales profitably + not copy-able in 30 days? → Do it within 48 hours. Passes 3+ tests → execute.",
], font_size=12)


# 18.6 The Final Word
slide = prs.slides.add_slide(BLANK)
add_bg(slide, CREAM)
band = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, SW, Inches(0.6))
band.fill.solid()
band.fill.fore_color.rgb = TERRACOTTA
band.line.fill.background()

add_textbox(slide, Inches(0.7), Inches(1.4), Inches(12), Inches(1),
            "The Final Word", font_size=42, bold=True, color=TERRACOTTA)
add_textbox(slide, Inches(0.7), Inches(2.6), Inches(12), Inches(1.5),
            "\"This document is not a wishlist. It's a contract with yourself.\"",
            font_size=22, bold=True, color=FOREST, font_name="Georgia")
add_textbox(slide, Inches(0.7), Inches(4.0), Inches(12), Inches(2.5),
            "Every number is a target. Every action is a commitment. Every metric is a checkpoint.\n\nWhen you wake up tomorrow, the question is not \"what should I do?\" The question is:\n\n\"Did I do today's actions from the 30-day plan?\"\n\nIf yes, you're building RANGAT NATURALS.\nIf no, you're thinking about building it.\n\nThere are 1,000+ Indian beauty brands launched every year.\n50 become profitable. 10 become ₹10 Cr brands. 2-3 become household names.\n\nThis document is the path from 1,000 to 10.\nThe discipline to follow it is the difference.",
            font_size=14, color=DARK_TEXT)

pill = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.7), Inches(6.3), Inches(12), Inches(0.8))
pill.fill.solid()
pill.fill.fore_color.rgb = FOREST
pill.line.fill.background()
ptf = pill.text_frame
ptf.margin_top = Inches(0.18)
p = ptf.paragraphs[0]
p.alignment = 2
r = p.add_run()
r.text = "BUILD RANGAT NATURALS  •  GUJARAT → INDIA → GLOBAL"
r.font.size = Pt(20)
r.font.bold = True
r.font.color.rgb = WHITE
r.font.name = "Georgia"


# Save
out = "/home/user/test2/RANGAT_NATURALS_CEO_GROWTH_STRATEGY.pptx"
prs.save(out)
print(f"Saved: {out}")
print(f"Slides: {len(prs.slides)}")
