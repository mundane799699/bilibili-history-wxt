import axios from "axios";

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_BASE_API,
});

apiClient.interceptors.response.use((res) => {
  const { data } = res;
  return data;
});

export default apiClient;
