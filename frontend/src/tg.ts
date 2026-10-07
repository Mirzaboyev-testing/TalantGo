// Thin wrapper over window.Telegram.WebApp. Outside Telegram every call is a harmless no-op.

type Haptic = "light" | "medium" | "heavy";
interface WebApp {
  initData: string;
  colorScheme: "light" | "dark";
  ready(): void;
  expand(): void;
  openLink(url: string): void;
  openTelegramLink(url: string): void;
  showAlert(message: string): void;
  showConfirm(message: string, callback: (ok: boolean) => void): void;
  requestContact?(callback: (shared: boolean) => void): void;
  isVersionAtLeast?(version: string): boolean;
  HapticFeedback?: {
    impactOccurred(style: Haptic): void;
    notificationOccurred(type: "success" | "error" | "warning"): void;
  };
  BackButton: { show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void };
}

declare global {
  interface Window {
    Telegram?: { WebApp: WebApp };
  }
}

const app: WebApp | undefined = window.Telegram?.WebApp;

export const insideTelegram = Boolean(app?.initData);
export const initData = app?.initData ?? "";
export const BOT_URL = "https://t.me/create_carieer_bot";

export function boot(): void {
  app?.ready();
  app?.expand();
}

export function openLink(url: string): void {
  if (url.startsWith("https://t.me/")) {
    if (app?.openTelegramLink && insideTelegram) return app.openTelegramLink(url);
  } else if (app?.openLink && insideTelegram) {
    return app.openLink(url);
  }
  window.open(url, "_blank", "noopener");
}

export function haptic(kind: "success" | "error" | Haptic): void {
  const h = app?.HapticFeedback;
  if (!h) return;
  if (kind === "success" || kind === "error") h.notificationOccurred(kind);
  else h.impactOccurred(kind);
}

export function backButton(handler: (() => void) | null): () => void {
  if (!app || !insideTelegram || !handler) return () => {};
  app.BackButton.onClick(handler);
  app.BackButton.show();
  return () => {
    app.BackButton.offClick(handler);
    app.BackButton.hide();
  };
}

/** Telegram's own confirm dialog; window.confirm is unreliable inside some Telegram clients. */
export function ask(question: string): Promise<boolean> {
  if (app && insideTelegram) return new Promise((resolve) => app.showConfirm(question, resolve));
  return Promise.resolve(window.confirm(question));
}

/** Telegram can share the user's own phone number with the bot (Bot API 6.9+). The number then
 *  arrives at the server through the bot, so it is confirmed by Telegram, not typed by hand. */
export const canShareContact = Boolean(app && insideTelegram && app.requestContact && app.isVersionAtLeast?.("6.9"));

export function shareContact(): Promise<boolean> {
  if (!canShareContact) return Promise.resolve(false);
  return new Promise((resolve) => app!.requestContact!(resolve));
}
