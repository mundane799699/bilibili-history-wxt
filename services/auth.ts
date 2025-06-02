import apiClient from "@/utils/apiClient";

export const getSession = async () => {
  const response = await apiClient.get("/api/auth/get-session");
  return response;
};
