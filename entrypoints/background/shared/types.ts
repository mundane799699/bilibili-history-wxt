/**
 * 后台消息处理函数：返回值会作为 sendResponse 的内容。
 * 抛出的异常由消息路由统一转换成 { success: false, error }。
 */
export type MessageHandler = (message: any) => Promise<unknown>;

/** action 名 → 处理函数 */
export type MessageHandlerMap = Record<string, MessageHandler>;

export type SyncMode = "full" | "incremental";

export const toSyncMode = (isFullSync: boolean): SyncMode => (isFullSync ? "full" : "incremental");

export const syncModeLabel = (isFullSync: boolean) => (isFullSync ? "全量" : "增量");
