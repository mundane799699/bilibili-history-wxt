/**
 * 从 chrome.storage.local 获取值的异步函数
 * @param key 存储键名
 * @param defaultValue 当键不存在时返回的默认值
 * @returns 存储的值或默认值
 */
export async function getStorageValue<T>(
  key: string,
  defaultValue?: T
): Promise<T> {
  const result = await browser.storage.local.get(key);
  return (result[key] as T) ?? defaultValue!;
}

/**
 * 设置 chrome.storage.local 值的异步函数
 * @param key 存储键名
 * @param value 要存储的值
 */
export async function setStorageValue<T>(key: string, value: T): Promise<void> {
  await browser.storage.local.set({ [key]: value });
}
