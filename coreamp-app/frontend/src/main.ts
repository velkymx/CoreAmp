import { createApp, type App as VueApp } from "vue";
import { createPinia, type Pinia } from "pinia";
import VibeUI from "@velkymx/vibeui";
import App from "./App.vue";
import { useNotifyStore } from "./stores/notify";

// Bootstrap CSS is imported by us; Bootstrap JS is managed by VibeUI internally.
import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap-icons/font/bootstrap-icons.css";
import "@velkymx/vibeui/dist/style.css";

/**
 * Format an unknown thrown value into a short, user-facing string.
 * Includes the message (if any) and a stable error name; never
 * includes the stack (it's a development aid and would leak file
 * paths into the toast).
 */
function errorMessage(value: unknown): string {
  if (value instanceof Error) {
    const name = value.name || "Error";
    const message = value.message || String(value);
    return `${name}: ${message}`;
  }
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * Install global error handlers. Without these a component throw or
 * a rejected promise bubbles to the browser console with no UI
 * signal, so the user has no idea anything went wrong. The handlers
 * route through the notify store so the NotificationHost shows a
 * toast and the user can act.
 */
function installErrorHandlers(app: VueApp, pinia: Pinia): void {
  const notify = () => useNotifyStore(pinia);

  // Vue render + lifecycle throws. Vue passes (err, instance, info).
  app.config.errorHandler = (err) => {
    const message = errorMessage(err);
    // Avoid an infinite loop if the notify store itself throws.
    try {
      notify().error(message);
    } catch (notifyErr) {
      // eslint-disable-next-line no-console
      console.error("[errorHandler] notify() threw", notifyErr, "for", err);
    }
    // eslint-disable-next-line no-console
    console.error("[Vue errorHandler]", err);
  };

  // Async errors that escape every promise chain.
  window.addEventListener("unhandledrejection", (event) => {
    const message = errorMessage(event.reason);
    try {
      notify().error(`Unhandled rejection: ${message}`);
    } catch (notifyErr) {
      // eslint-disable-next-line no-console
      console.error(
        "[unhandledrejection] notify() threw",
        notifyErr,
        "for",
        event.reason,
      );
    }
    // eslint-disable-next-line no-console
    console.error("[unhandledrejection]", event.reason);
  });

  // Uncaught synchronous errors (window.onerror). Vue catches
  // component throws but a bug in a setTimeout callback or in a
  // non-Vue script would otherwise go to the console alone.
  window.addEventListener("error", (event) => {
    const message = event.message || errorMessage(event.error);
    try {
      notify().error(`Uncaught error: ${message}`);
    } catch (notifyErr) {
      // eslint-disable-next-line no-console
      console.error(
        "[window.error] notify() threw",
        notifyErr,
        "for",
        event.error,
      );
    }
    // eslint-disable-next-line no-console
    console.error("[window.error]", event.error ?? event.message);
  });
}

const app = createApp(App);
const pinia = createPinia();
app.use(pinia);
app.use(VibeUI);
installErrorHandlers(app, pinia);
app.mount("#app");
