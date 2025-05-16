export interface HistoryItem {
  bvid: string;
  title: string;
  cover: string;
  business: "archive" | "pgc" | "article" | "article-list" | "live";
  viewTime: number;
  id: string;
  author_name: string;
  author_mid: number;
}

export interface DBConfig {
  name: string;
  version: number;
  stores: {
    history: {
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
