import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import "./index.css";

async function start() {
  // Dev server only: ?mock stands in for Telegram (miniapp/test/telegram-mock.js). Removed from the built app.
  if (import.meta.env.DEV && new URLSearchParams(location.search).has("mock")) await import("../test/telegram-mock.js");
  createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
}
void start();
