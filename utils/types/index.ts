export interface HistoryItem {
  bvid: string;
  title: string;
  cover: string;
  tag_name?: string;
  business: "archive" | "pgc" | "article" | "article-list" | "live" | "cheese";
  view_at: number;
  id: number;
  cid?: string;
  author_name: string;
  author_mid: number;
  uri?: string;
  uploaded?: boolean;
  progress?: number;
  duration?: number;
  is_fav?: boolean;
}

export interface LikedMusic {
  bvid: string;
  title: string;
  author: string;
  mid: number;
  pic: string;
  added_at: number;
}

export interface DBConfig {
  name: string;
  version: number;
  stores: {
    history: {
      keyPath: string;
      indexes: string[];
    };
    likedMusic: {
      keyPath: string;
      indexes: string[];
    };
    favFolders: {
      keyPath: string;
      indexes: string[];
    };
    favResources: {
      keyPath: string;
      indexes: string[];
    };
    subscribedCollections: {
      keyPath: string;
      indexes: string[];
    };
    subscribedCollectionResources: {
      keyPath: string;
      indexes: string[];
    };
  };
}

export interface SyncResponse {
  code: number;
  message: string;
  data: {
    list: HistoryItem[];
    has_more: boolean;
  };
}

export interface SyncHistoryRequest {
  action: "syncHistory";
  isFullSync: boolean;
}

export type SyncHistoryResponse =
  { success: true; message: string } | { success: false; error: string };

export type LocalHistoryBackupErrorCode =
  | "NOT_ENABLED"
  | "NO_DIRECTORY"
  | "PERMISSION_REQUIRED"
  | "EMPTY_HISTORY_ANOMALY"
  | "READ_FAILED"
  | "WRITE_FAILED";

export interface LocalHistoryBackupRequest {
  action: "runLocalHistoryBackup";
  allowEmpty?: boolean;
}

export interface LocalHistoryBackupResult {
  success: boolean;
  fileName?: string;
  recordCount?: number;
  completedAt?: number;
  cleanupWarning?: string;
  errorCode?: LocalHistoryBackupErrorCode;
  error?: string;
}

export interface SyncFavoriteFolderRequest {
  action: "syncFavoriteFolder";
  folderId: number;
  isFullSync: boolean;
}

export type SyncFavoriteFolderResponse =
  | {
      success: true;
      message: string;
      folderId: number;
      mode: "incremental" | "full";
    }
  | { success: false; error: string };

export interface RefreshFavoriteFoldersRequest {
  action: "refreshFavoriteFolders";
}

export type RefreshFavoriteFoldersResponse =
  { success: true; folderCount: number } | { success: false; error: string };

export interface FavoriteFolder {
  id: number;
  fid: number;
  mid: number;
  attr: number;
  title: string;
  fav_state: number;
  media_count: number;
  index: number; // API返回的顺序
}

export interface FavoriteResource {
  id: number; // 收藏夹内的资源ID
  type: number;
  title: string;
  cover: string;
  intro: string;
  duration: number;
  upper: {
    mid: number;
    name: string;
    face: string;
  };
  cnt_info: {
    collect: number;
    play: number;
    danmaku: number;
  };
  link: string;
  ctime: number;
  pubtime: number;
  fav_time: number;
  bv_id: string; // 有时候是 bvid
  bvid: string;
  folder_id: number; // 关联的收藏夹ID
  index: number; // 在收藏夹中的顺序
}

export interface SubscribedCollection {
  id: number;
  mid: number;
  title: string;
  cover: string;
  intro: string;
  ctime: number;
  mtime: number;
  media_count: number;
  upper: {
    mid: number;
    name: string;
    face: string;
  };
  index: number;
}

export interface SubscribedCollectionResource {
  id: string;
  collection_id: number;
  aid: number;
  bvid: string;
  title: string;
  cover: string;
  duration: number;
  author_name: string;
  author_mid: number;
  pubdate: number;
  index: number;
}
