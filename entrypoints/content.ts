export default defineContentScript({
  matches: ["*://*.bilibili.com/*"],
  runAt: "document_start",
  async main() {
    console.log("hello content");

    // 监听来自injected script的window消息
    window.addEventListener("message", (event) => {
      // 确保消息来自同源
      if (event.origin !== window.location.origin) {
        return;
      }

      // 处理来自injected script的删除历史记录消息
      if (
        event.data.type === "DELETE_HISTORY_FROM_INJECT" &&
        event.data.action === "deleteHistoryItem"
      ) {
        // 转发消息给background
        browser.runtime.sendMessage({
          action: "deleteHistoryItem",
          id: event.data.id,
        });
      }
    });

    // 监听来自history页面的消息
    browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
      console.log("request", request);
      if (request.action === "deleteHistory") {
        deleteHistory(request.kid)
          .then(() => {
            sendResponse({ success: true });
          })
          .catch((error) => {
            console.error("删除历史记录失败:", error);
            sendResponse({ success: false, error: error.message });
          });
        return true; // 保持消息通道开放
      }
    });

    // 删除历史记录的函数
    async function deleteHistory(kid: string): Promise<void> {
      // 从background script获取cookie
      const cookies = await new Promise<Browser.cookies.Cookie[]>(
        (resolve, reject) => {
          browser.runtime.sendMessage({ action: "getCookies" }, (response) => {
            if (browser.runtime.lastError) {
              reject(browser.runtime.lastError);
              return;
            }
            if (response.success) {
              resolve(response.cookies);
            } else {
              reject(new Error(response.error));
            }
          });
        }
      );

      const bili_jct = cookies.find(
        (cookie) => cookie.name === "bili_jct"
      )?.value;
      const SESSDATA = cookies.find(
        (cookie) => cookie.name === "SESSDATA"
      )?.value;

      if (!bili_jct || !SESSDATA) {
        throw new Error("未找到必要的Cookie，请先登录B站");
      }

      const response = await fetch(
        "https://api.bilibili.com/x/v2/history/delete",
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Referer: "https://www.bilibili.com/",
            Origin: "https://www.bilibili.com",
          },
          body: `kid=${kid}&csrf=${bili_jct}`,
        }
      );

      if (!response.ok) {
        throw new Error("删除历史记录失败");
      }

      const data = await response.json();

      if (data.code !== 0) {
        throw new Error(data.message || "删除历史记录失败");
      }
    }

    await injectScript("/injected.js" as any, {
      keepInDom: true,
    });
  },
});
