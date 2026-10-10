/**
 * Leaving the console for another page (the identity provider's logout).
 * An object so tests can replace it: jsdom cannot navigate.
 */
export const browser = {
  assign(url: string): void {
    window.location.assign(url);
  },
};
