from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether, Flowable
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase import pdfmetrics
import os, hashlib, csv

OUT='deliverables'; os.makedirs(OUT, exist_ok=True)
# MASTER FORMULA extracted from the supplied final fixed v3 formula. Do not alter.
F=[
('Deionised water','Aqua',54.58,54.58,'A','Solvent'),
('Disodium EDTA','Disodium EDTA',0.10,0.10,'A','Chelator'),
('Glycerin','Glycerin',4.00,4.00,'A','Humectant'),
('Xanthan gum','Xanthan Gum',0.20,0.20,'A','Rheology / stabiliser'),
('Niacinamide','Niacinamide',4.00,4.00,'A','Barrier / tone / sebum support'),
('Allantoin','Allantoin',0.20,0.20,'A','Soothing / smoothing'),
('Olivem 1000','Cetearyl Olivate, Sorbitan Olivate',4.00,4.00,'B','O/W emulsifier'),
('Cetearyl alcohol','Cetearyl Alcohol',0.50,0.50,'B','Co-emulsifier / body'),
('Caprylic/capric triglyceride','Caprylic/Capric Triglyceride',4.00,4.00,'B','Light emollient'),
('Squalane','Squalane',2.00,2.00,'B','Light emollient'),
('Tocopherol','Tocopherol',0.20,0.20,'B','Oil antioxidant'),
('Deionised water (cool-down)','Aqua',20.00,20.00,'C','Solvent for cool-down actives'),
('Sodium hyaluronate','Sodium Hyaluronate',0.10,0.10,'C','Humectant / film former'),
('Alpha-arbutin (COA, HQ n.d.)','Alpha-Arbutin',1.50,1.50,'C','Tone-evening active'),
('Zinc PCA','Zinc PCA',0.50,0.50,'C','Sebum / NMF support'),
('D-panthenol 75%','Panthenol (per supplier INCI)',2.67,2.67,'C','Humectant / soothing; 2.00% active target'),
('PE 9010','Phenoxyethanol, Ethylhexylglycerin',1.00,1.00,'C','Preservative'),
('Facial fragrance (IFRA)','Parfum',0.15,0.15,'C','Sensory'),
('10% lactic acid + water process pool','Lactic Acid, Aqua',0.30,0.30,'D','pH q.s. / make-up'),
]
assert round(sum(x[2] for x in F),2)==100
HASH=hashlib.sha256(repr([(x[0],x[1],x[2],x[3],x[4]) for x in F]).encode()).hexdigest()[:12]
# CSV companion for internal audit
with open(os.path.join(OUT,'day-cream-v3-master-formula.csv'),'w',newline='') as fh:
 w=csv.writer(fh); w.writerow(['Raw Material','INCI','% w/w','g per 100g','Phase','Function'])
 for x in F:w.writerow(x[:])

NAVY=colors.HexColor('#13253F'); TEAL=colors.HexColor('#258F88'); GOLD=colors.HexColor('#C69A48'); PALE=colors.HexColor('#F2F6F7'); INK=colors.HexColor('#23334A'); MUTED=colors.HexColor('#607287'); LINE=colors.HexColor('#CBD6DC')
styles=getSampleStyleSheet()
styles.add(ParagraphStyle(name='Cover',parent=styles['Title'],fontName='Helvetica-Bold',fontSize=34,leading=38,textColor=NAVY,spaceAfter=8))
styles.add(ParagraphStyle(name='Kicker',parent=styles['Normal'],fontName='Helvetica-Bold',fontSize=9,leading=11,textColor=TEAL,tracking=1.5,spaceAfter=8))
styles.add(ParagraphStyle(name='H1c',parent=styles['Heading1'],fontName='Helvetica-Bold',fontSize=18,leading=22,textColor=NAVY,spaceBefore=3,spaceAfter=8))
styles.add(ParagraphStyle(name='H2c',parent=styles['Heading2'],fontName='Helvetica-Bold',fontSize=11.5,leading=14,textColor=TEAL,spaceBefore=8,spaceAfter=5))
styles.add(ParagraphStyle(name='Bodyc',parent=styles['BodyText'],fontSize=8.6,leading=12,textColor=INK,spaceAfter=5))
styles.add(ParagraphStyle(name='Smallc',parent=styles['BodyText'],fontSize=7.2,leading=9.4,textColor=INK,spaceAfter=2))
styles.add(ParagraphStyle(name='Tinyc',parent=styles['BodyText'],fontSize=6.3,leading=7.5,textColor=INK))
styles.add(ParagraphStyle(name='Calloutc',parent=styles['BodyText'],fontSize=9.2,leading=13,textColor=NAVY,backColor=colors.HexColor('#E6F3F1'),borderColor=TEAL,borderWidth=.8,borderPadding=8,spaceBefore=5,spaceAfter=8))

def P(t,sty='Bodyc'): return Paragraph(str(t),styles[sty])
def tbl(data,widths,small=True):
 t=Table([[P(c,'Tinyc' if small else 'Smallc') for c in r] for r in data],colWidths=widths,repeatRows=1,hAlign='LEFT')
 ts=[('VALIGN',(0,0),(-1,-1),'TOP'),('GRID',(0,0),(-1,-1),.3,LINE),('LEFTPADDING',(0,0),(-1,-1),4),('RIGHTPADDING',(0,0),(-1,-1),4),('TOPPADDING',(0,0),(-1,-1),4),('BOTTOMPADDING',(0,0),(-1,-1),4),('BACKGROUND',(0,0),(-1,0),NAVY),('TEXTCOLOR',(0,0),(-1,0),colors.white)]
 for i in range(1,len(data)):ts.append(('BACKGROUND',(0,i),(-1,i),PALE if i%2==0 else colors.white))
 t.setStyle(TableStyle(ts)); return t
class Flow(Flowable):
 def __init__(self):super().__init__();self.width=180*mm;self.height=34*mm
 def draw(self):
  c=self.canv; labs=[('A','WATER PHASE','70–75°C'),('B','OIL PHASE','70–75°C'),('EMULSIFY','OIL INTO WATER','3–5 min*'),('C','COOL-DOWN','<45°C'),('D','pH + FILL','5.0–5.5')]
  x=0
  for i,(a,b,d) in enumerate(labs):
   c.setFillColor([TEAL,GOLD,NAVY,colors.HexColor('#6F8EAA'),TEAL][i]); c.roundRect(x,10*mm,31*mm,16*mm,2.5*mm,fill=1,stroke=0)
   c.setFillColor(colors.white);c.setFont('Helvetica-Bold',8);c.drawCentredString(x+15.5*mm,20*mm,a);c.setFont('Helvetica',6.5);c.drawCentredString(x+15.5*mm,15.5*mm,b);c.drawCentredString(x+15.5*mm,12*mm,d)
   if i<4:c.setFillColor(MUTED);c.setFont('Helvetica-Bold',11);c.drawString(x+32*mm,17*mm,'→')
   x+=36*mm

def hf(c,doc):
 c.saveState(); c.setFillColor(NAVY); c.rect(0,A4[1]-9*mm,A4[0],9*mm,fill=1,stroke=0); c.setFillColor(colors.white);c.setFont('Helvetica-Bold',7.5);c.drawString(14*mm,A4[1]-6*mm,'DAY CREAM  |  FORMULATION & MANUFACTURING SPECIFICATION'); c.setFillColor(MUTED);c.setFont('Helvetica',7);c.drawRightString(A4[0]-14*mm,7*mm,f'Controlled R&D document  |  Page {doc.page}'); c.restoreState()

story=[]
story += [Spacer(1,25*mm),P('DAY CREAM','Cover'),P('FORMULATION & MANUFACTURING SPECIFICATION','Kicker'),P('Final approved master formula • Manufacturer R&D sample document','H2c'),P('A lightweight facial day cream designed for hydration, soft skin feel, fresh-looking glow, reduced appearance of dullness and a premium, fast-spreading sensory experience.', 'Calloutc'),Flow(),Spacer(1,9*mm),tbl([['Document control','Value'],['Document type','R&D formulation specification'],['Formula revision','v3 — supplied master formula'],['Product name','DAY CREAM'],['Product type','Facial Day Cream'],['Document date','02 October 2026'],['Formula data hash',HASH],['Status','For laboratory R&D sample; not commercial release']], [48*mm,126*mm],False),Spacer(1,8*mm),P('<b>FINAL MASTER FORMULA — DO NOT MODIFY WITHOUT APPROVAL</b><br/>This document preserves the supplied formulation. The Phase D line is retained as supplied: a 0.30% process pool consisting of 10% lactic-acid solution as required for pH adjustment and water make-up as required. The actual split must be recorded in the batch record.', 'Calloutc'),PageBreak()]

story += [P('1. Product information','H1c'),tbl([['Field','Specification'],['Intended use','Daily leave-on facial moisturiser for morning use. Apply to clean skin; sunscreen remains recommended for daytime use.'],['Product concept','Premium lightweight O/W facial day cream with a restrained active system and a soft, fast-spreading finish.'],['Target skin types','Normal, dry, combination and oily skin as reasonably realistic; fragrance-free variant recommended for sensitive users.'],['Desired sensory profile','Silky spread, quick absorption, hydrated but not wet, soft after-feel, low tack, low grease, no waxy drag and subtle fragrance.'],['Intended cosmetic benefits','Hydration, softness, smoothness, fresh-looking glow, reduced appearance of dullness and support for more even-looking skin tone.'],['Fragrance','0.15% facial fragrance as supplied; supplier must provide applicable IFRA documentation and allergen declaration.'],['Packaging recommendation','Opaque airless pump, preferably 30–50 g consumer pack; minimise finger contact, oxygen ingress and light exposure.'],['Claims guardrail','Cosmetic appearance claims only. No medical acne, pigmentation, melasma, whitening or guaranteed four-day claims.']], [46*mm,128*mm],False),P('Product performance target','H2c'),P('Immediate performance should be driven primarily by water-binding ingredients, light emollients and the emulsion structure. Longer-term tone support is gradual and customer-dependent. The formula is not a sunscreen and does not replace sunscreen.', 'Bodyc'),PageBreak()]

story += [P('2. FINAL MASTER FORMULA','H1c'),P('<b>FINAL MASTER FORMULA — DO NOT MODIFY WITHOUT APPROVAL</b><br/>The table below is the controlled master data extracted from the supplied v3 formula. Total = 100.00% and 1,000.00 g at 1 kg scale.', 'Calloutc')]
master=[['Raw Material','INCI Name','% w/w','100 g','1 kg','Phase','Function']]
for n,inci,pct,g,ph,fun in F:master.append([n,inci,f'{pct:.2f}',f'{g:.2f} g',f'{pct*10:.2f} g',ph,fun])
master.append(['TOTAL','', '100.00','100.00 g','1,000.00 g','',''])
story += [tbl(master,[35*mm,39*mm,12*mm,16*mm,19*mm,12*mm,41*mm]),P('Phase totals: A 63.08% / 630.80 g; B 10.70% / 107.00 g; C 25.92% / 259.20 g; D 0.30% / 3.00 g process pool.', 'Smallc'),PageBreak()]

story += [P('3. Raw-material specifications','H1c'),P('The following requirements are formulation-development controls. Where the supplied formula does not provide a numerical specification, the requirement is explicitly left for supplier or manufacturer confirmation.', 'Bodyc')]
spec=[['Raw material','Grade / COA / SDS / storage / handling requirement'],
['Deionised water','Purified water suitable for cosmetic manufacture. Microbial quality, conductivity and storage/hold time: <b>TO BE CONFIRMED WITH SUPPLIER/MANUFACTURER.</b> Use closed, clean storage.'],
['Disodium EDTA','Cosmetic grade. Assay, microbial quality, COA and SDS required. Keep dry and sealed. Exact supplier specification: <b>TO BE CONFIRMED WITH SUPPLIER/MANUFACTURER.</b>'],
['Glycerin','Vegetable cosmetic grade; IP/USP-type documentation acceptable if appropriate. COA, SDS and storage information required. Hygroscopic; keep tightly closed.'],
['Xanthan gum','Cosmetic-grade clear/soft grade preferred. COA, SDS and hydration information required. Keep dry; disperse in glycerin to avoid clumping.'],
['Niacinamide','Cosmetic-grade or suitable pharmaceutical-grade raw material with COA, assay, microbial and SDS documentation. Nicotinic-acid-related quality requirement: <b>TO BE CONFIRMED WITH SUPPLIER/MANUFACTURER.</b> Keep dry and sealed.'],
['Allantoin','Cosmetic grade with assay, COA and SDS. Keep dry. Confirm solubility and supplier handling information.'],
['Olivem 1000','Supplier-equivalent Cetearyl Olivate/Sorbitan Olivate material. TDS, COA, SDS, melting/processing information and identity confirmation required. Keep cool, dry and sealed.'],
['Cetearyl alcohol','Cosmetic grade with identity, assay/quality and SDS. Keep dry. Melting range and supplier specification: <b>TO BE CONFIRMED WITH SUPPLIER/MANUFACTURER.</b>'],
['CCT','Cosmetic grade Caprylic/Capric Triglyceride. COA should include supplier quality parameters applicable to the material; SDS required. Store closed, cool and protected from excessive heat/light.'],
['Squalane','Cosmetic-grade squalane, not squalene. Source and quality documentation required. Protect from excessive heat, light and oxidation.'],
['Tocopherol','Cosmetic-grade tocopherol; active form/content and COA required. Store tightly closed, cool and protected from light. Not a preservative.'],
['Sodium hyaluronate','Cosmetic grade; molecular-weight range, assay/quality, COA and SDS required. Keep dry, sealed and protected from heat. Hydrate slowly.'],
['Alpha-arbutin','Cosmetic grade. COA must include assay/purity and hydroquinone-related impurity specification. Storage, light/heat sensitivity and SDS required. HQ result must be documented by supplier; do not infer it.'],
['Zinc PCA','Cosmetic grade with assay, COA, SDS and solubility/pH information. Keep sealed and dry. Avoid unapproved pH or electrolyte changes.'],
['D-panthenol 75%','Cosmetic grade, 75% strength confirmed by COA. Supplier must confirm the complete INCI of the supplied liquid, storage and SDS. Formula quantity depends on 75% strength.'],
['PE 9010','Preservative blend with exact composition, use range, COA, SDS and supplier TDS. Add below the supplied process temperature. Do not treat tocopherol as preservation.'],
['Facial fragrance','Leave-on facial cosmetic grade; IFRA documentation and allergen declaration required. Storage closed, cool and dark. Do not use candle/soap fragrance.'],
['10% lactic acid + water pool','Use a documented 10% lactic-acid solution or prepare under controlled conditions. Actual acid solution quantity is q.s. to pH; unused pool is water make-up. Exact supplier and pH-adjustment specification: <b>TO BE CONFIRMED WITH SUPPLIER/MANUFACTURER.</b>']]
story += [tbl(spec,[42*mm,132*mm]),PageBreak()]

story += [P('4. Manufacturing SOP','H1c'),P('The following procedure preserves the supplied manufacturing sequence and quantities. Equipment rpm must be set and recorded by the manufacturer for its specific laboratory homogenizer.', 'Bodyc'),P('STEP 1 — Raw-material preparation','H2c'),P('<b>What to do:</b> Verify raw-material identity, lot, COA and SDS. Sanitize vessel, utensils and filling components. Use a calibrated scale, calibrated thermometer and calibrated pH meter. Weigh materials by phase. Reserve Phase C water for the cool-down premix. <b>Target:</b> clean, dry equipment. <b>Avoid:</b> unrecorded substitutions.', 'Bodyc'),P('PHASE A — WATER PHASE','H2c')]
pa=[['Material','100 g','1 kg','Order / condition'],['Deionised water','54.58 g','545.80 g','Charge first'],['Disodium EDTA','0.10 g','1.00 g','Add and dissolve'],['Glycerin','4.00 g','40.00 g','Use to slurry xanthan'],['Xanthan gum','0.20 g','2.00 g','Disperse into glycerin'],['Niacinamide','4.00 g','40.00 g','Add to water phase'],['Allantoin','0.20 g','2.00 g','Add to water phase']]
story += [tbl(pa,[43*mm,20*mm,23*mm,88*mm]),P('<b>Procedure:</b> Mix glycerin and xanthan into a smooth slurry. Charge Phase A water. Add EDTA and mix until dissolved. Add niacinamide and mix approximately 1 minute. Add allantoin and mix. Add the glycerin/xanthan slurry under mixing. Heat to 70–75°C and hold approximately 15 minutes with gentle mixing. <b>Expected:</b> uniform slightly viscous aqueous phase. <b>Do not:</b> add xanthan directly to water.', 'Bodyc'),P('PHASE B — OIL PHASE','H2c')]
pb=[['Material','100 g','1 kg','Order / condition'],['CCT','4.00 g','40.00 g','Charge liquid oil'],['Squalane','2.00 g','20.00 g','Charge liquid oil'],['Olivem 1000','4.00 g','40.00 g','Add flakes'],['Cetearyl alcohol','0.50 g','5.00 g','Add solid'],['Tocopherol','0.20 g','2.00 g','Add for final minute']]
story += [tbl(pb,[43*mm,20*mm,23*mm,88*mm]),P('<b>Procedure:</b> Combine CCT, squalane, Olivem 1000 and cetearyl alcohol. Heat to 70–75°C with mixing until all flakes are melted. Add tocopherol during the final minute. <b>Expected:</b> homogeneous melted oil phase with no visible flakes.', 'Bodyc'),P('EMULSIFICATION','H2c'),P('Bring Phases A and B within approximately 3–5°C of one another. Add Phase B to Phase A over approximately 20–30 seconds for the laboratory sample. Homogenize immediately with the manufacturer’s rotor-stator equipment for approximately 2–3 minutes as the starting laboratory condition, using a speed that avoids air entrainment. Record actual rpm, head and time. Follow with gentle sweep mixing during cooling. <b>Expected:</b> opaque, uniform cream with no oil beads or watery layer.', 'Bodyc'),PageBreak()]

story += [P('5. Cool-down, preservation, fragrance and pH','H1c'),P('COOL-DOWN PHASE — PHASE C','H2c')]
pc=[['Material','100 g','1 kg','Addition condition'],['Deionised water','20.00 g','200.00 g','Hydrate HA at room temperature'],['Sodium hyaluronate','0.10 g','1.00 g','Sprinkle slowly into water'],['Alpha-arbutin','1.50 g','15.00 g','Dissolve below 45°C'],['Zinc PCA','0.50 g','5.00 g','Dissolve below 45°C'],['D-panthenol 75%','2.67 g','26.70 g','Add below 40°C'],['PE 9010','1.00 g','10.00 g','Add below 40°C'],['Facial fragrance','0.15 g','1.50 g','Add below 35°C']]
story += [tbl(pc,[43*mm,20*mm,23*mm,88*mm]),P('<b>Procedure:</b> Cool the emulsion under gentle mixing to below 45°C. In the full Phase C water quantity, sprinkle sodium hyaluronate slowly and allow approximately 20–30 minutes hydration. Warm the premix to 35–40°C if required. Add alpha-arbutin and Zinc PCA to the same premix and mix until uniform. Do not exceed 45°C. Add the complete premix to the emulsion below 45°C and mix 1–2 minutes. Below 40°C add D-panthenol 75% and mix approximately 1 minute.', 'Bodyc'),P('PRESERVATIVE','H2c'),P('Below 40°C, add exactly 1.00 g per 100 g or 10.00 g per 1 kg PE 9010. Mix for approximately 2 minutes, ensuring complete distribution. Do not assume preservation without microbial and preservative-efficacy testing.', 'Bodyc'),P('FRAGRANCE','H2c'),P('Below 35°C, add exactly 0.15 g per 100 g or 1.50 g per 1 kg approved facial fragrance. Mix gently for 1–2 minutes. For the requested fragrance-free development version, prepare a separate controlled variant; do not silently change the master batch.', 'Bodyc'),P('pH ADJUSTMENT — PHASE D','H2c'),P('<b>Target:</b> pH 5.0–5.5 at approximately 25°C. Calibrate the pH meter with appropriate buffers. Measure after the batch has equilibrated near 25°C. Add 10% lactic-acid solution in small increments, mix approximately 60 seconds, and remeasure. The supplied formula allocates a maximum 0.30% process pool. If the full acid pool is not used, use water for the balance. Record the actual acid and water quantities. If pH is below 5.0, use an appropriately dilute pH-raising solution approved by the manufacturer. <b>FORMULA ITEM REQUIRES CONFIRMATION:</b> exact Phase D acid/water split must be established and recorded during the first R&D batch; do not assume the full 0.30 g is lactic-acid solution.', 'Calloutc'),P('FINALIZATION','H2c'),P('Mix gently for 2–3 minutes below 35°C. Perform a final weight check and adjust to exactly 100.00 g or 1,000.00 g using purified water as required by the approved batch record. Check appearance, colour, odour, pH and absence of grit or visible separation. Fill below approximately 30°C into a sanitized opaque airless pump, minimizing headspace. Rest 24–48 hours before judging final texture and viscosity.', 'Bodyc'),PageBreak()]

story += [P('6. Manufacturing precautions','H1c'),P('<b>DO NOT:</b>','H2c')]
for item in ['Change raw materials, suppliers or grades without approval and documentation.','Change percentages or batch quantities without revising the controlled master formula.','Add alpha-arbutin, sodium hyaluronate, preservative or fragrance to an excessively hot batch.','Exceed 75°C during the hot-phase process without documented development approval.','Add xanthan directly to water without pre-dispersion.','Use less than the stated preservative amount without documented formulation approval.','Treat tocopherol or fragrance as a preservative.','Use essential oils, candle fragrance or soap fragrance in place of the approved facial fragrance.','Change the pH target or release a batch outside pH 5.0–5.5 without documented approval.','Assume that an attractive appearance proves microbiological safety or commercial shelf life.','Release the sample without recording actual weights, temperatures, mixing times and deviations.']:
 story.append(P('• '+item,'Bodyc'))
story += [P('7. Finished-product specification','H1c')]
qc=[['Parameter','Specification / target','When evaluated'],['Appearance','As established during R&D; smooth, homogeneous cream with no visible separation','Finished batch'],['Colour','As established during R&D','Finished batch and stability'],['Odour','As established during R&D and approved fragrance profile','Finished batch and stability'],['pH','5.0–5.5 at approximately 25°C','Finished batch and stability'],['Texture','Smooth, homogeneous cream','Finished batch'],['Viscosity','To be established during R&D; do not invent a release number before measurement','24–48 h and stability'],['Emulsion','No visible separation, creaming or syneresis','Finished batch and stability'],['Microbial quality','Laboratory specification','Finished batch'],['Stability','Must pass the approved stability program','Development gate'],['Preservative efficacy','Must pass the selected preservative-challenge method','Development gate'],['Active stability','To be established where applicable, including alpha-arbutin-related stability review','Stability']]
story += [tbl(qc,[39*mm,96*mm,39*mm]),PageBreak()]

story += [P('8. Testing requirements','H1c'),P('The following tests are required to establish commercial suitability. Visual home or bench observation is not a substitute for qualified laboratory testing.', 'Bodyc')]
tests=[['Test','Purpose'],['Appearance / colour / odour','Detect visible or sensory drift.'],['pH','Confirm the formula remains in the specified compatibility range.'],['Viscosity','Establish product identity and monitor drift; numerical limit to be set after R&D.'],['Centrifuge','Screen for separation and emulsion weakness.'],['Freeze/thaw','Evaluate physical robustness across temperature cycling.'],['Accelerated stability','Assess heat-related changes and probable shelf-life risks.'],['40°C stability','Important for Indian climate and transport stress.'],['Packaging compatibility','Confirm no interaction with airless pump, actuator, piston, seals or pack materials.'],['Microbial testing','Confirm finished-product microbial quality.'],['Preservative challenge testing','Demonstrate preservation performance; required before commercial release.'],['Active stability','Evaluate relevant active retention and degradation, including alpha-arbutin-related impurity review where applicable.']]
story += [tbl(tests,[55*mm,119*mm]),P('Suggested observations: initial, 24 hours, 7 days, 14 days, 28 days and longer manufacturer-defined stability intervals. Test room temperature, 40°C, 4°C and freeze/thaw conditions as appropriate to the laboratory protocol.', 'Calloutc'),P('9. Requested R&D sample','H1c'),P('<b>REQUESTED DEVELOPMENT:</b><br/>Prepare an initial laboratory R&D sample using the exact FINAL MASTER FORMULA in this document. Prepare the fragranced master version and, preferably, a separate fragrance-free version as a controlled development variant.', 'Calloutc'),P('The manufacturer must record: batch number; date; raw-material lot numbers; actual weights; phase weights; manufacturing temperatures; mixing and homogenization times; equipment and rpm; pH; final batch weight; final appearance; viscosity or texture observations; packaging used; and every deviation from the master formula.', 'Bodyc'),PageBreak()]

story += [P('10. Product performance and timeline','H1c'),tbl([['Time point','Realistic cosmetic expectation'],['Immediate cosmetic effect','Comfortable hydration, softer feel, smoother spreading, temporary fresh-looking glow and reduced tightness.'],['2–4 days','More consistent softness and a fresher-looking surface for some users; no guaranteed pigment or acne result.'],['1 week','Improved comfort and surface smoothness may be more noticeable with regular use.'],['2–4 weeks','Possible improvement in the appearance of dullness and overall skin feel; results vary.'],['6–12 weeks','Most realistic assessment window for gradual support of more even-looking tone. Daily sunscreen is important for tone-related goals.']], [38*mm,136*mm],False),P('These are cosmetic expectations, not guarantees. The formula is not an acne medicine, pigmentation treatment, sunscreen or medical product.', 'Calloutc'),P('11. Packaging recommendation','H1c'),P('Use an opaque airless pump where commercially practical. This is suitable because the formula is a water-based leave-on cream containing light- and heat-sensitive development materials, a preservative system and a low fragrance load. Airless packaging reduces finger contact, reduces repeated environmental exposure and supports a premium dosing experience. Confirm pump compatibility, dose consistency, piston movement, seal integrity and long-term pack interaction during development.', 'Bodyc'),P('12. Regulatory and commercial note','H1c'),P('<b>This document is an R&D formulation specification. It does not by itself establish commercial safety, stability, regulatory compliance or shelf life. Appropriate professional testing and regulatory review must be completed before commercial sale.</b>', 'Calloutc'),P('No regulatory approval, safety guarantee or commercial shelf-life claim is made by this document.', 'Bodyc'),PageBreak()]

story += [P('13. Formula change control','H1c'),P('<b>NO INGREDIENT, RAW-MATERIAL GRADE, PERCENTAGE, PROCESS TEMPERATURE, pH TARGET OR MANUFACTURING STEP SHOULD BE CHANGED WITHOUT DOCUMENTING AND APPROVING THE CHANGE.</b>', 'Calloutc'),P('Any proposed change must identify the original value, proposed value, reason, risk assessment, responsible approver, new batch number and required repeat testing. A manufacturer may recommend a change during R&D, but the change is not part of this master formula until approved in writing.', 'Bodyc'),P('14. Approval and issue record','H1c'),tbl([['Field','Entry'],['Product','DAY CREAM'],['Formula revision','v3 — supplied master formula'],['Formula total','100.00% / 1,000.00 g'],['Prepared for','Cosmetic manufacturer / chemist / R&D laboratory'],['Status','Laboratory R&D sample specification'],['Formula data hash',HASH],['Approval signature','____________________________'],['Manufacturer acknowledgement','____________________________'],['Date','____________________________']], [56*mm,118*mm],False),Spacer(1,8*mm),P('END OF CONTROLLED DOCUMENT','Kicker')]

path=os.path.join(OUT,'DAY_CREAM_v3_MANUFACTURER_FORMULATION_MANUFACTURING.pdf')
doc=SimpleDocTemplate(path,pagesize=A4,leftMargin=14*mm,rightMargin=14*mm,topMargin=16*mm,bottomMargin=13*mm,title='DAY CREAM v3 Formulation & Manufacturing Specification',author='Cosmetic R&D')
doc.build(story,onFirstPage=hf,onLaterPages=hf)
print(path, os.path.getsize(path), HASH)
