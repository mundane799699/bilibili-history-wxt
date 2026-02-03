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

