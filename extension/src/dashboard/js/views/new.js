/**
 * ReelForge — New Project wizard.
 * Steps: 1 Basics → 2 Media → 3 Format & Style → 4 Hook → 5 Create.
 * Every "AI" button performs a real provider call; unconfigured providers
 * show setup guidance instead of fake results.
 */

import { el, icon, toast, dropzone, validateImageFile, progressBar } from '../ui.js';
import { uid, truncate } from '../../../shared/core/utils.js';
import { saveBlob, putProject } from '../../../shared/core/idb.js';
import { listBrands, DEFAULT_BRAND } from '../../../shared/core/storage.js';
import { isConfigured } from '../../../shared/core/storage.js';
import { STYLE_PRESETS, HOOK_CATEGORIES } from '../../../shared/ai/prompts.js';
import { generateHooks } from '../../../shared/ai/hooks.js';
import { CAPTION_STYLES } from '../../../shared/render/captions.js';
import { MUSIC_STYLES } from '../../../shared/render/music-synth.js';
import { runProductAnalysis, runPersonAnalysis, generateProjectStoryboard, generateCreatorPortrait } from '../../../shared/render/pipeline.js';
import { refreshSettings, state } from '../state.js';

export async function renderNewProject(view) {
  const settings = state.settings;
  const templateStyle = sessionStorage.getItem('reelforge.template');
  sessionStorage.removeItem('reelforge.template');

  // Handoff from Hook Studio ("Use in project")
  let handoffContext = null;
  let studioHook = null;
  try {
    const hookRaw = sessionStorage.getItem('reelforge.hook');
    if (hookRaw) studioHook = JSON.parse(hookRaw);
    const ctxRaw = sessionStorage.getItem('reelforge.hookContext');
    if (ctxRaw) handoffContext = JSON.parse(ctxRaw);
  } catch { /* ignore malformed handoff */ }
  sessionStorage.removeItem('reelforge.hook');
  sessionStorage.removeItem('reelforge.hookContext');

  const wizard = {
    step: 1,
    name: '',
    script: handoffContext?.script || '',
    productName: handoffContext?.productName || '',
    productInfo: handoffContext?.productInfo || '',
    brandId: '',
    productImages: [], // File objects
    personImage: null, // File | null
    referenceReel: null, // File | null (style reference only — never copied)
    additionalInstructions: '',
    autoCreator: true,
    beautyMode: true,
    aspect: settings?.defaults?.aspect || '9:16',
    durationSec: settings?.defaults?.durationSec || 30,
    stylePreset: templateStyle || 'realistic-ugc',
    customInstructions: '',
    voice: { style: 'casual-friendly', speed: 1.0 },
    captionStyle: settings?.defaults?.captionStyle || 'bold-pop',
    music: { source: settings?.music?.provider === 'fal' ? 'provider' : 'local', styleId: 'upbeat-pop', uploadFile: null },
    animateScenes: isConfigured('video', settings),
    talkingCreator: isConfigured('lipsync', settings),
    hooks: [],
    selectedHook: null,
  };

  const steps = ['Basics', 'Media', 'Format & Style', 'Hook', 'Create'];
  const stepsBar = el('div', { class: 'wizard-steps' });
  const body = el('div', {});
  const footer = el('div', { class: 'row', style: { marginTop: '22px', justifyContent: 'space-between' } });

  view.append(stepsBar, body, footer);
  renderStep();

  function paintSteps() {
    stepsBar.innerHTML = '';
    steps.forEach((label, i) => {
      const n = i + 1;
      stepsBar.append(el('div', {
        class: `wstep ${wizard.step === n ? 'active' : ''} ${wizard.step > n ? 'done' : ''}`,
        onclick: () => { wizard.step = n; renderStep(); },
      }, el('span', { class: 'n' }, wizard.step > n ? '✓' : String(n)), label));
    });
  }

  function renderStep() {
    paintSteps();
    body.innerHTML = '';
    footer.innerHTML = '';
    ({ 1: stepBasics, 2: stepMedia, 3: stepFormat, 4: stepHook, 5: stepCreate }[wizard.step])();
    footer.append(
      wizard.step > 1 ? el('button', { class: 'btn ghost', onclick: () => { wizard.step--; renderStep(); } }, icon('chevL'), 'Back') : el('span'),
      wizard.step < 5
        ? el('button', { class: 'btn primary', onclick: () => { wizard.step++; renderStep(); } }, 'Next', icon('chevR'))
        : null,
    );
  }

  /* ------------------------------- step 1 -------------------------------- */

  function stepBasics() {
    const scriptArea = el('textarea', {
      class: 'input', rows: '8',
      placeholder: 'Paste your UGC script here…\n\nExample:\n"Okay so I have to talk about this serum because my skin has honestly never looked better. I used to wake up with dull, tired skin every single day…"',
    });
    scriptArea.value = wizard.script;
    scriptArea.addEventListener('input', () => {
      wizard.script = scriptArea.value;
      count.textContent = `${wizard.script.length} chars · ~${Math.max(1, Math.round(wizard.script.split(/\s+/).filter(Boolean).length / 2.6))}s spoken`;
      if (!wizard.name && wizard.productName) wizard.name = `${wizard.productName} UGC Reel`;
    });
    const count = el('span', { class: 'charcount hint' });

    const nameIn = el('input', { class: 'input', placeholder: 'e.g. Glow Serum — Instagram Reel', value: wizard.name });
    nameIn.addEventListener('input', () => { wizard.name = nameIn.value; });
    const prodIn = el('input', { class: 'input', placeholder: 'e.g. Radiance Vitamin C Serum', value: wizard.productName });
    prodIn.addEventListener('input', () => {
      wizard.productName = prodIn.value;
      if (!wizard.name.trim()) { wizard.name = `${wizard.productName} UGC Reel`; nameIn.value = wizard.name; }
    });
    const infoIn = el('textarea', { class: 'input', rows: '4', placeholder: 'Key ingredients, benefits, price, anything the creator should mention…' });
    infoIn.value = wizard.productInfo;
    infoIn.addEventListener('input', () => { wizard.productInfo = infoIn.value; });

    const brandSel = el('select', { class: 'input' }, el('option', { value: '' }, '— No brand kit —'));
    listBrands().then((brands) => {
      for (const b of brands) brandSel.append(el('option', { value: b.id, selected: wizard.brandId === b.id }, b.name || 'Unnamed brand'));
    });
    brandSel.addEventListener('change', () => { wizard.brandId = brandSel.value; });

    const txt = dropzone({
      accept: '.txt,text/plain', label: 'Upload a .txt script instead', sub: '',
      onFiles: async ([f]) => { scriptArea.value = await f.text(); scriptArea.dispatchEvent(new Event('input')); },
    });

    body.append(el('div', { class: 'card', style: { maxWidth: '860px' } },
      el('h3', {}, 'Project basics'),
      field('Project name', nameIn),
      field(el('span', {}, 'Video script ', count), scriptArea, el('p', { class: 'hint' }, 'The AI reads this to decide the storyboard structure (hook → problem → demo → CTA …). No script? Describe the message and the AI writes the script for you.'), el('div', { style: { marginTop: '8px' } }, txt)),
      el('div', { class: 'grid cols-2' },
        field('Product name', prodIn),
        field('Brand kit (optional)', brandSel),
      ),
      field('Product information', infoIn),
    ));
  }

  /* ------------------------------- step 2 -------------------------------- */

  function stepMedia() {
    const strip = el('div', { class: 'thumb-strip' });
    const paint = () => {
      strip.innerHTML = '';
      wizard.productImages.forEach((f, i) => {
        const url = URL.createObjectURL(f);
        strip.append(el('div', { class: 'thumb' },
          el('img', { src: url }),
          el('span', { class: 'tag' }, `PRODUCT-${i + 1}`),
          el('button', { class: 'remove', title: 'Remove', onclick: () => { wizard.productImages.splice(i, 1); paint(); } }, '✕'),
        ));
      });
    };
    const dz = dropzone({
      multiple: true,
      label: 'Drop product photos here', sub: 'JPG · PNG · WebP · up to 6 photos · keep packaging clearly visible',
      onFiles: (files) => {
        for (const f of files) {
          if (!validateImageFile(f)) continue;
          if (wizard.productImages.length >= 6) { toast('Maximum 6 product photos', 'warn'); break; }
          wizard.productImages.push(f);
        }
        paint();
      },
    });

    const personStrip = el('div', { class: 'thumb-strip' });
    const paintPerson = () => {
      personStrip.innerHTML = '';
      if (wizard.personImage) {
        const url = URL.createObjectURL(wizard.personImage);
        personStrip.append(el('div', { class: 'thumb' },
          el('img', { src: url }),
          el('span', { class: 'tag' }, 'CREATOR'),
          el('button', { class: 'remove', title: 'Remove', onclick: () => { wizard.personImage = null; paintPerson(); } }, '✕'),
        ));
      }
    };
    const personDz = dropzone({
      label: 'Optional: creator reference photo', sub: 'The same person will be kept consistent across all scenes',
      onFiles: ([f]) => {
        if (!validateImageFile(f)) return;
        wizard.personImage = f;
        wizard.autoCreator = false;
        autoCheck.querySelector('input').checked = false;
        paintPerson();
      },
    });
    const autoCheck = checkRow('No creator photo? Auto-generate a photorealistic UGC creator matched to the product', wizard.autoCreator, (v) => { wizard.autoCreator = v; });
    const beautyCheck = checkRow('Beauty UGC mode (skincare / cosmetics scene templates)', wizard.beautyMode, (v) => { wizard.beautyMode = v; });
    if (wizard.personImage) paintPerson();

    body.append(el('div', { class: 'card', style: { maxWidth: '860px' } },
      el('h3', {}, 'Product & creator photos'),
      el('p', { class: 'sub' }, 'Product photos are passed to the image AI as references so the packaging, logo and label stay consistent in every scene.'),
      dz, strip,
      el('hr', { class: 'divider' }),
      personDz, personStrip,
      autoCheck,
      el('p', { class: 'hint', style: { marginBottom: '4px' } }, 'ℹ️ Product photo understanding (packaging, colors, label) uses your vision-capable LLM. If your LLM has no vision, describe the product in step 1 instead.'),
      beautyCheck,
      el('hr', { class: 'divider' }),
      el('h3', {}, '🎞 Reference Reel (optional)'),
      el('p', { class: 'sub' }, 'Point the AI at a reel whose style you love. It analyzes hook technique, scene structure, camera work, pacing, transitions, speaking style, gestures, caption look, lighting and overall visual DNA — then recreates that STYLE with your product, script and creator.'),
      refWrap,
    ));
  }

  /* ------------------------------- step 3 -------------------------------- */

  function stepFormat() {
    const aspectCards = el('div', { class: 'row' });
    for (const a of ['9:16', '1:1', '16:9']) {
      const b = el('button', { class: `btn ${wizard.aspect === a ? 'primary' : ''}`, style: { minWidth: '90px' } },
        a === '9:16' ? '📱 9:16' : a === '1:1' ? '🔲 1:1' : '🖥 16:9');
      b.addEventListener('click', () => { wizard.aspect = a; aspectCards.querySelectorAll('.btn').forEach((x) => x.classList.remove('primary')); b.classList.add('primary'); });
      aspectCards.append(b);
    }
    const dur = el('input', { type: 'range', min: '15', max: '60', step: '5', value: wizard.durationSec });
    const durLbl = el('span', { class: 'hint', style: { minWidth: '70px' } }, `${wizard.durationSec}s`);
    dur.addEventListener('input', () => { wizard.durationSec = Number(dur.value); durLbl.textContent = `${wizard.durationSec}s`; });

    const styleGrid = el('div', { class: 'grid cols-4', style: { marginTop: '8px' } });
    for (const st of STYLE_PRESETS) {
      const c = el('div', { class: `style-card ${wizard.stylePreset === st.id ? 'selected' : ''}` },
        el('div', { class: 'emoji' }, st.icon), el('b', {}, st.name), el('span', {}, st.description));
      c.addEventListener('click', () => {
        wizard.stylePreset = st.id;
        styleGrid.querySelectorAll('.style-card').forEach((x) => x.classList.remove('selected'));
        c.classList.add('selected');
      });
      styleGrid.append(c);
    }

    const custom = el('textarea', { class: 'input', rows: '3', placeholder: 'Optional extra style directions, e.g. "golden hour lighting, creator speaks Spanish with Mexican accent, minimal makeup"' });
    custom.addEventListener('input', () => { wizard.customInstructions = custom.value; });

    // Voice
    const ttsOk = isConfigured('tts', settings);
    const voiceStyle = el('select', { class: 'input' },
      el('option', { value: 'casual-friendly' }, 'Casual & friendly (UGC default)'),
      el('option', { value: 'excited-hype' }, 'Excited hype'),
      el('option', { value: 'calm-trust' }, 'Calm & trustworthy'),
      el('option', { value: 'playful' }, 'Playful'),
    );
    voiceStyle.addEventListener('change', () => { wizard.voice.style = voiceStyle.value; });
    const speed = el('input', { type: 'range', min: '0.8', max: '1.3', step: '0.05', value: wizard.voice.speed });
    const speedLbl = el('span', { class: 'hint', style: { minWidth: '44px' } }, `${wizard.voice.speed}×`);
    speed.addEventListener('input', () => { wizard.voice.speed = Number(speed.value); speedLbl.textContent = `${wizard.voice.speed}×`; });

    // Captions
    const capSel = el('select', { class: 'input' },
      ...CAPTION_STYLES.map((c) => el('option', { value: c.id, selected: wizard.captionStyle === c.id }, `${c.label} — ${c.hint}`)));
    capSel.addEventListener('change', () => { wizard.captionStyle = capSel.value; });

    // Music
    const musicSource = el('select', { class: 'input' },
      el('option', { value: 'local', selected: wizard.music.source === 'local' }, 'Local procedural generator (free, offline)'),
      ...(isConfigured('music', settings) && settings.music.provider !== 'local' ? [el('option', { value: 'provider', selected: wizard.music.source === 'provider' }, `${settings.music.provider} AI music`)] : []),
      el('option', { value: 'upload' }, 'Upload my own licensed track'),
    );
    const musicStyle = el('select', { class: 'input' },
      ...MUSIC_STYLES.map((m) => el('option', { value: m.id, selected: wizard.music.styleId === m.id }, `${m.label} — ${m.hint}`)));
    musicStyle.addEventListener('change', () => { wizard.music.styleId = musicStyle.value; });
    const musicUploadWrap = el('div', { style: { display: 'none' } });
    musicSource.addEventListener('change', () => {
      wizard.music.source = musicSource.value;
      musicStyle.style.display = musicSource.value === 'local' ? '' : 'none';
      musicUploadWrap.style.display = musicSource.value === 'upload' ? '' : 'none';
    });
    dropzone({
      accept: 'audio/*', label: 'Upload music file', sub: 'MP3 · WAV · M4A — you are responsible for holding the license',
      onFiles: ([f]) => { wizard.music.uploadFile = f; toast(`Music file added: ${f.name}`, 'success', 2500); },
    }).appendTo?.();
    musicUploadWrap.append(dropzone({
      accept: 'audio/*', label: 'Upload music file', sub: 'MP3 · WAV · M4A — you are responsible for holding the license',
      onFiles: ([f]) => { wizard.music.uploadFile = f; toast(`Music file added: ${f.name}`, 'success', 2500); },
    }));

    // Optional AI video / lipsync
    const videoOk = isConfigured('video', settings);
    const lipOk = isConfigured('lipsync', settings);
    const videoCheck = checkRow(`Animate scenes into AI video clips ${videoOk ? '(uses your video provider — slower & costs credits)' : '(configure a video provider in Settings to enable)'}`, wizard.animateScenes && videoOk, (v) => { wizard.animateScenes = v; });
    if (!videoOk) { videoCheck.querySelector('input').disabled = true; }
    const lipCheck = checkRow(`Talking creator with lip-sync ${lipOk ? '' : '(configure a lip-sync provider in Settings to enable)'}`, wizard.talkingCreator && lipOk, (v) => { wizard.talkingCreator = v; });
    if (!lipOk) { lipCheck.querySelector('input').disabled = true; }

    body.append(el('div', { class: 'card', style: { maxWidth: '980px' } },
      el('h3', {}, 'Format'),
      aspectCards,
      field('Target duration', el('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } }, dur, durLbl)),
      el('hr', { class: 'divider' }),
      el('h3', {}, 'Visual style'),
      styleGrid,
      el('label', { class: 'field', style: { marginTop: '12px' } },
        el('span', {}, 'Additional instructions — direct the AI (highest creative priority)'),
        chips,
        custom,
        el('p', { class: 'hint' }, 'These commands are compiled into the storyboard, the scene images, the voice delivery and the pacing. Priority: your script + product + model image + reference style, with your instructions as the final creative override.'),
      ),
      el('hr', { class: 'divider' }),
      el('h3', {}, 'Voice'),
      ttsOk
        ? el('div', { class: 'grid cols-2' },
            field('Voice style', voiceStyle),
            field('Speaking speed', el('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } }, speed, speedLbl)),
          )
        : el('div', { class: 'note warn', style: { marginBottom: '10px' } }, '⚠ No voice provider configured. ', el('a', { href: '#/settings' }, 'Set one in Settings'), ' to give your creator a voice. The video will still render with captions + music.'),
      el('hr', { class: 'divider' }),
      el('h3', {}, 'Captions & music'),
      el('div', { class: 'grid cols-2' },
        field('Caption style', capSel),
        field('Background music', el('div', {},
          musicSource, el('div', { style: { marginTop: '8px' } }, musicStyle), musicUploadWrap,
        )),
      ),
      el('hr', { class: 'divider' }),
      el('h3', {}, 'AI upgrades (optional)'),
      videoCheck, lipCheck,
    ));
  }

  /* ------------------------------- step 4 -------------------------------- */

  function stepHook() {
    const wrap = el('div', { class: 'card', style: { maxWidth: '980px' } });
    body.append(wrap);
    wrap.append(
      el('h3', {}, 'AI Hook Generator'),
      el('p', { class: 'sub' }, 'The first 1–3 seconds decide everything. Generate scroll-stopping openers across 12 proven categories, pick one, or skip and let the storyboard AI decide.'),
    );

    if (!isConfigured('llm', settings)) {
      wrap.append(el('div', { class: 'note warn' }, '⚠ Connect an LLM provider in ', el('a', { href: '#/settings' }, 'Settings'), ' to generate hooks. You can continue without hooks.'));
      return;
    }

    const btn = el('button', { class: 'btn primary' }, icon('spark'), wizard.hooks.length ? 'Regenerate hooks' : 'Generate hooks');
    const results = el('div', { style: { marginTop: '14px' } });
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Generating…';
      try {
        wizard.hooks = await generateHooks({
          productName: wizard.productName,
          productInfo: wizard.productInfo,
          script: wizard.script,
          brand: null,
          count: 12,
        });
        paintHooks();
      } catch (e) {
        toast(`Hook generation failed: ${e.message}`, 'error', 7000);
      }
      btn.disabled = false;
      btn.innerHTML = `${icon('spark').innerHTML} Regenerate hooks`;
    });
    wrap.append(btn, results);

    function paintHooks() {
      results.innerHTML = '';
      if (!wizard.hooks.length) return;
      const grid = el('div', { class: 'grid cols-2' });
      for (const h of wizard.hooks) {
        const cat = HOOK_CATEGORIES.find((c) => c.id === h.category);
        const card = el('div', { class: `hook-card ${wizard.selectedHook?.id === h.id ? 'selected' : ''}` },
          el('div', { class: 'row', style: { gap: '6px' } },
            el('span', { class: 'badge violet' }, cat?.label || h.category),
          ),
          el('div', { class: 'text' }, `“${h.text}”`),
          h.visual ? el('div', { class: 'visual' }, `🎥 ${h.visual}`) : null,
          h.why ? el('div', { class: 'why' }, `💡 ${h.why}`) : null,
        );
        card.addEventListener('click', () => {
          wizard.selectedHook = wizard.selectedHook?.id === h.id ? null : h;
          results.querySelectorAll('.hook-card').forEach((x) => x.classList.remove('selected'));
          if (wizard.selectedHook) card.classList.add('selected');
        });
        grid.append(card);
      }
      results.append(
        el('p', { class: 'hint', style: { marginBottom: '10px' } }, wizard.selectedHook ? '✓ Hook selected — this will open your video.' : 'Click a hook to select it, or continue without one.'),
        grid,
      );
    }
  }

  /* ------------------------------- step 5 -------------------------------- */

  function stepCreate() {
    const card = el('div', { class: 'card', style: { maxWidth: '860px' } });
    body.append(card);
    card.append(el('h3', {}, 'Review & create'), el('p', { class: 'sub' }, 'The AI will now analyze your product photos and direct the storyboard. This uses your configured LLM (and vision model if photos are added).'));

    card.append(el('dl', { class: 'kv-table' },
      el('dt', {}, 'Name'), el('dd', {}, wizard.name || 'Untitled UGC Reel'),
      el('dt', {}, 'Script'), el('dd', {}, wizard.script ? truncate(wizard.script, 140) : '— AI will write it —'),
      el('dt', {}, 'Product'), el('dd', {}, wizard.productName || '—'),
      el('dt', {}, 'Photos'), el('dd', {}, `${wizard.productImages.length} product · ${wizard.personImage ? 'creator photo' : wizard.autoCreator ? 'auto-generated creator' : 'no creator'}`),
      el('dt', {}, 'Reference reel'), el('dd', {}, wizard.referenceReel ? `style analysis ✓ (${truncate(wizard.referenceReel.name || 'video', 40)})` : 'none'),
      el('dt', {}, 'Instructions'), el('dd', {}, wizard.additionalInstructions ? `${truncate(wizard.additionalInstructions, 80)}` : 'none'),
      el('dt', {}, 'Format'), el('dd', {}, `${wizard.aspect} · ~${wizard.durationSec}s · ${STYLE_PRESETS.find((s) => s.id === wizard.stylePreset)?.name}`),
      el('dt', {}, 'Hook'), el('dd', {}, wizard.selectedHook ? `“${truncate(wizard.selectedHook.text, 60)}”` : 'AI decides'),
      el('dt', {}, 'Voice'), el('dd', {}, isConfigured('tts', settings) ? `${wizard.voice.style} · ${wizard.voice.speed}×` : 'not configured (captions only)'),
      el('dt', {}, 'AI video / lip-sync'), el('dd', {}, `${wizard.animateScenes ? 'video clips ✓' : 'video ✗'} · ${wizard.talkingCreator ? 'lip-sync ✓' : 'lip-sync ✗'}`),
    ));

    const go = el('button', { class: 'btn primary', style: { marginTop: '16px' } }, icon('wand'), 'Create project & generate storyboard');
    const progress = el('div', { style: { marginTop: '14px', display: 'none' } });
    card.append(go, progress);

    go.addEventListener('click', async () => {
      go.disabled = true;
      progress.style.display = '';
      const bar = progressBar('Preparing…');
      progress.append(bar.root);

      try {
        // 1. build the project record
        const project = {
          id: uid('proj'),
          name: wizard.name || `${wizard.productName || 'New'} UGC Reel`,
          createdAt: Date.now(), updatedAt: Date.now(),
          status: 'draft',
          input: {
            script: wizard.script, productName: wizard.productName, productInfo: wizard.productInfo,
            images: [], personImage: null, personAutoGenerated: false,
            beautyMode: wizard.beautyMode, aspect: wizard.aspect, durationSec: wizard.durationSec,
            stylePreset: wizard.stylePreset, customInstructions: wizard.customInstructions,
            voice: wizard.voice, captionStyle: wizard.captionStyle,
            selectedHook: wizard.selectedHook,
            productAnalysis: null, personInfo: null,
          },
          brand: null,
          options: { animateScenes: wizard.animateScenes, talkingCreator: wizard.talkingCreator },
          storyboard: null,
          music: { source: wizard.music.source, styleId: wizard.music.styleId },
          captions: { style: wizard.captionStyle },
          render: null,
        };

        // brand snapshot
        if (wizard.brandId) {
          const brands = await listBrands();
          const b = brands.find((x) => x.id === wizard.brandId);
          if (b) project.brand = { ...DEFAULT_BRAND, ...b };
        }

        // 2. save images
        bar.set(0.05, 'Saving photos…');
        for (const f of wizard.productImages) {
          const asset = await saveBlob(f, { name: f.name, type: f.type });
          project.input.images.push(asset.id);
        }
        if (wizard.personImage) {
          const asset = await saveBlob(wizard.personImage, { name: wizard.personImage.name, type: wizard.personImage.type });
          project.input.personImage = asset.id;
        } else if (wizard.autoCreator) {
          bar.set(0.08, 'Designing your AI creator…');
          try { await generateCreatorPortrait(project); } catch (e) {
            toast(`Creator generation failed (${e.message}) — you can retry in the project view.`, 'warn', 7000);
          }
        }
        if (wizard.music.uploadFile) {
          const asset = await saveBlob(wizard.music.uploadFile, { name: wizard.music.uploadFile.name, type: wizard.music.uploadFile.type });
          project.music.uploadedAssetId = asset.id;
        }
        await putProject(project);

        // 3. analysis + storyboard
        bar.set(0.15, 'Analyzing product photos (vision AI)…');
        try { await runProductAnalysis(project); } catch (e) {
          toast(`Product analysis skipped: ${truncate(e.message, 120)}`, 'warn', 6000);
        }
        bar.set(0.3, 'Analyzing creator photo…');
        try { await runPersonAnalysis(project); } catch { /* best effort */ }
        bar.set(0.45, 'Directing the storyboard (LLM)…');
        await generateProjectStoryboard(project);
        bar.set(1, 'Storyboard ready ✓');

        toast('Storyboard created! Review and edit it before generating assets.', 'success', 5000);
        setTimeout(() => { location.hash = `#/project/${project.id}`; }, 600);
      } catch (err) {
        bar.set(0, `Failed: ${err.message}`);
        go.disabled = false;
        toast(err.message, 'error', 8000);
      }
    });
  }
}

/* ------------------------------- tiny helpers ------------------------------ */

function field(label, input, ...extra) {
  return el('label', { class: 'field' },
    typeof label === 'string' ? el('span', {}, label) : label,
    input, ...extra.filter(Boolean));
}

function checkRow(label, value, onChange) {
  const c = el('input', { type: 'checkbox' });
  c.checked = !!value;
  c.addEventListener('change', () => onChange(c.checked));
  return el('label', { class: 'check-row' }, c, el('span', {}, label));
}
