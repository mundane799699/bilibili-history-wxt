export default defineUnlistedScript(() => {
  console.log("Hello from injected.ts");

  const setupFetchInterceptor = () => {
    const originalFetch = window.fetch;
    window.fetch = function (...args) {
      console.log("fetch", args);
      return originalFetch(...args);
    };
  };
  setupFetchInterceptor();
});
