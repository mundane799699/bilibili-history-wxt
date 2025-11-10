import { HistoryItem as HistoryItemType } from "../utils/types";
import { getContentUrl } from "../utils/common";
import { Trash2 } from "lucide-react";
import { deleteHistoryItem } from "../utils/db";
import { getStorageValue } from "../utils/storage";
import { toast } from "react-hot-toast";
import { IS_SYNC_DELETE } from "../utils/constants";
import { getTypeTag } from "../utils/common";

interface HistoryItemProps {
  item: HistoryItemType;
  onDelete?: () => void;
}

const deleteBilibiliHistory = async (
  business: string,
  id: number
): Promise<void> => {
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

  const bili_jct = cookies.find((cookie) => cookie.name === "bili_jct")?.value;
  const SESSDATA = cookies.find((cookie) => cookie.name === "SESSDATA")?.value;

  if (!bili_jct || !SESSDATA) {
    throw new Error("未找到必要的Cookie,请先登录B站");
  }

  const kid = `${business}_${id}`;
  const response = await fetch("https://api.bilibili.com/x/v2/history/delete", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: `kid=${kid}&csrf=${bili_jct}`,
  });

  if (!response.ok) {
    console.error("删除历史记录失败:", response.statusText);
    return;
  }

  const data = await response.json();
  if (data.code !== 0) {
    console.error("删除历史记录失败:", data.message);
  }
};

export const HistoryItem: React.FC<HistoryItemProps> = ({ item, onDelete }) => {
  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    try {
      const isSyncDelete = await getStorageValue(IS_SYNC_DELETE, true);
      if (isSyncDelete) {
        // 先删除B站服务器上的历史记录
        await deleteBilibiliHistory(item.business, item.id);
        console.log("删除B站服务器上的历史记录成功");
      }
      // 删除本地数据库中的历史记录
      await deleteHistoryItem(item.id);
      onDelete?.();
    } catch (error) {
      console.error("删除历史记录失败:", error);
      toast.error(error instanceof Error ? error.message : "删除历史记录失败");
    }
  };

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <a
        href={getContentUrl(item)}
        target="_blank"
        rel="noopener noreferrer"
        className="no-underline text-inherit"
      >
        <div>
          <div className="relative">
            <img
              src={`${item.cover}@760w_428h_1c.avif`}
              alt={item.title}
              className="w-full h-40 object-cover"
            />
            {getTypeTag(item.business) !== "视频" && (
              <span className="absolute bottom-2 right-2 px-2 py-1 rounded text-xs text-white bg-[#fb7299]">
                {getTypeTag(item.business)}
              </span>
            )}
          </div>
          <div className="p-2.5">
            <div className="flex items-start justify-between gap-2">
              <h3 className="m-0 text-sm leading-[1.4] h-10 overflow-hidden line-clamp-2 flex-1">
                {item.title}
              </h3>
              <button
                className="p-1 hover:bg-gray-100 rounded-full transition-colors"
                onClick={handleDelete}
              >
                <Trash2 className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            <div className="flex justify-between items-center text-gray-500 text-xs mt-1">
              <span
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  window.open(
                    `https://space.bilibili.com/${item.author_mid}`,
                    "_blank"
                  );
                }}
                className="hover:text-[#fb7299] transition-colors cursor-pointer"
              >
                {item.author_name}
              </span>
              <span>{new Date(item.view_at * 1000).toLocaleString()}</span>
            </div>
          </div>
        </div>
      </a>
    </div>
  );
};
