export default defineUnlistedScript(() => {
  const setupFetchInterceptor = () => {
    const originalFetch = window.fetch;
    window.fetch = function (input, init) {
      if (typeof input === "string" && input.includes("api.bilibili.com/x/v2/history/delete")) {
        // kid=live_30877795&csrf=52dc2e27c3b379951a62796e3f3e824f
        // 提取body中的数字
        if (init?.body && typeof init.body === "string") {
          const match = init.body.match(/kid=\w+_(\d+)/);
          if (match) {
            const idString = match[1];
            const id = Number(idString); // 转换为数字类型
            // 使用window.postMessage发送消息给content script
            window.postMessage(
              {
                type: "DELETE_HISTORY_FROM_INJECT",
                action: "deleteHistoryItem",
                id: id,
              },
              "*",
            );
          }
        }
      }
      return originalFetch(input, init);
    };
  };
  setupFetchInterceptor();
});
