import { WebDavSyncKey } from "@/utils/constants";
import {
  getAllHistory,
  getAllLikedMusic,
  getAllFavFolders,
  getAllFavResources,
  getAllSubscribedCollections,
  getAllSubscribedCollectionResources,
  smartMergeHistory,
  smartMergeLikedMusic,
  smartMergeFavResources,
  importFavFolders,
  importSubscribedCollections,
  smartMergeSubscribedCollectionResources,
} from "@/utils/db";
import { FavoriteFolder, SubscribedCollection } from "@/utils/types";

/** Per-dataset definition: remote file name, label, local reader, and remote-merge strategy */
export interface DataItemDef {
  key: WebDavSyncKey;
  label: string;
  file: string;
  getAll: () => Promise<unknown[]>;
  merge: (items: any[]) => Promise<{ merged: number; skipped: number }>;
}

export const DATA_ITEMS: DataItemDef[] = [
  {
    key: "history",
    label: "历史记录",
    file: "history.json",
    getAll: getAllHistory,
    merge: smartMergeHistory,
  },
  {
    key: "likedMusic",
    label: "喜欢的音乐",
    file: "likedMusic.json",
    getAll: getAllLikedMusic,
    merge: smartMergeLikedMusic,
  },
  {
    key: "favFolders",
    label: "收藏夹",
    file: "favFolders.json",
    getAll: getAllFavFolders,
    // Folders are upserted directly without timestamp comparison
    merge: async (items: FavoriteFolder[]) => {
      await importFavFolders(items);
      return { merged: items.length, skipped: 0 };
    },
  },
  {
    key: "favResources",
    label: "收藏资源",
    file: "favResources.json",
    getAll: getAllFavResources,
    merge: smartMergeFavResources,
  },
  {
    key: "subscribedCollections",
    label: "订阅合集",
    file: "subscribedCollections.json",
    getAll: getAllSubscribedCollections,
    merge: async (items: SubscribedCollection[]) => {
      await importSubscribedCollections(items);
      return { merged: items.length, skipped: 0 };
    },
  },
  {
    key: "subscribedCollectionResources",
    label: "合集视频",
    file: "subscribedCollectionResources.json",
    getAll: getAllSubscribedCollectionResources,
    merge: smartMergeSubscribedCollectionResources,
  },
];
