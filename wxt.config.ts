import { defineConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    permissions: ["storage", "tabs", "cookies", "alarms"],
    host_permissions: ["*://*.bilibili.com/*"],
  },
});
