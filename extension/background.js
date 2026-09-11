chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.local.get(['ugc_backend_url', 'ugc_brand_kit']);
  if (!current.ugc_backend_url) {
    await chrome.storage.local.set({ ugc_backend_url: 'http://localhost:8787/api' });
  }
  if (!current.ugc_brand_kit) {
    await chrome.storage.local.set({
      ugc_brand_kit: {
        brandName: 'Rangat Naturals',
        tagline: 'Everyday care, made beautifully.',
        primary: '#d7f35b',
        secondary: '#1c2330',
        accent: '#ff9b72',
        font: 'DM Sans',
        cta: 'Shop now',
        website: 'rangatnaturals.com',
        defaultStyle: 'Beauty / cosmetics UGC'
      }
    });
  }
});

chrome.action.onClicked.addListener(async () => {
  if (chrome.sidePanel?.open) {
    const window = await chrome.windows.getCurrent();
    await chrome.sidePanel.open({ windowId: window.id });
  }
});
