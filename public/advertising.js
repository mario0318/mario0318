(function () {
  'use strict';
  const source = document.currentScript;
  const slot = document.querySelector('[data-r3-ad]');
  if (!slot || slot.dataset.ready) return;
  slot.dataset.ready = 'true';
  const key = 'r3.advertising.v1';
  const publisher = 'ca-pub-6507410494434871';
  const unit = '7377031674';
  const previewKeys = ['r3adtest', 'fc', 'fctype', 'fcgeo'];
  const queryBlocked = [...new URLSearchParams(location.search).keys()].some(name => !previewKeys.includes(name));
  const blocked = navigator.globalPrivacyControl === true || navigator.doNotTrack === '1' || queryBlocked;
  let preference = 'off';
  try { preference = localStorage.getItem(key) || 'off'; } catch (_) {}
  let started = false, euAllowed = false, usAllowed = false, requested = false;
  function element(tag, text, parent) {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    if (parent) parent.appendChild(node);
    return node;
  }
  slot.classList.add('r3-advertising');
  const controls = element('div', '', slot);
  controls.className = 'r3-advertising-controls';
  const settings = element('button', 'Advertising settings', controls);
  settings.type = 'button';
  const policy = element('a', 'Advertising privacy', controls);
  policy.href = slot.dataset.policy || '/advertising-privacy.html';
  const status = element('p', blocked ? 'Advertising is off because your browser requests privacy.' : 'Advertising is off until you choose to enable it.', slot);
  status.setAttribute('role', 'status');
  const space = element('div', '', slot);
  const dialog = element('dialog', '', slot);
  dialog.className = 'r3-advertising-dialog';
  dialog.setAttribute('aria-label', 'Advertising settings');
  element('h2', 'Advertising settings', dialog);
  element('p', 'Advertising is optional. If enabled, Google and its advertising partners receive network information such as your IP address and may use cookies or device identifiers. Google will present additional consent or opt-out choices where applicable. The site works with advertising off.', dialog);
  element('p', 'Your choice is saved in this browser for this website. Do Not Track and Global Privacy Control keep advertising off.', dialog);
  const allow = element('button', 'Enable Google advertising', dialog);
  allow.type = 'button';
  allow.disabled = blocked;
  const decline = element('button', 'Keep advertising off', dialog);
  decline.type = 'button';
  const manage = element('button', 'Google privacy choices', dialog);
  manage.type = 'button';
  const close = element('button', 'Close', dialog);
  close.type = 'button';
  function store(value) { preference = value; try { localStorage.setItem(key, value); } catch (_) {} }
  function show() { manage.hidden = !started; dialog.showModal(); }
  settings.addEventListener('click', show);
  close.addEventListener('click', () => dialog.close());
  decline.addEventListener('click', () => {
    store('off');
    dialog.close();
    if (started) location.reload();
    else status.textContent = 'Advertising is off.';
  });
  manage.addEventListener('click', () => {
    dialog.close();
    window.googlefc.callbackQueue.push(() => window.googlefc.showRevocationMessage());
  });
  function removeAd() {
    space.replaceChildren();
    requested = false;
    status.textContent = 'No ad is requested without the required privacy choices.';
  }
  function requestAd() {
    if (slot.dataset.settingsOnly === 'true') { status.textContent = 'Use these controls to manage advertising on this website.'; return; }
    if (blocked || preference !== 'on' || !euAllowed || !usAllowed || requested) return;
    requested = true;
    element('span', 'Advertisement', space).className = 'r3-advertising-label';
    const ad = element('ins', '', space);
    ad.className = 'adsbygoogle';
    ad.style.display = 'block';
    ad.dataset.adClient = publisher;
    ad.dataset.adSlot = unit;
    ad.dataset.adFormat = 'auto';
    ad.dataset.fullWidthResponsive = 'true';
    if (new URLSearchParams(location.search).get('r3adtest') === '1') ad.dataset.adtest = 'on';
    status.textContent = 'Advertising enabled. Availability depends on Google approval and ad inventory.';
    try { window.adsbygoogle.push({}); } catch (_) { removeAd(); status.textContent = 'Advertising is unavailable. You can continue using the site.'; }
  }
  function start() {
    if (blocked || started || preference !== 'on') return;
    started = true;
    status.textContent = 'Checking Google privacy choices before requesting an ad.';
    window.googlefc = window.googlefc || {};
    window.googlefc.callbackQueue = window.googlefc.callbackQueue || [];
    window.googlefc.callbackQueue.push({ CONSENT_DATA_READY: () => {
      if (typeof window.__tcfapi !== 'function') return;
      window.__tcfapi('addEventListener', 2, (data, success) => {
        if (!success || !data || data.cmpStatus !== 'loaded') return;
        euAllowed = data.gdprApplies === false || (data.gdprApplies === true && ['tcloaded', 'useractioncomplete'].includes(data.eventStatus) && data.purpose?.consents?.[1] === true && data.purpose?.consents?.[2] === true && data.vendor?.consents?.[755] === true);
        if (!euAllowed && requested) removeAd();
        requestAd();
      });
    }});
    window.googlefc.callbackQueue.push({ INITIAL_US_STATES_OPT_OUT_DATA_READY: () => {
      const api = window.googlefc.usstatesoptout;
      if (!api || typeof api.getInitialUsStatesOptOutStatus !== 'function') return;
      const value = api.getInitialUsStatesOptOutStatus();
      usAllowed = value === api.InitialUsStatesOptOutStatusEnum.DOES_NOT_APPLY || value === api.InitialUsStatesOptOutStatusEnum.NOT_OPTED_OUT;
      requestAd();
    }});
    window.adsbygoogle = window.adsbygoogle || [];
    window.adsbygoogle.requestNonPersonalizedAds = 1;
    const script = document.createElement('script');
    script.async = true;
    script.crossOrigin = 'anonymous';
    if (source?.nonce) script.nonce = source.nonce;
    script.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + publisher;
    script.addEventListener('error', () => { status.textContent = 'Google advertising is unavailable. The rest of the site still works.'; });
    document.head.appendChild(script);
  }
  allow.addEventListener('click', () => { if (!blocked) { store('on'); dialog.close(); start(); } });
  document.addEventListener('click', event => {
    const target = event.target.closest('[data-r3-ad-settings]');
    if (target) { event.preventDefault(); show(); }
  });
  // A full navigation unloads the SDK before entering a page without advertising.
  document.addEventListener('click', event => {
    if (!started || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest('a[href]');
    if (!link || link.target === '_blank' || link.hasAttribute('download')) return;
    const destination = new URL(link.href, location.href);
    if (destination.origin !== location.origin || (destination.pathname === location.pathname && destination.search === location.search)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    location.assign(destination.href);
  }, true);
  window.addEventListener('storage', event => { if (event.key === key && event.newValue !== 'on' && started) location.reload(); });
  if (!blocked) start();
})();
