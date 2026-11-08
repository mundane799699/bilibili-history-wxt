/**
 * 消息路由：按 message.action 分发到各模块的处理函数。
 * 处理函数只需 return 响应或 throw 异常，异常在这里统一转换成 { success: false, error }。
 */
import { favoriteMessageHandlers } from "./favorites/handlers";
import { historyMessageHandlers } from "./history";
import { localBackupMessageHandlers } from "./localBackup";
import type { MessageHandlerMap } from "./shared/types";
import { getErrorMessage } from "./shared/utils";
import { subscribedCollectionMessageHandlers } from "./subscribedCollections";
import { videoBackupMessageHandlers } from "./videoBackup";

const HANDLERS: MessageHandlerMap = {
  ...historyMessageHandlers,
  ...favoriteMessageHandlers,
  ...subscribedCollectionMessageHandlers,
  ...localBackupMessageHandlers,
  ...videoBackupMessageHandlers,
};

export function registerMessageRouter(): void {
  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const action = (message as { action?: string } | undefined)?.action;
    const handler = action ? HANDLERS[action] : undefined;
    if (!handler) return; // 不认识的消息不响应，留给其他监听者

    handler(message).then(sendResponse, (error) => {
      console.error(`处理消息 ${action} 失败:`, error);
      sendResponse({ success: false, error: getErrorMessage(error) });
    });
    return true; // 异步响应，保持消息通道开放
  });
}
