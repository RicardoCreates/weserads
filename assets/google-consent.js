(function () {
  const storageKey = 'weserads-google-ads-analytics-consent';
  const useAdsConversion = document.currentScript.hasAttribute('data-google-ads');
  let googleTagManagerRequested = false;
  let googleAdsTagRequested = false;
  let googleAdsTagConfigured = false;
  let googleTagInitialized = false;
  let banner;

  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  window.weserAdsAdsConsent = false;
  window.gtag('consent', 'default', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'denied'
  });

  function loadScript(src, onError) {
    const script = document.createElement('script');
    script.async = true;
    script.src = src;
    script.addEventListener('error', onError);
    document.head.appendChild(script);
  }

  function loadGoogleTags() {
    if (!googleTagInitialized) {
      window.gtag('js', new Date());
      googleTagInitialized = true;
    }

    if (!googleTagManagerRequested) {
      googleTagManagerRequested = true;
      window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
      loadScript('https://www.googletagmanager.com/gtm.js?id=GTM-W7TT3GZ6', () => {
        googleTagManagerRequested = false;
        console.error('Der Google Tag Manager konnte nicht geladen werden.');
      });
    }

    if (useAdsConversion && !googleAdsTagRequested) {
      googleAdsTagRequested = true;
      if (!googleAdsTagConfigured) {
        window.gtag('config', 'AW-18579248744');
        googleAdsTagConfigured = true;
      }
      loadScript('https://www.googletagmanager.com/gtag/js?id=AW-18579248744', () => {
        googleAdsTagRequested = false;
        console.error('Das Google-Ads-Tag konnte nicht geladen werden.');
      });
    }
  }

  function applyConsent(granted) {
    window.weserAdsAdsConsent = granted;
    window.gtag('consent', 'update', {
      ad_storage: granted ? 'granted' : 'denied',
      ad_user_data: granted ? 'granted' : 'denied',
      ad_personalization: 'denied',
      analytics_storage: granted ? 'granted' : 'denied'
    });
    if (granted) loadGoogleTags();
  }

  function readConsent() {
    try {
      return window.localStorage.getItem(storageKey);
    } catch (error) {
      console.error('Die gespeicherte Cookie-Auswahl konnte nicht gelesen werden.', error);
      return null;
    }
  }

  function saveConsent(value) {
    try {
      window.localStorage.setItem(storageKey, value);
    } catch (error) {
      console.error('Die Cookie-Auswahl konnte nicht gespeichert werden.', error);
    }
  }

  const savedConsent = readConsent();
  if (savedConsent === 'granted' || savedConsent === 'denied') {
    applyConsent(savedConsent === 'granted');
  }

  window.addEventListener('storage', (event) => {
    if (event.key !== storageKey && event.key !== null) return;
    const value = readConsent();
    applyConsent(value === 'granted');
    if (banner) banner.hidden = value === 'granted' || value === 'denied';
  });

  document.addEventListener('DOMContentLoaded', () => {
    banner = document.createElement('section');
    banner.className = 'ads-consent-banner';
    banner.setAttribute('role', 'region');
    banner.setAttribute('aria-labelledby', 'ads-consent-title');
    banner.setAttribute('aria-describedby', 'ads-consent-description');
    const currentConsent = readConsent();
    banner.hidden = currentConsent === 'granted' || currentConsent === 'denied';
    banner.innerHTML = `
      <div class="ads-consent-copy">
        <h2 class="ads-consent-title" id="ads-consent-title">Google Ads und Analytics</h2>
        <p id="ads-consent-description">Mit Ihrer Zustimmung verwenden wir Google Ads und Google Analytics, um Seitenaufrufe und erfolgreiche Anfragen zu messen. Ihre Auswahl können Sie jederzeit über „Cookie-Einstellungen“ ändern. <a href="datenschutz.html">Mehr zum Datenschutz</a>.</p>
      </div>
      <div class="ads-consent-actions">
        <button class="ads-consent-button" type="button" data-ads-consent="denied">Nur notwendige</button>
        <button class="ads-consent-button ads-consent-button--accept" type="button" data-ads-consent="granted">Google Ads und Analytics erlauben</button>
      </div>`;
    document.body.appendChild(banner);

    banner.querySelectorAll('[data-ads-consent]').forEach((button) => {
      button.addEventListener('click', () => {
        const granted = button.dataset.adsConsent === 'granted';
        saveConsent(granted ? 'granted' : 'denied');
        applyConsent(granted);
        banner.hidden = true;
      });
    });

    let settings = document.getElementById('open-cookie-settings');
    if (!settings) {
      settings = document.createElement('button');
      settings.type = 'button';
      settings.className = 'cookie-settings-button cookie-settings-button--floating';
      settings.textContent = 'Cookie-Einstellungen';
      document.body.appendChild(settings);
    }
    settings.addEventListener('click', () => { banner.hidden = false; });
  });
}());
