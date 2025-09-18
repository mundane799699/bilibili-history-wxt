import { defineConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "Bilibili 无限历史记录",
    description: "不限制数量的保存你的bilibili历史记录",
    permissions: [
      "storage",
      "tabs",
      "cookies",
      "alarms",
      "declarativeNetRequest",
    ],
    declarative_net_request: {
      rule_resources: [
        {
          id: "referrer-bilibili",
          enabled: true,
          path: "referrer.json",
        },
      ],
    },
    host_permissions: [
      "*://*.bilibili.com/*",
      "*://*.bilivideo.com/*",
      "*://*.bilivideo.cn/*",
      "*://*.bilibilihistory.com/*",
      "*://*.ahdohpiechei.com/*",
      "http://localhost:3001/*",
    ],
    web_accessible_resources: [
      {
        resources: ["injected.js"],
        matches: ["*://*.bilibili.com/*"],
      },
    ],
  },
});
