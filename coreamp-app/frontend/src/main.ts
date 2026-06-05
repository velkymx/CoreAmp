import { createApp } from "vue";
import { createPinia } from "pinia";
import VibeUI from "@velkymx/vibeui";
import App from "./App.vue";

// Bootstrap CSS is imported by us; Bootstrap JS is managed by VibeUI internally.
import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap-icons/font/bootstrap-icons.css";
import "@velkymx/vibeui/dist/style.css";

createApp(App).use(createPinia()).use(VibeUI).mount("#app");
