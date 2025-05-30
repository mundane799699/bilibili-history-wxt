export interface HistoryItem {
  bvid: string;
  title: string;
  cover: string;
  business: "archive" | "pgc" | "article" | "article-list" | "live" | "cheese";
  viewTime: number;
  id: string;
  cid?: string;
  author_name: string;
  author_mid: number;
  uri?: string;
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
