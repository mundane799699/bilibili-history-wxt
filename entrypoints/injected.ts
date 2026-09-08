export default defineUnlistedScript(() => {
  const setupFetchInterceptor = () => {
    const originalFetch = window.fetch;
    window.fetch = async function (input, init) {
      const isHistoryDelete =
        typeof input === "string" && input.includes("api.bilibili.com/x/v2/history/delete");
      const targets: { business: string; id: number }[] = [];
      if (isHistoryDelete && init?.body && typeof init.body === "string") {
        const params = new URLSearchParams(init.body);
        const kid = params.get("kid") || "";
        for (const target of kid.split(",")) {
          const match = target.match(/^([a-z-]+)_(\d+)$/i);
          if (!match) continue;
          const business = match[1];
          const id = Number(match[2]);
          if (!Number.isSafeInteger(id) || id <= 0) continue;
          targets.push({ business, id });
        }
      }

      const response = await originalFetch.call(window, input, init);
      if (isHistoryDelete && response.ok && targets.length > 0) {
        void response
          .clone()
          .json()
          .then((data) => {
            if (data?.code !== 0) return;
            targets.forEach(({ business, id }) => {
              window.postMessage(
                {
                  type: "DELETE_HISTORY_FROM_INJECT",
                  action: "deleteHistoryItem",
                  business,
                  id,
                },
                "*",
              );
            });
          })
          .catch(() => undefined);
      }
      return response;
    };
  };
  setupFetchInterceptor();
});
