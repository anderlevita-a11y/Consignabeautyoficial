/**
 * Cookie Consent Utility
 * Ensures scripts are only loaded after explicit user intent.
 */

type ConsentType = 'accepted' | 'rejected' | null;

export const getCookieConsent = (): ConsentType => {
  return localStorage.getItem('cookie-consent') as ConsentType;
};

export const hasAcceptedCookies = (): boolean => {
  return getCookieConsent() === 'accepted';
};

/**
 * Loads a script only if consent is given.
 * If consent is pending, it waits for the 'cookie-consent-updated' event.
 */
export const loadConditionalScript = (id: string, src: string, callback?: () => void) => {
  const checkAndLoad = () => {
    if (hasAcceptedCookies()) {
      if (document.getElementById(id)) return;

      const script = document.createElement('script');
      script.id = id;
      script.src = src;
      script.async = true;
      script.onload = () => {
        console.log(`Script loaded: ${id}`);
        if (callback) callback();
      };
      document.head.appendChild(script);
      return true;
    }
    return false;
  };

  // Try immediately
  if (checkAndLoad()) return;

  // Otherwise wait for the event
  const handleUpdate = () => {
    if (checkAndLoad()) {
      window.removeEventListener('cookie-consent-updated', handleUpdate);
    }
  };

  window.addEventListener('cookie-consent-updated', handleUpdate);
};

/**
 * Example usage for Google Analytics
 */
export const initAnalytics = (trackingId: string) => {
  loadConditionalScript('ga-script', `https://www.googletagmanager.com/gtag/js?id=${trackingId}`, () => {
    (window as any).dataLayer = (window as any).dataLayer || [];
    function gtag(...args: any[]) {
      (window as any).dataLayer.push(arguments);
    }
    (window as any).gtag = gtag;
    gtag('js', new Date());
    gtag('config', trackingId);
  });
};
