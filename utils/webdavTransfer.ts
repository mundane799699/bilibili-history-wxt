/**
 * WebDAV 自动同步的增量传输：记录每个远端文件的指纹和内容哈希，
 * 远端没变就不下载，本地内容和远端一致就不上传，避免每次同步都全量传输。
 */

import { WEBDAV_TRANSFER_STATE } from "./constants";
import { getStorageValue, setStorageValue } from "./storage";
import { WebDavConfig, downloadFile, listRemoteFiles, uploadFile } from "./webdav";

interface TransferFileState {
  /** 远端文件指纹（ETag 或修改时间 + 大小），未知时为 null */
  fingerprint: string | null;
  /** 远端文件内容的 SHA-256（不含 updatedAt 这类每次都变的字段） */
  hash: string;
  /** 远端文件包含的记录数，用于发现本地数据丢失 */
  count: number;
}

interface TransferState {
  /** 服务器 + 路径 + 用户名，配置变化后旧记录作废 */
  scope: string;
  files: Record<string, TransferFileState>;
}

/** 从文件数据中提取参与比较的内容和记录数 */
export type TransferDigest = (data: any) => { content: string; count: number };

export const digestArray: TransferDigest = (data: unknown[]) => ({
  content: JSON.stringify(data),
  count: data.length,
});

export const digestHistoryV2: TransferDigest = (data: {
  events?: unknown[];
  tombstones?: unknown[];
}) => ({
  content: JSON.stringify({ events: data.events ?? [], tombstones: data.tombstones ?? [] }),
  count: data.events?.length ?? 0,
});

const sha256Hex = async (text: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

export const createWebDavTransferSession = async (config: WebDavConfig) => {
  const scope = `${config.serverUrl}|${config.basePath}|${config.username}`;
  const saved = await getStorageValue<TransferState | null>(WEBDAV_TRANSFER_STATE, null);
  const state: TransferState = saved?.scope === scope ? saved : { scope, files: {} };
  // null 表示服务器不支持 PROPFIND，此时每次都下载，行为与旧版一致
  const remoteFiles = await listRemoteFiles(config);
  const uploadedFiles: string[] = [];
  const stats = { downloaded: 0, skippedDownloads: 0, uploaded: 0, skippedUploads: 0 };

  /**
   * 远端文件有变化时下载并合并到本地。
   * 本地记录数少于上次同步时（数据被清空或被浏览器回收），即使远端没变也重新下载合并，
   * 防止随后把残缺的本地数据覆盖到远端。
   */
  const pull = async (
    file: string,
    options: {
      digest: TransferDigest;
      getLocalCount: () => Promise<number>;
      merge: (data: any) => Promise<unknown>;
    },
  ): Promise<void> => {
    const fingerprint = remoteFiles?.get(file);
    if (remoteFiles && fingerprint === undefined) {
      delete state.files[file];
      return;
    }

    const known = state.files[file];
    if (
      known?.fingerprint &&
      known.fingerprint === fingerprint &&
      (await options.getLocalCount()) >= known.count
    ) {
      stats.skippedDownloads += 1;
      return;
    }

    const text = await downloadFile(config, file);
    if (text === null) {
      delete state.files[file];
      return;
    }
    const data = JSON.parse(text);
    await options.merge(data);
    const { content, count } = options.digest(data);
    state.files[file] = { fingerprint: fingerprint || null, hash: await sha256Hex(content), count };
    stats.downloaded += 1;
  };

  /** 本地内容与远端一致时跳过上传 */
  const push = async (
    file: string,
    data: unknown,
    options: { digest: TransferDigest; body?: string },
  ): Promise<void> => {
    const { content, count } = options.digest(data);
    const hash = await sha256Hex(content);
    if (state.files[file]?.hash === hash) {
      stats.skippedUploads += 1;
      return;
    }

    if (!(await uploadFile(config, file, options.body ?? JSON.stringify(data)))) {
      throw new Error(`WebDAV 上传 ${file} 失败`);
    }
    state.files[file] = { fingerprint: null, hash, count };
    uploadedFiles.push(file);
    stats.uploaded += 1;
  };

  /** 记录刚上传文件的新指纹并保存状态；同步中途失败时也要调用，已完成的部分仍然有效 */
  const finish = async (): Promise<void> => {
    if (uploadedFiles.length > 0) {
      const latest = await listRemoteFiles(config);
      for (const file of uploadedFiles) {
        state.files[file].fingerprint = latest?.get(file) || null;
      }
    }
    await setStorageValue(WEBDAV_TRANSFER_STATE, state);
  };

  return { pull, push, finish, stats };
};
