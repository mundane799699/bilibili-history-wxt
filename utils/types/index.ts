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
