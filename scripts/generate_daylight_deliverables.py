from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether, Flowable
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase import pdfmetrics
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.dml import MSO_THEME_COLOR
import csv, os, hashlib

OUT='deliverables'; os.makedirs(OUT, exist_ok=True)
# Single source of truth. Both documents are generated from this list.
FORMULA=[
('Distilled / deionised water','Aqua',65.25,65.25,'A','Solvent / continuous phase','Reliable water base for all water-soluble materials; reduces bioburden versus tap water.'),
('Disodium EDTA','Disodium EDTA',0.10,0.10,'A','Chelator','Binds trace metals and supports colour, oxidation and preservative robustness.'),
('Glycerin, vegetable IP/USP','Glycerin',4.00,4.00,'A','Humectant','Pulls water into the upper skin layers for immediate comfortable hydration.'),
('Xanthan gum, clear grade','Xanthan Gum',0.20,0.20,'A','Rheology / stabiliser','Adds light body and helps keep oil droplets suspended without carbomer/electrolyte conflict.'),
('Niacinamide','Niacinamide',4.00,4.00,'A','Barrier, tone and sebum support','Evidence-led workhorse for dullness, barrier function and even-looking tone; kept below high-irritation levels.'),
('Allantoin','Allantoin',0.20,0.20,'A','Soothing / smoothing','Comforts and smooths rough-feeling skin; below its practical solubility ceiling.'),
('Cetearyl olivate & sorbitan olivate (Olivem 1000)','Cetearyl Olivate, Sorbitan Olivate',4.00,4.00,'B','Primary O/W emulsifier','Non-ionic olive-derived emulsifier that builds a soft, elegant liquid-crystal structure.'),
('Cetearyl alcohol','Cetearyl Alcohol',0.50,0.50,'B','Co-emulsifier / body','Strengthens the emulsion and gives controlled cushion, not a waxy drag at this level.'),
('Caprylic/capric triglyceride','Caprylic/Capric Triglyceride',4.00,4.00,'B','Light emollient','Dry-touch slip and softness with less oiliness than heavy plant oils.'),
('Squalane, olive or sugarcane','Squalane',2.00,2.00,'B','Light emollient / barrier lipid','Fast-spreading, silky after-feel and healthy-looking glow; oxidation resistant.'),
('Tocopherol, mixed','Tocopherol',0.20,0.20,'B','Oil antioxidant','Slows rancidity in the oil phase. Not a preservative.'),
('Reserved distilled / deionised water','Aqua',10.00,10.00,'C','Cool-down solvent','Allows heat-sensitive actives to be dissolved and added gently.'),
('Sodium hyaluronate, cosmetic grade','Sodium Hyaluronate',0.10,0.10,'C','Humectant / film former','Surface hydration and a subtle plumped, smoother optical finish.'),
('Alpha-arbutin, >=99% with COA','Alpha-Arbutin',1.50,1.50,'C','Tone-evening active','Gentle tyrosinase-pathway support; use only with a documented low hydroquinone specification.'),
('Zinc PCA, cosmetic grade','Zinc PCA',0.50,0.50,'C','Sebum / NMF support','Modest support for combination/oily skin; kept in a pH window where it remains compatible.'),
('D-panthenol 75% liquid','Panthenol',2.00,2.00,'C','Humectant / soothing','Fast comfort and barrier-supportive hydration.'),
('Phenoxyethanol & ethylhexylglycerin (PE 9010 type)','Phenoxyethanol, Ethylhexylglycerin',1.00,1.00,'C','Broad-spectrum preservative','Protects the water-based emulsion from bacteria, yeast and mould; essential for safety.'),
('IFRA-certified facial fragrance','Parfum',0.15,0.15,'C','Sensory','Subtle clean-modern premium cue. Omit for fragrance-free pilot and add 0.15 g water.'),
('10% lactic acid solution, q.s.','Lactic Acid, Aqua',0.30,0.30,'D','pH adjustment','Use only as needed to land the finished batch at pH 5.0–5.5.'),
]
assert round(sum(x[3] for x in FORMULA),2)==100.00
# CSV master sheet
with open(os.path.join(OUT,'daylight-master-formula.csv'),'w',newline='') as f:
 w=csv.writer(f); w.writerow(['Ingredient','INCI','Percent','Grams per 100g','Phase','Purpose'])
 for x in FORMULA: w.writerow([x[0],x[1],f'{x[2]:.2f}',f'{x[3]:.2f}',x[4],x[5]])
formula_hash=hashlib.sha256(repr([(x[0],x[1],x[2],x[3],x[4]) for x in FORMULA]).encode()).hexdigest()[:12]

NAVY=colors.HexColor('#12233F'); TEAL=colors.HexColor('#2A9D8F'); GOLD=colors.HexColor('#D7A84B'); PALE=colors.HexColor('#F4F7F8'); INK=colors.HexColor('#243248'); MUTED=colors.HexColor('#617086')

def p(text, style): return Paragraph(text, style)
def bullets(items, style): return [p('• '+i, style) for i in items]

class PhaseFlow(Flowable):
 def __init__(self): super().__init__(); self.width=170*mm; self.height=34*mm
 def draw(self):
  c=self.canv; labels=[('A','water + actives','70–75°C'),('B','oil + emulsifier','70–75°C'),('C','cool-down','≤40°C'),('D','pH + fill','5.0–5.5')]
  x=0
  for i,(a,b,d) in enumerate(labels):
   c.setFillColor([TEAL,GOLD,NAVY,colors.HexColor('#6C8EAD')][i]); c.roundRect(x,9*mm,37*mm,17*mm,3*mm,fill=1,stroke=0)
   c.setFillColor(colors.white); c.setFont('Helvetica-Bold',14); c.drawString(x+4*mm,19*mm,a); c.setFont('Helvetica',7.5); c.drawString(x+4*mm,14*mm,b); c.drawString(x+4*mm,11*mm,d)
   if i<3: c.setFillColor(MUTED); c.setFont('Helvetica-Bold',12); c.drawString(x+38*mm,16*mm,'→')
   x+=43*mm

def header_footer(canvas, doc):
 canvas.saveState(); canvas.setFillColor(NAVY); canvas.rect(0, A4[1]-10*mm, A4[0], 10*mm, fill=1, stroke=0)
 canvas.setFillColor(colors.white); canvas.setFont('Helvetica-Bold',8); canvas.drawString(15*mm,A4[1]-6.5*mm,'DAYLIGHT  /  COSMETIC R&D PROTOTYPE')
 canvas.setFillColor(MUTED); canvas.setFont('Helvetica',7); canvas.drawRightString(A4[0]-15*mm,8*mm,f'Prototype dossier  •  page {doc.page}')
 canvas.restoreState()

styles=getSampleStyleSheet()
styles.add(ParagraphStyle(name='TitleX',parent=styles['Title'],fontName='Helvetica-Bold',fontSize=30,leading=34,textColor=NAVY,spaceAfter=8))
styles.add(ParagraphStyle(name='Sub',parent=styles['Normal'],fontSize=12,leading=17,textColor=TEAL,spaceAfter=12))
styles.add(ParagraphStyle(name='H1X',parent=styles['Heading1'],fontName='Helvetica-Bold',fontSize=19,leading=23,textColor=NAVY,spaceBefore=5,spaceAfter=9))
styles.add(ParagraphStyle(name='H2X',parent=styles['Heading2'],fontName='Helvetica-Bold',fontSize=12,leading=15,textColor=TEAL,spaceBefore=8,spaceAfter=5))
styles.add(ParagraphStyle(name='BodyX',parent=styles['BodyText'],fontSize=8.7,leading=12.3,textColor=INK,spaceAfter=5))
styles.add(ParagraphStyle(name='SmallX',parent=styles['BodyText'],fontSize=7.2,leading=9.2,textColor=INK,spaceAfter=2))
styles.add(ParagraphStyle(name='Tiny',parent=styles['BodyText'],fontSize=6.3,leading=7.6,textColor=INK))
styles.add(ParagraphStyle(name='Callout',parent=styles['BodyText'],fontSize=10,leading=14,textColor=NAVY,backColor=colors.HexColor('#E6F3F1'),borderColor=TEAL,borderWidth=.7,borderPadding=8,spaceBefore=5,spaceAfter=8))

def table(data, widths, fs=6.5, header=True):
 t=Table([[p(str(c),styles['Tiny']) for c in row] for row in data],colWidths=widths,repeatRows=1 if header else 0,hAlign='LEFT')
 st=[('VALIGN',(0,0),(-1,-1),'TOP'),('GRID',(0,0),(-1,-1),.25,colors.HexColor('#C8D1D9')),('LEFTPADDING',(0,0),(-1,-1),4),('RIGHTPADDING',(0,0),(-1,-1),4),('TOPPADDING',(0,0),(-1,-1),4),('BOTTOMPADDING',(0,0),(-1,-1),4)]
 if header: st += [('BACKGROUND',(0,0),(-1,0),NAVY),('TEXTCOLOR',(0,0),(-1,0),colors.white)]
 for r in range(1,len(data)): st.append(('BACKGROUND',(0,r),(-1,r),PALE if r%2 else colors.white))
 t.setStyle(TableStyle(st)); return t

story=[]
story += [Spacer(1,28*mm),p('DAYLIGHT',styles['TitleX']),p('Lightweight brightening day cream',styles['Sub']),p('A premium, warm-climate O/W prototype engineered for immediate comfort, elegant slip and responsible long-term cosmetic support.',styles['Callout']),PhaseFlow(),Spacer(1,10*mm),p('<b>Development brief</b><br/>A 100 g bench prototype for India. Non-steroidal, hydroquinone-free, no medical claims. Designed around one shared pH window and a deliberately short active stack.',styles['BodyX']),p(f'<b>Master-data lock:</b> formula hash {formula_hash} • 19 line items • 100.00 g total • prepared 02 October 2026',styles['SmallX']),PageBreak()]

story += [p('1. What success looks like',styles['H1X']),p('The fastest realistic wins are sensory and optical: a smoother water-rich surface, less visible flaking, soft slip and a healthier-looking sheen. Tone and blemish support are slower biological outcomes—not four-day promises.',styles['BodyX'])]
time_rows=[['Window','What a user may notice','What not to promise'],['First use','Comfortable hydration, softer slip, less tightness; temporary glow from a smoother hydrated surface.','Permanent glow or pigment removal.'],['24 hours','More supple feel; dry patches may look less obvious.','Acne cure or guaranteed brightening.'],['2–4 days','Better repeat-use feel; less dull-looking surface for some users.','Guaranteed spot fading.'],['1 week','More consistent softness and comfort if used daily.','Clinical-level tone change.'],['2–4 weeks','Barrier comfort and even-looking tone may begin to look more consistent.','Melasma treatment.'],['6–12 weeks','Best window to assess tone support; sunscreen use is essential.','Drug-like acne or pigmentation claims.']]
story += [table(time_rows,[25*mm,78*mm,65*mm]),p('<b>Use context:</b> apply a pea-sized amount to clean, dry skin in the morning, then broad-spectrum SPF 30+ sunscreen. Sunscreen is the non-negotiable partner for any tone-evening goal.',styles['Callout'])]

story += [p('2. Final 100 g master formula',styles['H1X']),p('This exact table is the single source used to generate the companion PowerPoint. pH-adjuster quantity is a planning quantity; in a real batch it is q.s. to pH 5.0–5.5, with any difference compensated by water.',styles['BodyX'])]
fd=[['Ingredient','INCI','%','g','Phase','Purpose']]+[[x[0],x[1],f'{x[2]:.2f}',f'{x[3]:.2f}',x[4],x[5]] for x in FORMULA]
story += [table(fd,[35*mm,31*mm,10*mm,10*mm,10*mm,76*mm],6),PageBreak()]

story += [p('3. Why this formula feels premium',styles['H1X']),p('Premium feel comes from the architecture—not from a long ingredient list. A non-ionic emulsifier, light esters, a little squalane and controlled rheology create a short, silky break with a soft finish.',styles['BodyX'])]
sens=[['Ingredient','Texture contribution','Skin feel','User experience'],['Olivem 1000 + cetearyl alcohol','Fine O/W structure and controlled body','Cushion without wax drag','Cream looks rich but spreads quickly.'],['CCT + squalane','Light emollient slip','Dry-touch softness','Less greasy than heavy oils; a healthy glow.'],['Glycerin + panthenol + sodium hyaluronate','Layered humectancy and light film','Comfort and plumpness','Hydrated, not wet or sticky when balanced.'],['0.20% xanthan','Low-level structure','Smooth, stable pickup','No watery separation; not a gel.'],['0.15% IFRA fragrance','Low fragrance load','Clean, modern sensory cue','Noticeable but not loud; omit if sensitive.']]
story += [table(sens,[38*mm,47*mm,42*mm,45*mm]),p('The professional trick is restraint: too much glycerin feels tacky, too much fatty alcohol feels waxy, too much oil feels slow, and too much fragrance raises irritation risk. This formula keeps each lever modest.',styles['Callout'])]

story += [p('4. Ingredient lessons in plain language',styles['H1X'])]
lesson=[['Ingredient family','What it does','Why it is here','When benefit can show'],['Humectants: glycerin, panthenol, sodium hyaluronate','Hold water near the skin surface.','Fast hydration and comfortable finish.','Minutes to days.'],['Niacinamide 4%','Supports barrier, tone evenness and sebum balance.','Broadest evidence-to-risk fit for this brief.','Comfort early; tone usually weeks.'],['Alpha-arbutin 1.5%','Helps slow a pigment-forming pathway.','Adds a second, complementary tone lever.','Assess 6–12 weeks, not 4 days.'],['Zinc PCA 0.5%','Mineral salt with modest sebum/NMF support.','Helps keep oily/combination skin in scope.','Subtle; weeks.'],['Allantoin 0.2%','Soothing and smoothing.','Improves comfort and rough-feel perception.','Days.'],['Emollients','Reduce roughness by filling gaps between skin flakes.','Creates the “wow” slip and soft finish.','Immediate.'],['EDTA + preservative','Control metal-driven drift and microbes.','Protect safety and stability.','Invisible but essential.']]
story += [table(lesson,[35*mm,55*mm,55*mm,27*mm]),PageBreak()]

story += [p('5. Beginner manufacturing recipe — exactly 100 g',styles['H1X']),p('Work in a clean, ventilated area. This is a cosmetic prototype, not a sterile preparation. Use a calibrated 0.01 g scale and record every lot number.',styles['BodyX']),p('STEP 1 — Equipment & sanitization',styles['H2X']),p('<b>What to do:</b> Gather two 250 mL borosilicate beakers, 0.01 g balance, probe thermometer, mini stick blender or frother, spatulas, water bath, pH meter with pH 4.01/7.00 buffers, gloves, mask, hair covering, 70% IPA, sanitised airless pump. Wash with hot detergent, rinse with distilled water, then spray/submerge in 70% IPA for 5 minutes and air-dry. <b>Time:</b> 15–20 min. <b>See:</b> clean dry tools. <b>Avoid:</b> using wet IPA or touching sanitised parts.',styles['BodyX']),p('STEP 2 — Weighing',styles['H2X']),p('<b>What to do:</b> Tare a weigh boat and weigh every line item from the master table. Pre-weigh Phase A, B and C separately. Reserve the 10.00 g water for cool-down. Prepare 10% lactic acid only if needed. <b>Avoid:</b> measuring 0.10 g ingredients with kitchen spoons.',styles['BodyX']),p('STEP 3 — PHASE A: water phase',styles['H2X']),p('<b>What to do:</b> Slurry 4.00 g glycerin with 0.20 g xanthan until smooth. Into Beaker A add 65.25 g water, 0.10 g EDTA, 4.00 g niacinamide, then 0.20 g allantoin; stir 1 minute after each. Add the slurry. Heat in a water bath to 70–75°C and hold 15–20 min with gentle stirring. <b>See:</b> uniform, slightly viscous liquid. <b>Avoid:</b> dumping xanthan directly into water—it fish-eyes.',styles['BodyX']),p('STEP 4 — PHASE B: oil phase',styles['H2X']),p('<b>What to do:</b> Add 4.00 g CCT, 2.00 g squalane, 4.00 g Olivem 1000 and 0.50 g cetearyl alcohol. Heat to 70–75°C until every flake is melted; hold 5–10 min. Add 0.20 g tocopherol for the final minute. <b>See:</b> clear homogeneous oil. <b>Avoid:</b> combining while flakes remain.',styles['BodyX']),p('STEP 5 — EMULSIFY',styles['H2X']),p('<b>What to do:</b> Bring A and B within 3–5°C. Pour B slowly into A over 20–30 seconds. High-shear mix with the head submerged in 20–30 second bursts for 2–3 minutes; then stir gently while cooling. <b>Total:</b> continue gentle mixing until below 45°C. <b>See:</b> opaque uniform cream, no oil beads. <b>Avoid:</b> whipping air or stopping all mixing while it cools.',styles['BodyX'])]
story += [PageBreak(),p('6. Cool-down, pH, filling',styles['H1X']),p('STEP 6 — Prepare cool-down solution',styles['H2X']),p('<b>What to do:</b> At the start, sprinkle 0.10 g sodium hyaluronate over 10.00 g reserved water and hydrate 20–30 min. Below 45°C, dissolve 1.50 g alpha-arbutin and 0.50 g zinc PCA into this gel. Add to the emulsion and mix 1–2 min. Below 40°C add 2.00 g panthenol and mix 1 min. <b>See:</b> no visible powder or stringy clumps. <b>Avoid:</b> heating alpha-arbutin.',styles['BodyX']),p('STEP 7 — Preservative & fragrance',styles['H2X']),p('<b>What to do:</b> Below 40°C add 1.00 g PE 9010-type preservative and mix 2 min. Below 35°C add 0.15 g facial fragrance and mix 1–2 min. For fragrance-free, omit fragrance and replace it with 0.15 g distilled water. <b>Avoid:</b> using essential oils or candle/soap fragrance.',styles['BodyX']),p('STEP 8 — pH',styles['H2X']),p('<b>Target:</b> pH 5.0–5.5 at 25°C. Calibrate meter with pH 4.01 and 7.00 buffers. Measure neat with a suitable cosmetic probe, or 1 g cream + 9 g water as a recorded 1:10 screening dilution. To lower, use 10% lactic acid solution, 2–3 drops at a time, stir 60 sec, re-check. To raise, use 10% sodium citrate or L-arginine solution. Never add neat NaOH at home. <b>Avoid:</b> chasing a number with large additions.',styles['BodyX']),p('STEP 9 — Final mix & fill',styles['H2X']),p('<b>What to do:</b> Mix gently 2–3 min below 35°C. It should be smooth, opaque, uniform and non-gritty. Fill below 30°C into a sanitised opaque 30–50 g airless pump using a syringe or piping bag; minimise headspace. Rest 24–48 h before judging final viscosity. <b>Avoid:</b> a wide-mouth jar or fingers.',styles['BodyX']),p('STEP 10 — Storage',styles['H2X']),p('Store sealed, dark and below 30°C; avoid bathroom heat and sunlight. For an untested home prototype, label “LAB SAMPLE — NOT FOR SALE” and use a conservative 4–6 week development window pending microbial and stability testing. Do not infer shelf life from appearance alone.',styles['BodyX']),PageBreak()]

story += [p('7. Preservation, safety and claims',styles['H1X']),p('Water-based creams can look perfect while carrying bacteria, yeast or mould. Raw powders, water, tools, hands and repeated jar opening are all contamination routes. PE 9010-type preservative at 1.0% is selected for its broad utility and pH tolerance, but only a preservative challenge test demonstrates protection.',styles['Callout']),p('<b>Important distinctions:</b> tocopherol protects oils from oxidation; it does not preserve water. Essential oils are not a complete preservative system and can add allergens. “Natural” does not mean safer. Do not use crushed medicines, hydroquinone, steroids, pharmacy azelaic-acid creams or unknown extracts as cosmetic raw materials.',styles['BodyX']),p('<b>Patch test:</b> apply a small amount to the inner forearm or behind ear for 24–48 h, then cautiously introduce to face. Stop for persistent burning, swelling, hives or worsening rash. Never claim “side-effect free.” Pregnancy, eczema, rosacea or active acne concerns merit clinician input.',styles['BodyX']),p('<b>Commercial gate:</b> before sale in India, use documented cosmetic raw materials, batch records, GMP manufacture, stability, preservative efficacy/challenge, microbial limits, packaging compatibility, safety assessment, compliant label and applicable Cosmetics Rules/BIS requirements. A home batch is not commercially released product.',styles['BodyX'])]

story += [p('8. India sourcing & Ahmedabad development leads',styles['H1X']),p('Prices are indicative planning ranges, not quotations. Verify current stock, MOQ, COA, SDS, GST/shipping and lot traceability directly. Ask specifically for cosmetic grade and a certificate of analysis.',styles['BodyX'])]
sourcing=[['Need','Specification / pack','Planning range','Potential source / note'],['Small-pack actives','Niacinamide, alpha-arbutin, panthenol, sodium hyaluronate, Zinc PCA, allantoin; 10–100 g','₹190–850 per small pack','India Beauty Raw Material; Cosmesi Global; Purenso Select; Moksha Lifestyle; TRCkem.'],['Base materials','Olivem 1000, CCT, squalane, cetearyl alcohol, xanthan, EDTA; 50–500 g','₹100–1,200 per pack','Cosmetic raw-material retailers; request COA/SDS.'],['Preservative','PE 9010 type, 100 mL','₹180–400','Ases / specialist cosmetic ingredient retailers; verify ratio and INCI.'],['Fragrance','Facial leave-on, IFRA Category 5B + allergen declaration, 10–30 mL','₹200–900','Moksha Aromatics, Keva / S H Kelkar / specialist fragrance houses.'],['Equipment','0.01 g scale, pH meter, beakers, probe, mixer, airless pumps','₹3,000–8,000','Scientific suppliers, Borosil, IndiaMART, packaging vendors.']]
story += [table(sourcing,[32*mm,62*mm,30*mm,65*mm]),p('<b>Ahmedabad / Gujarat leads to screen:</b> KRIYAM Therapeutics (Ahmedabad; formulation development, private label, manufacturing) — https://www.kriyam.in/ • Aelicure Wellness (Ahmedabad; custom formulation, small-batch capability claimed) — https://aelicurewellness.com/ • Cosmenova (Changodar, Ahmedabad; concept-to-shelf claims) — https://www.cosmenova.in/ • Zymo Cosmetics (Changodar; custom/private label; verify MOQ) — https://zymocosmetics.com/ • Orchid Lifesciences (Ahmedabad/Vatva listings; verify current R&D scope) • Aelicure/HCP Wellness for Gujarat-scale-up conversations. These web pages are leads, not endorsements; suitability for a 100 g bench sample must be confirmed.',styles['BodyX']),p('<b>Ask before sharing the formula:</b> Will you sign an NDA? Do you make 100–500 g lab samples? Who owns the formula and revisions? Can you provide COA/SDS and INCI review? What are development fees, number of iterations, MOQ, lead time, stability/microbial testing scope, fragrance/IP terms, batch records and regulatory support?',styles['Callout']),PageBreak()]

story += [p('9. Cost planning & testing',styles['H1X']),p('Indicative material economics',styles['H2X'])]
cost=[['Scale','Raw-material use (planning)','Packaging','Interpretation'],['100 g prototype','~₹90–₹250 consumed; small-pack purchase outlay commonly ₹3,000–₹7,000','₹80–₹200 airless pump','Purchase outlay is high because you buy small packs.'],['500 g bench batch','~₹450–₹1,250 consumed','₹400–₹1,000 for 5–10 units','Bulk buys reduce unit cost.'],['1 kg pilot','~₹750–₹2,000 consumed at small-B2B rates','₹800–₹2,000','Excludes labour, freight, labels and rejects.'],['Professional development','—','—','~₹15,000–₹75,000+ depending on iterations, IP and lab work; request written quote.'],['Testing','—','—','Microbiology ₹1,000–₹4,000; stability/compatibility/challenge often ₹10,000–₹50,000+; lab-dependent.']]
story += [table(cost,[33*mm,58*mm,33*mm,65*mm]),p('Testing plan',styles['H2X'])]
test=[['Test','Home screen?','Professional requirement'],['Appearance, odour, texture, pH, colour','Yes; record day 0, 1, 7, 14, 28.','Instrumental colour/viscosity if commercial.'],['Freeze/thaw, 4°C / room / 40°C observation','Screen only; useful for red flags, not proof.','Formal stability protocol and interpretation.'],['Package compatibility / pump function','Yes with filled packs.','Longer-term compatibility and transport simulation.'],['Patch test','Cautious self-screen only.','Dermatological safety / HRIPT as appropriate.'],['Microbial count & preservative challenge','No.','Cosmetic microbiology lab; challenge test is essential for launch.']]
story += [table(test,[45*mm,55*mm,89*mm]),p('10. Prototype learning loop',styles['H1X']),p('<b>A — baseline:</b> assess after 48 h for slip, tack, absorption, pH and separation. <b>B — too sticky:</b> reduce glycerin 0.5–1%, increase water; do not immediately add more oil. <b>C — too greasy:</b> reduce squalane or CCT by 0.5–1% and replace with water. <b>D — too thin:</b> confirm 24–48 h maturation, then test xanthan +0.05% or cetearyl alcohol +0.2% in a controlled split batch. <b>E — pilling:</b> reduce total film-formers, check application amount and rub time, and screen under sunscreen. <b>F — fragrance:</b> compare 0, 0.05 and 0.15% while keeping all else fixed. <b>G — stability:</b> do not “fix” separation by adding random emulsifier; recheck phase temperatures, emulsifier melt and shear.',styles['BodyX']),p('Professional developers change one or two variables at a time, retain a control, score sensory attributes blind, and keep a batch record. Never assume the first formula is final.',styles['Callout']),PageBreak()]

story += [p('11. Formula guardrails & references',styles['H1X']),p('<b>Compatibility guardrails:</b> keep finished pH 5.0–5.5; add alpha-arbutin and sodium hyaluronate below 40°C; add preservative below 40°C and fragrance below 35°C; avoid strong acids, pure L-ascorbic acid, retinoids and drug actives in this day-cream jar; keep Zinc PCA away from high-pH carbomer systems.',styles['BodyX']),p('<b>Fragrance-free option:</b> remove Parfum 0.15% and use 0.15 g additional Aqua. Master formula above remains the fragranced version; any fragrance-free pilot is a controlled variant, not a silent change.',styles['BodyX']),p('<b>References and live verification links</b>',styles['H2X'])]
refs=[
'Cosmetic Ingredient Review (CIR), Niacinamide safety assessments — https://www.cir-safety.org/',
'European Commission SCCS, Opinion on alpha-arbutin (face cream safety context) — https://health.ec.europa.eu/scientific-committees/scientific-committee-consumer-safety-sccs_en',
'EU CosIng ingredient database — https://single-market-economy.ec.europa.eu/sectors/cosmetics/cosmetic-products-database_en',
'India Cosmetics Rules, 2020 / CDSCO cosmetics portal — https://cdsco.gov.in/',
'India Beauty Raw Material — https://indiabeautyrawmaterial.com/',
'KRIYAM Therapeutics — https://www.kriyam.in/',
'Aelicure Wellness — https://aelicurewellness.com/',
'Cosmenova — https://www.cosmenova.in/',
'Web search leads for Gujarat manufacturers were checked 02 October 2026; confirm all claims, facilities and quotes directly before engagement.'
]
story += bullets(refs,styles['SmallX'])

pdf_path=os.path.join(OUT,'DAYLIGHT_complete_formula_tutorial.pdf')
doc=SimpleDocTemplate(pdf_path,pagesize=A4,rightMargin=15*mm,leftMargin=15*mm,topMargin=17*mm,bottomMargin=14*mm,title='DAYLIGHT Cosmetic R&D Prototype')
doc.build(story,onFirstPage=header_footer,onLaterPages=header_footer)

# PPT generation
prs=Presentation(); prs.slide_width=Inches(13.333); prs.slide_height=Inches(7.5)
BG=RGBColor(246,249,250); NAVYRGB=RGBColor(18,35,63); TEALRGB=RGBColor(42,157,143); GOLDRGB=RGBColor(215,168,75); INKRGB=RGBColor(36,50,72); MUTEDRGB=RGBColor(97,112,134)
def slide(title, kicker='DAYLIGHT / COSMETIC R&D'):
 s=prs.slides.add_slide(prs.slide_layouts[6]); s.background.fill.solid(); s.background.fill.fore_color.rgb=BG
 sh=s.shapes.add_shape(MSO_SHAPE.RECTANGLE,0,0,prs.slide_width,Inches(.18)); sh.fill.solid(); sh.fill.fore_color.rgb=NAVYRGB; sh.line.fill.background()
 tb=s.shapes.add_textbox(Inches(.55),Inches(.36),Inches(12.2),Inches(.35)); tf=tb.text_frame; tf.text=kicker; tf.paragraphs[0].font.size=Pt(9); tf.paragraphs[0].font.bold=True; tf.paragraphs[0].font.color.rgb=TEALRGB
 tb=s.shapes.add_textbox(Inches(.55),Inches(.78),Inches(12.2),Inches(.55)); tf=tb.text_frame; tf.text=title; tf.paragraphs[0].font.size=Pt(25); tf.paragraphs[0].font.bold=True; tf.paragraphs[0].font.color.rgb=NAVYRGB
 return s
def text(s,x,y,w,h,txt,size=15,color=INKRGB,bold=False):
 tb=s.shapes.add_textbox(Inches(x),Inches(y),Inches(w),Inches(h)); tf=tb.text_frame; tf.word_wrap=True; tf.margin_left=Pt(3); tf.margin_right=Pt(3); tf.text=txt
 for p0 in tf.paragraphs: p0.font.size=Pt(size); p0.font.color.rgb=color; p0.font.bold=bold; p0.space_after=Pt(5)
 return tb
def card(s,x,y,w,h,head,body,accent=TEALRGB):
 sh=s.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE,Inches(x),Inches(y),Inches(w),Inches(h)); sh.fill.solid(); sh.fill.fore_color.rgb=RGBColor(255,255,255); sh.line.color.rgb=RGBColor(220,228,232)
 text(s,x+.18,y+.15,w-.36,.3,head,11,accent,True); text(s,x+.18,y+.55,w-.36,h-.65,body,11,INKRGB)
 return sh
# slides
s=slide('DAYLIGHT','PREMIUM DAILY FACE CREAM / 100 g BENCH PROTOTYPE'); text(s,.65,1.75,7.3,1.0,'A lightweight O/W cream engineered for immediate hydration, silky spread, soft glow and warm-climate comfort.',24,NAVYRGB,True); text(s,.68,3.0,6.8,1.1,'Evidence-led active stack • India-sourceable materials • No steroid • No hydroquinone • No miracle claims',15,TEALRGB); card(s,8.5,1.65,3.8,3.4,'DESIGN NORTH STAR','“Expensive” feel comes from emulsion architecture, light emollients, controlled humectancy and disciplined fragrance—not from adding every trend ingredient.',GOLDRGB)
s=slide('The product promise is sensory first');
for i,(h,b) in enumerate([('FIRST USE','Hydrated, soft, quick slip'),('2–7 DAYS','Comfort + less dull-looking surface'),('6–12 WEEKS','Assess tone support with daily SPF')]): card(s,.7+i*4.15,1.8,3.65,2.7,h,b, [TEALRGB,GOLDRGB,NAVYRGB][i])
text(s,.8,5.25,11.8,.7,'Acne and pigmentation are not 4-day claims. A cosmetic day cream can support appearance and barrier comfort; it cannot replace medical treatment.',16,NAVYRGB,True)
s=slide('Formula architecture');
for i,(a,b,c) in enumerate([('A','Water + actives','70–75°C'),('B','Oil + emulsifier','70–75°C'),('C','Cool-down actives','≤40°C'),('D','pH + fill','5.0–5.5')]): card(s,.55+i*3.2,1.9,2.75,2.2,a,b+'\n'+c,[TEALRGB,GOLDRGB,NAVYRGB,RGBColor(108,142,173)][i])
text(s,.75,4.8,11.5,1.0,'O/W • total lipid/emulsifier system ~10.7% • preservative 1.0% • fragrance 0.15% • final pH 5.0–5.5',18,NAVYRGB,True)
s=slide('Final formula / master data lock');
text(s,.65,1.4,12,.35,f'100.00 g total • formula hash {formula_hash} • use this table as the controlled master',11,MUTEDRGB)
# table split two slides but same exact data
for start in [0,10]:
 s=slide('Final formula / master data lock' + (' — continued' if start else ''))
 rows=FORMULA[start:start+10]; data=[['Ingredient','INCI','%','g','Ph','Purpose']]+[[x[0],x[1],f'{x[2]:.2f}',f'{x[3]:.2f}',x[4],x[5]] for x in rows]
 tab=s.shapes.add_table(len(data),6,Inches(.35),Inches(1.35),Inches(12.6),Inches(5.7)).table
 widths=[2.35,2.3,.55,.55,.45,6.4]
 for j,wid in enumerate(widths): tab.columns[j].width=Inches(wid)
 for r,row in enumerate(data):
  for j,val in enumerate(row):
   cell=tab.cell(r,j); cell.text=str(val); cell.margin_left=Pt(3); cell.margin_right=Pt(3); cell.margin_top=Pt(2); cell.margin_bottom=Pt(2); cell.fill.solid(); cell.fill.fore_color.rgb=NAVYRGB if r==0 else (RGBColor(255,255,255) if r%2 else RGBColor(241,246,247))
   for p0 in cell.text_frame.paragraphs: p0.font.size=Pt(7 if r else 8); p0.font.bold=(r==0); p0.font.color.rgb=RGBColor(255,255,255) if r==0 else INKRGB
s=slide('What makes it feel expensive');
for i,(h,b) in enumerate([('LIGHT SLIP','CCT + squalane reduce oily drag'),('SOFT CUSHION','Olivem 1000 + 0.5% cetearyl alcohol'),('NO TACK','Humectants are balanced, not overloaded'),('PREMIUM CUE','0.15% IFRA facial fragrance—or zero')]): card(s,.55+(i%2)*6.25,1.6+(i//2)*2.2,5.85,1.8,h,b,[TEALRGB,GOLDRGB,NAVYRGB,RGBColor(108,142,173)][i])
s=slide('Ingredient → function → benefit');
for i,(h,b) in enumerate([('NIACINAMIDE 4%','Barrier + tone + sebum support'),('ALPHA-ARBUTIN 1.5%','Complementary tone-evening lever'),('PANTHENOL 2%','Fast comfort + hydration'),('ZINC PCA 0.5%','Combination/oily support'),('HA 0.1% + GLYCERIN 4%','Immediate water-rich glow'),('EDTA + PE 9010','Stability + microbial safety')]): card(s,.55+(i%3)*4.25,1.55+(i//3)*2.35,3.9,1.95,h,b,[TEALRGB,GOLDRGB,NAVYRGB][i%3])
s=slide('Bench recipe / critical controls');
text(s,.7,1.45,5.9,4.9,'1  Sanitize tools, worktop and airless pump with 70% IPA; air-dry.\n2  Slurry xanthan into glycerin. Heat Phase A and Phase B separately to 70–75°C.\n3  Pour B into A within 3–5°C; high-shear 2–3 min, then gentle mix to <45°C.\n4  Below 45°C add HA gel + alpha-arbutin + Zinc PCA.\n5  Below 40°C add panthenol, then preservative. Below 35°C add fragrance.\n6  Adjust at 25°C to pH 5.0–5.5; fill below 30°C.',16,INKRGB)
card(s,7.05,1.65,5.3,3.1,'SEE IT','Uniform opaque cream\nNo oil beads, no watery layer, no grit\nFinal viscosity develops over 24–48 h',GOLDRGB)
s=slide('Preservation is a safety system');
text(s,.7,1.5,6.0,4.8,'PE 9010-type preservative: 1.00%\nAdd below 40°C; mix 2 minutes.\nTarget pH: 5.0–5.5.\nTocopherol is an antioxidant, not a preservative.\nEssential oils are not a complete preservative system.\nOnly a microbiology lab can confirm preservative efficacy.',17,NAVYRGB,True)
card(s,7.15,1.7,5.1,3.1,'COMMERCIAL GATE','Microbial limits + preservative challenge + stability + package compatibility + documented GMP process + compliant Indian label.',TEALRGB)
s=slide('Testing plan / before commercial use');
for i,(h,b) in enumerate([('HOME SCREEN','Appearance, odour, feel, pH, colour, separation, pump function'),('LAB REQUIRED','Microbial count, preservative challenge, stability, compatibility'),('PATCH TEST','Small area 24–48 h; stop for persistent burning, swelling or hives')]): card(s,.55+i*4.15,1.75,3.7,3.0,h,b,[TEALRGB,GOLDRGB,NAVYRGB][i])
s=slide('India sourcing + Ahmedabad leads');
text(s,.65,1.4,12,4.9,'Small-pack raw materials: India Beauty Raw Material • Cosmesi Global • Purenso Select • Moksha Lifestyle • TRCkem.\n\nAhmedabad / Gujarat leads to screen:\nKRIYAM Therapeutics — kriyam.in\nAelicure Wellness — aelicurewellness.com\nCosmenova — cosmenova.in\nZymo Cosmetics — zymocosmetics.com\n\nConfirm 100–500 g sample capability, NDA, MOQ, IP ownership, COA/SDS, test scope, revisions, lead time and pricing before sharing the formula.',17,INKRGB)
s=slide('Prototype learning loop');
for i,(h,b) in enumerate([('A','Baseline after 48 h'),('B','Change one variable'),('C','Blind sensory score'),('D','Stability + pH check'),('E','Lock a controlled variant')]): card(s,.42+i*2.55,2.0,2.2,2.3,h,b,[TEALRGB,GOLDRGB,NAVYRGB,RGBColor(108,142,173),TEALRGB][i])
text(s,.7,5.25,12,.6,'Too sticky → reduce glycerin slightly. Too greasy → reduce oil. Too thin → wait 48 h, then test tiny rheology changes. Never add random ingredients.',15,NAVYRGB,True)
s=slide('Final guardrails');
text(s,.75,1.45,11.8,4.9,'• Cosmetic prototype only; not for sale.\n• No steroid, hydroquinone, pharmacy medicine or unsafe bleaching agent.\n• No guaranteed acne or pigmentation result.\n• Fragrance-free variant: replace 0.15 g Parfum with 0.15 g Aqua.\n• Use opaque airless packaging; store below 30°C, dark and sealed.\n• Downloadable companion: complete PDF tutorial + controlled CSV master.',18,NAVYRGB,True)
# Notes / references slide
s=slide('References & next conversation'); text(s,.75,1.4,11.8,5.1,'CIR safety reviews • EU SCCS alpha-arbutin opinion • EU CosIng • CDSCO / India Cosmetics Rules • supplier and manufacturer websites listed in the PDF.\n\nBring this master data, a written brief, an NDA request and a list of acceptance criteria to the formulator. Ask for a small sample first, then test and iterate.',18,INKRGB)
# add footer to all slides
for i,s in enumerate(prs.slides,1):
 text(s,11.2,7.08,1.45,.2,f'{i:02d}',9,MUTEDRGB)
pptx_path=os.path.join(OUT,'DAYLIGHT_premium_R&D_presentation.pptx'); prs.save(pptx_path)
print(pdf_path); print(pptx_path); print('hash',formula_hash)
