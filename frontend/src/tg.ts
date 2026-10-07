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
