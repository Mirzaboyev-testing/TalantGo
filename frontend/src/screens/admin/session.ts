import { setAdminToken } from "../../api";

// The admin website keeps its 12-hour session across page reloads. Storage can be blocked
// (private mode, policies), in which case the session simply lasts until the tab closes.
const KEY = "cf_admin_token";

export function saveToken(token: string): void {
  setAdminToken(token);
  try { localStorage.setItem(KEY, token); } catch { /* storage unavailable */ }
}

export function loadToken(): string {
  try { return localStorage.getItem(KEY) ?? ""; } catch { return ""; }
}

export function clearToken(): void {
  setAdminToken("");
  try { localStorage.removeItem(KEY); } catch { /* storage unavailable */ }
}
