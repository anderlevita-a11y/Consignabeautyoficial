/**
 * BackHandler Service
 * Provides Android / React Native-like hardware back button interception
 * for Web and Progressive Web Applications (PWA).
 * 
 * Prevents accidental app closure when user presses physical Back button or performs back gesture.
 */

export type BackPressHandler = () => boolean | void;

class BackHandlerService {
  private handlers: BackPressHandler[] = [];
  private isInitialized = false;
  private isExiting = false;
  private exitTimeout: ReturnType<typeof setTimeout> | null = null;
  private exitSubscribers: Set<(isPrompting: boolean) => void> = new Set();
  private isEnabled = true;

  constructor() {
    if (typeof window !== 'undefined') {
      // Delay slightly to ensure browser initial history is ready
      setTimeout(() => this.init(), 100);
    }
  }

  public init() {
    if (this.isInitialized || typeof window === 'undefined') return;
    this.isInitialized = true;

    // Ensure we have a trap entry in history so popstate fires before leaving the app
    this.pushTrapState();

    window.addEventListener('popstate', this.handlePopState);

    // Also guard against accidental page unload if needed
    window.addEventListener('pagehide', () => {
      this.resetExitPrompt();
    });
  }

  public setEnabled(enabled: boolean) {
    this.isEnabled = enabled;
  }

  public getIsEnabled(): boolean {
    return this.isEnabled;
  }

  private pushTrapState() {
    try {
      const currentState = window.history.state;
      if (!currentState || !currentState.__consigna_back_guard) {
        window.history.pushState(
          { __consigna_back_guard: true, timestamp: Date.now() },
          '',
          window.location.href
        );
      }
    } catch (e) {
      console.warn('[BackHandler] pushState error:', e);
    }
  }

  private handlePopState = (event: PopStateEvent) => {
    if (!this.isEnabled) return;

    // Call registered back press handlers in LIFO order (last registered first)
    for (let i = this.handlers.length - 1; i >= 0; i--) {
      try {
        const handler = this.handlers[i];
        if (typeof handler === 'function') {
          const handled = handler();
          if (handled === true) {
            // The back press was consumed by a modal, drawer, or sub-view!
            // Re-arm history trap to catch future back presses
            this.pushTrapState();
            this.resetExitPrompt();
            return;
          }
        }
      } catch (err) {
        console.error('[BackHandler] Error in back press handler:', err);
      }
    }

    // If no custom handler consumed the back press:
    // Check if exit prompt is already active (double press to exit)
    if (this.isExiting) {
      // User pressed back again within the exit window -> allow exit!
      this.resetExitPrompt();
      this.exitApp();
      return;
    }

    // First back press at root level with no open modals:
    // Re-push trap state immediately to prevent browser from leaving
    this.pushTrapState();

    // Trigger double-press exit prompt (toast / banner)
    this.triggerExitPrompt();
  };

  /**
   * Registers a back press handler.
   * If the handler returns `true`, the event is considered handled.
   * If it returns `false` or void, the next handler in the stack is checked.
   */
  public addEventListener(eventName: 'hardwareBackPress', handler: BackPressHandler) {
    if (eventName === 'hardwareBackPress' && typeof handler === 'function') {
      this.handlers.push(handler);
    }
    return {
      remove: () => this.removeEventListener(eventName, handler)
    };
  }

  public removeEventListener(eventName: 'hardwareBackPress', handler: BackPressHandler) {
    if (eventName === 'hardwareBackPress') {
      const index = this.handlers.lastIndexOf(handler);
      if (index !== -1) {
        this.handlers.splice(index, 1);
      }
    }
  }

  private triggerExitPrompt() {
    this.isExiting = true;
    this.notifyExitSubscribers(true);

    if (this.exitTimeout) {
      clearTimeout(this.exitTimeout);
    }

    // 2.5 seconds window to press back again to exit
    this.exitTimeout = setTimeout(() => {
      this.resetExitPrompt();
    }, 2500);
  }

  public resetExitPrompt() {
    this.isExiting = false;
    if (this.exitTimeout) {
      clearTimeout(this.exitTimeout);
      this.exitTimeout = null;
    }
    this.notifyExitSubscribers(false);
  }

  public subscribeExitPrompt(callback: (isPrompting: boolean) => void) {
    this.exitSubscribers.add(callback);
    // Initial call
    callback(this.isExiting);
    return () => {
      this.exitSubscribers.delete(callback);
    };
  }

  private notifyExitSubscribers(isPrompting: boolean) {
    this.exitSubscribers.forEach(cb => {
      try {
        cb(isPrompting);
      } catch (err) {
        console.error('[BackHandler] Error in exit subscriber:', err);
      }
    });
  }

  public isExitPromptActive(): boolean {
    return this.isExiting;
  }

  public exitApp() {
    this.resetExitPrompt();

    // In native webviews / Android PWAs:
    try {
      // If running inside Android WebView with JavascriptInterface
      if ((window as any).AndroidApp && typeof (window as any).AndroidApp.closeApp === 'function') {
        (window as any).AndroidApp.closeApp();
        return;
      }
    } catch {}

    try {
      // Try closing the tab/window (works in popups or standalone PWAs on some platforms)
      window.close();
    } catch {}

    // Fallback: Navigate back in real history
    try {
      // Move back beyond the guard state
      window.removeEventListener('popstate', this.handlePopState);
      window.history.go(-2);
    } catch {
      // If history.go fails, navigate to blank or let default happen
      window.location.replace('about:blank');
    }
  }
}

export const BackHandler = new BackHandlerService();
