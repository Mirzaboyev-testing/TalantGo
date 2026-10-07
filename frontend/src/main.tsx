import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import Admin from "./screens/Admin";
import { boot } from "./tg";
import "./styles.css";

boot();
const isAdmin = window.location.pathname.startsWith("/admin");

createRoot(document.getElementById("root")!).render(
  <StrictMode>{isAdmin ? <Admin /> : <App />}</StrictMode>,
);
