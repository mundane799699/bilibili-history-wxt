import { defineConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "Bilibili 无限历史记录",
    description: "不限制数量的保存你的bilibili历史记录",
    permissions: ["storage", "tabs", "cookies", "alarms"],
    host_permissions: [
      "*://*.bilibili.com/*",
      "*://*.bilibilihistory.com/*",
      "http://localhost:3001/*",
    ],
  },
});
