export {};

declare global {
  interface Window {
    __ariaBootstrapReady?: boolean;
    __ariaInteractionsCleanup?: () => void;
    __ariaSplashSeen?: boolean;
    __ariaSplashActive?: boolean;
    __ariaCustomCursorReady?: boolean;
  }
}
