import axios from "axios";

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_BASE_API,
  // 插件页面属于 chrome-extension:// 源，访问官网接口是跨域请求。
  // 不显式开启 withCredentials 时浏览器不会带上会话 cookie，
  // 导致 getSession 永远返回 null（表现为插件一直显示「未登录」）。
  withCredentials: true,
});

apiClient.interceptors.response.use((res) => {
  const { data } = res;
  return data;
});

export default apiClient;
