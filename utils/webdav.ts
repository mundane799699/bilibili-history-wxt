/**
 * WebDAV 客户端工具模块
 * 在扩展页面中直接使用 fetch 发起请求（利用 host_permissions 跨域特权）
 */

export interface WebDavConfig {
  /** WebDAV 服务器地址，例如 https://dav.example.com */
  serverUrl: string;
  /** 用户名 */
  username: string;
  /** 密码 */
  password: string;
  /** 远程存储路径，默认 /bilibili-history/ */
  basePath: string;
}

/**
 * 构造 Basic Auth 请求头
 */
const getAuthHeaders = (config: WebDavConfig): Record<string, string> => {
  const credentials = btoa(`${config.username}:${config.password}`);
  return {
    Authorization: `Basic ${credentials}`,
  };
};

/**
 * 拼接完整的 WebDAV URL
 */
const getFullUrl = (config: WebDavConfig, filename?: string): string => {
  let url = config.serverUrl.replace(/\/+$/, "");
  let path = config.basePath.replace(/\/+$/, "");
  if (!path.startsWith("/")) path = "/" + path;
  url = url + path;
  if (filename) {
    url = url + "/" + filename;
  }
  // 确保目录路径以 / 结尾
  if (!filename && !url.endsWith("/")) {
    url = url + "/";
  }
  return url;
};

/**
 * 测试 WebDAV 连接
 * @returns true 表示连接成功
 */
export const testConnection = async (config: WebDavConfig): Promise<boolean> => {
  try {
    const url = getFullUrl(config);
    const response = await fetch(url, {
      method: "PROPFIND",
      headers: {
        ...getAuthHeaders(config),
        Depth: "0",
      },
    });
    // 207 Multi-Status 表示成功
    // 404 表示路径不存在但连接正常（后续会自动创建）
    return response.status === 207 || response.status === 200 || response.status === 404;
  } catch (error) {
    console.error("WebDAV 连接测试失败:", error);
    return false;
  }
};

/**
 * 确保远程目录存在（MKCOL）
 */
export const ensureDirectory = async (config: WebDavConfig): Promise<boolean> => {
  try {
    const url = getFullUrl(config);
    const response = await fetch(url, {
      method: "MKCOL",
      headers: getAuthHeaders(config),
    });
    // 201 Created 或 405 Method Not Allowed（目录已存在）都表示成功
    return (
      response.status === 201 ||
      response.status === 405 ||
      response.status === 301 ||
      response.status === 200
    );
  } catch (error) {
    console.error("WebDAV 创建目录失败:", error);
    return false;
  }
};

/**
 * 上传文件到 WebDAV
 */
export const uploadFile = async (
  config: WebDavConfig,
  filename: string,
  data: string,
): Promise<boolean> => {
  try {
    const url = getFullUrl(config, filename);
    const response = await fetch(url, {
      method: "PUT",
      headers: {
        ...getAuthHeaders(config),
        "Content-Type": "application/json; charset=utf-8",
      },
      body: data,
    });
    // 201 Created 或 204 No Content 表示成功
    return response.status === 201 || response.status === 204 || response.status === 200;
  } catch (error) {
    console.error(`WebDAV 上传文件 ${filename} 失败:`, error);
    return false;
  }
};

/**
 * 从 WebDAV 下载文件
 * @returns 文件内容字符串，不存在则返回 null
 */
export const downloadFile = async (
  config: WebDavConfig,
  filename: string,
): Promise<string | null> => {
  try {
    const url = getFullUrl(config, filename);
    const response = await fetch(url, {
      method: "GET",
      headers: getAuthHeaders(config),
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      console.error(`WebDAV 下载文件 ${filename} 失败: HTTP ${response.status}`);
      return null;
    }

    return await response.text();
  } catch (error) {
    console.error(`WebDAV 下载文件 ${filename} 失败:`, error);
    return null;
  }
};
