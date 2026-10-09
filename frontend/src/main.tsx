import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import AdminSite from "./screens/admin/AdminSite";
import { boot, setBotUsername } from "./tg";
import { api } from "./api";
import MovedNotice from "./screens/MovedNotice";
import { Toaster } from "./ui";
import "./styles.css";

boot();
const isAdmin = window.location.pathname.startsWith("/admin");

function render(): void {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>{isAdmin ? <AdminSite /> : <App />}<Toaster /><MovedNotice /></StrictMode>,
  );
}

// learn the current bot first (links and the website sign-in use it); never wait more than 3 seconds
Promise.race([api.mode().then((m) => { if (m.bot_username) setBotUsername(m.bot_username); }),
              new Promise((resolve) => setTimeout(resolve, 3000))]).catch(() => {}).finally(render);
