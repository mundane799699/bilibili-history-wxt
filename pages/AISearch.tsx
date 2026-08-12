import React, { useState, useEffect, useRef } from "react";
import {
  Search,
  Loader2,
  KeyRound,
  Sparkles,
  Clock,
  Trash2,
  ChevronRight,
  Eye,
  EyeOff,
  Settings2,
  X,
} from "lucide-react";
import { getAllHistory } from "../utils/db";
import {
  AI_SEARCH_HISTORY,
  DEFAULT_OPENAI_BASE_URL,
  OPENAI_API_KEY,
  OPENAI_BASE_URL,
  OPENAI_MODEL,
} from "../utils/constants";
import { getStorageValue, setStorageValue, setStorageValues } from "../utils/storage";

export interface AISearchRecord {
  id: string;
  query: string;
  reasoning: string;
  content: string;
  timestamp: number;
}

const getChatCompletionsUrl = (baseUrl: string): string => {
  const normalizedUrl = baseUrl.trim().replace(/\/+$/, "");
  return normalizedUrl.endsWith("/chat/completions")
    ? normalizedUrl
    : `${normalizedUrl}/chat/completions`;
};

export const AISearch: React.FC = () => {
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(DEFAULT_OPENAI_BASE_URL);
  const [model, setModel] = useState("");
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [draftApiKey, setDraftApiKey] = useState("");
  const [draftBaseUrl, setDraftBaseUrl] = useState(DEFAULT_OPENAI_BASE_URL);
  const [draftModel, setDraftModel] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);

  const [reasoning, setReasoning] = useState("");
  const [content, setContent] = useState("");
  const [isAnswering, setIsAnswering] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [errorObj, setErrorObj] = useState<string | null>(null);
  const [searchCount, setSearchCount] = useState(1000); // 默认搜最近1000条
  const [historyLogs, setHistoryLogs] = useState<AISearchRecord[]>([]);

  useEffect(() => {
    Promise.all([
      getStorageValue(OPENAI_API_KEY, ""),
      getStorageValue(OPENAI_BASE_URL, DEFAULT_OPENAI_BASE_URL),
      getStorageValue(OPENAI_MODEL, ""),
      getStorageValue(AI_SEARCH_HISTORY, [] as AISearchRecord[]),
    ]).then(([savedApiKey, savedBaseUrl, savedModel, logs]) => {
      setApiKey(savedApiKey);
      setBaseUrl(savedBaseUrl);
      setModel(savedModel);
      setHistoryLogs(logs);
    });
  }, []);

  const openConfig = () => {
    setDraftApiKey(apiKey);
    setDraftBaseUrl(baseUrl);
    setDraftModel(model);
    setShowApiKey(false);
    setIsConfigOpen(true);
  };

  const saveConfig = async () => {
    const nextApiKey = draftApiKey.trim();
    const nextBaseUrl = draftBaseUrl.trim().replace(/\/+$/, "");
    const nextModel = draftModel.trim();
    if (!nextApiKey || !nextBaseUrl || !nextModel) return;

    await setStorageValues({
      [OPENAI_API_KEY]: nextApiKey,
      [OPENAI_BASE_URL]: nextBaseUrl,
      [OPENAI_MODEL]: nextModel,
    });
    setApiKey(nextApiKey);
    setBaseUrl(nextBaseUrl);
    setModel(nextModel);
    setIsConfigOpen(false);
  };

  const startSearch = async () => {
    if (!apiKey || !baseUrl || !model) {
      openConfig();
      return;
    }
    if (!query.trim()) return;

    setLoading(true);
    setHasStarted(true);
    setReasoning("");
    setContent("");
    setIsAnswering(false);
    setErrorObj(null);

    let finalContent = "";
    let finalReasoning = "";

    try {
      // 1. 获取本地历史记录，使用限制条数防止阻塞 UI
      const recentHistory = await getAllHistory(searchCount);

      const historyTextStr = recentHistory
        .map(
          (h) =>
            `[${new Date(h.view_at * 1000).toLocaleString()}] ${h.title} (UP主: ${h.author_name}) - 链接: https://www.bilibili.com/video/${h.bvid}`,
        )
        .join("\n");

      const systemPrompt = `你是一个深度的B站历史记录搜索助手。
用户因为忘记了具体的内容名字或者UP主名字，希望能用模糊的语义或零碎的回忆找到这段视频。
请你开启逻辑分析能力，去匹配以下用户最近看完的 ${recentHistory.length} 条历史记录。
给出你推导找到的准确视频（或者最接近的几个视频候选），带上它的完整标题、UP主名字和原样输出链接。如果没找到，就诚实地说没找到。

用户最近的历史记录如下：
${historyTextStr}
`;

      // 2. 调 OpenAI 兼容接口，按 SSE 流式读取响应
      const res = await fetch(getChatCompletionsUrl(baseUrl), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: query },
          ],
          stream: true,
        }),
      });

      if (!res.ok) {
        throw new Error("HTTP " + res.status + ": " + (await res.text()));
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      const appendPayload = (payload: any) => {
        const choice = payload?.choices?.[0];
        const delta = choice?.delta;
        const message = choice?.message;
        const reasoningPart =
          delta?.reasoning_content ??
          delta?.reasoning ??
          message?.reasoning_content ??
          message?.reasoning;
        const contentPart = delta?.content ?? message?.content;
        if (typeof reasoningPart === "string") {
          finalReasoning += reasoningPart;
          setReasoning((prev) => prev + reasoningPart);
        }
        if (typeof contentPart === "string") {
          setIsAnswering(true);
          finalContent += contentPart;
          setContent((prev) => prev + contentPart);
        }
      };

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() || ""; // 保留不完整的一行

          for (const line of lines) {
            const tLine = line.trim();
            if (tLine.startsWith("data:")) {
              const dataStr = tLine.slice(5).trim();
              if (dataStr === "[DONE]") continue;
              if (!dataStr) continue;

              try {
                const payload = JSON.parse(dataStr);
                appendPayload(payload);
              } catch (e) {
                // Ignore parse errors on half-chunks
              }
            }
          }
        }
        buffer += decoder.decode();
        const trailingLine = buffer.trim();
        if (trailingLine.startsWith("data:")) {
          const dataStr = trailingLine.slice(5).trim();
          if (dataStr && dataStr !== "[DONE]") appendPayload(JSON.parse(dataStr));
        } else if (trailingLine.startsWith("{")) {
          appendPayload(JSON.parse(trailingLine));
        }
      } else {
        const payload = await res.json();
        appendPayload(payload);
      }

      if (finalContent) {
        const newRecord: AISearchRecord = {
          id: Date.now().toString(),
          query: query,
          reasoning: finalReasoning,
          content: finalContent,
          timestamp: Date.now(),
        };
        setHistoryLogs((prev) => {
          const updated = [newRecord, ...prev].slice(0, 50); // 最多保存50条
          setStorageValue(AI_SEARCH_HISTORY, updated);
          return updated;
        });
      }
    } catch (err: any) {
      console.error("AI Search Error:", err);
      setErrorObj(err.message || "请求发生未知错误");
    } finally {
      setLoading(false);
    }
  };

  const loadHistoryItem = (item: AISearchRecord) => {
    setQuery(item.query);
    setReasoning(item.reasoning);
    setContent(item.content);
    setIsAnswering(true);
    setHasStarted(true);
    setErrorObj(null);
  };

  const deleteHistoryItem = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setHistoryLogs((prev) => {
      const updated = prev.filter((log) => log.id !== id);
      setStorageValue(AI_SEARCH_HISTORY, updated);
      return updated;
    });
  };

  const clearCurrent = () => {
    setQuery("");
    setHasStarted(false);
    setReasoning("");
    setContent("");
    setErrorObj(null);
  };

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-[#0a0a0a] overflow-hidden">
      {/* 侧边历史记录栏 */}
      <div className="w-64 bg-white dark:bg-neutral-900 border-r border-gray-200 dark:border-neutral-800 flex flex-col hidden md:flex flex-shrink-0 z-10">
        <div className="p-4 border-b border-gray-200 dark:border-neutral-800 flex items-center justify-between">
          <h2 className="text-[15px] font-bold flex items-center gap-2 text-gray-800 dark:text-neutral-100">
            <Clock className="w-4 h-4 text-indigo-500" />
            探索历史
          </h2>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {historyLogs.length === 0 ? (
            <div className="text-center text-xs text-gray-400 dark:text-neutral-500 mt-6">
              暂无搜索历史
            </div>
          ) : (
            historyLogs.map((log) => (
              <div
                key={log.id}
                onClick={() => loadHistoryItem(log)}
                className="group p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-neutral-800 cursor-pointer transition-colors border border-transparent hover:border-gray-100 dark:hover:border-neutral-700 flex flex-col gap-1 relative"
              >
                <div className="text-sm font-medium text-gray-700 dark:text-neutral-200 truncate pr-6 leading-tight">
                  {log.query}
                </div>
                <div className="text-[10px] text-gray-400 dark:text-neutral-500">
                  {new Date(log.timestamp).toLocaleString()}
                </div>
                <button
                  onClick={(e) => deleteHistoryItem(e, log.id)}
                  className="absolute right-2 top-3 opacity-0 group-hover:opacity-100 text-gray-400 dark:text-neutral-500 hover:text-red-500 dark:hover:text-red-400 transition-opacity p-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        <div className="bg-white dark:bg-[#0a0a0a] border-b border-gray-200 dark:border-neutral-800 px-6 py-4 flex-shrink-0 flex items-center justify-between shadow-sm z-10">
          <h1 className="text-xl font-bold flex items-center gap-2 text-gray-900 dark:text-neutral-100">
            <Sparkles className="w-5 h-5 text-indigo-500" />
            AI 语义搜索
          </h1>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={openConfig}
              className="inline-flex h-9 max-w-52 items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm font-medium text-gray-700 transition-colors hover:border-indigo-300 hover:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:border-indigo-500 dark:hover:bg-neutral-800 dark:focus:ring-indigo-500/20"
              title="配置 OpenAI 兼容接口"
            >
              <Settings2 className="h-4 w-4 shrink-0 text-indigo-500" />
              <span className="truncate">{model || "配置模型"}</span>
            </button>
            <select
              value={searchCount}
              onChange={(e) => setSearchCount(Number(e.target.value))}
              className="text-sm bg-gray-50 dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-lg py-1.5 px-2 outline-none text-gray-600 dark:text-neutral-200 focus:border-indigo-400 dark:focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-500/20"
            >
              <option value={500}>最近 500 条</option>
              <option value={1000}>最近 1000 条</option>
              <option value={3000}>最近 3000 条</option>
              <option value={5000}>最近 5000 条</option>
            </select>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center">
          <div className="w-full max-w-4xl flex flex-col gap-6">
            <div className="bg-white dark:bg-neutral-900 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-neutral-800 relative">
              <h2 className="text-lg font-medium text-gray-800 dark:text-neutral-100 mb-4 flex items-center justify-between">
                <span className="flex items-center gap-2">🤔 你在找什么？</span>
                {hasStarted && (
                  <button
                    onClick={clearCurrent}
                    className="text-xs text-gray-500 dark:text-neutral-400 hover:text-indigo-500 dark:hover:text-indigo-400 flex items-center transition-colors"
                  >
                    开启新探索 <ChevronRight className="w-3 h-3 ml-0.5" />
                  </button>
                )}
              </h2>
              <div className="flex gap-3">
                <input
                  type="text"
                  className="flex-1 bg-gray-50 dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 rounded-xl px-4 py-3 text-sm text-gray-700 dark:text-neutral-100 placeholder-gray-400 dark:placeholder-neutral-500 focus:bg-white dark:focus:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-500/20 focus:border-indigo-400 dark:focus:border-indigo-500 transition-all"
                  placeholder="例如：那个讲量子力学把爱情解释得很搞笑的UP主..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && startSearch()}
                />
                <button
                  onClick={startSearch}
                  disabled={loading || !query}
                  className="bg-indigo-500 hover:bg-indigo-600 disabled:bg-gray-300 dark:disabled:bg-neutral-700 disabled:cursor-not-allowed disabled:text-white dark:disabled:text-neutral-400 text-white px-6 py-3 rounded-xl font-medium flex items-center gap-2 transition-colors shadow-sm"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Search className="w-4 h-4" />
                  )}
                  {loading ? "搜索中" : "开始搜索"}
                </button>
              </div>
              {(!apiKey || !baseUrl || !model) && (
                <p className="text-xs text-red-500 dark:text-red-400 mt-3 ml-1">
                  * 首次使用请先在右上角配置 OpenAI 兼容接口。
                </p>
              )}
            </div>

            {hasStarted && (
              <div className="flex flex-col lg:flex-row gap-6 items-stretch w-full">
                {/* 左侧：思考过程卡片 */}
                {reasoning && (
                  <div className="flex-1 bg-blue-50/50 dark:bg-blue-500/5 rounded-2xl border border-blue-100 dark:border-blue-500/20 flex flex-col overflow-hidden min-h-[300px]">
                    <div className="px-5 py-3 bg-blue-50/80 dark:bg-blue-500/10 border-b border-blue-100 dark:border-blue-500/20 font-medium text-blue-800 dark:text-blue-300 flex items-center justify-between gap-2 text-sm shrink-0">
                      <div className="flex items-center gap-2">
                        {isAnswering ? (
                          "💡 思考完毕"
                        ) : (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" /> 深度思考中...
                          </>
                        )}
                      </div>
                    </div>
                    <div className="p-5 text-sm text-gray-600 dark:text-neutral-300 font-serif leading-relaxed whitespace-pre-wrap flex-1 overflow-y-auto max-h-[600px]">
                      {reasoning}
                    </div>
                  </div>
                )}

                {/* 右侧：回复内容卡片 */}
                <div className="flex-1 flex flex-col gap-4">
                  {(isAnswering || content) && (
                    <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-sm border border-gray-200 dark:border-neutral-800 flex flex-col overflow-hidden min-h-[300px]">
                      <div className="px-5 py-3 bg-indigo-50 dark:bg-indigo-500/10 border-b border-indigo-100 dark:border-indigo-500/20 font-medium text-indigo-900 dark:text-indigo-300 text-sm shrink-0">
                        🎯 搜索结果
                      </div>
                      <div className="p-5 text-gray-800 dark:text-neutral-100 text-[15px] leading-relaxed whitespace-pre-wrap flex-1 overflow-y-auto max-h-[600px]">
                        {content}
                      </div>
                    </div>
                  )}

                  {/* 错误提示卡片 */}
                  {errorObj && (
                    <div className="bg-red-50 dark:bg-red-500/5 rounded-2xl shadow-sm border border-red-200 dark:border-red-500/20 overflow-hidden shrink-0">
                      <div className="px-5 py-3 bg-red-100 dark:bg-red-500/10 border-b border-red-200 dark:border-red-500/20 font-medium text-red-900 dark:text-red-300 text-sm">
                        ❌ 搜索出错
                      </div>
                      <div className="p-5 text-red-800 dark:text-red-200 text-[15px] leading-relaxed whitespace-pre-wrap">
                        {errorObj}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {isConfigOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsConfigOpen(false);
          }}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void saveConfig();
            }}
            className="relative w-full max-w-lg rounded-lg border border-gray-200 bg-white p-6 shadow-xl dark:border-neutral-800 dark:bg-neutral-900"
          >
            <button
              type="button"
              onClick={() => setIsConfigOpen(false)}
              className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
              aria-label="关闭模型配置"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="flex items-center gap-3 pr-10">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400">
                <Settings2 className="h-5 w-5" />
              </div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-neutral-100">
                OpenAI 兼容配置
              </h2>
            </div>

            <div className="mt-6 space-y-4">
              <label className="block">
                <span className="text-sm font-medium text-gray-700 dark:text-neutral-300">
                  Base URL
                </span>
                <input
                  type="url"
                  required
                  value={draftBaseUrl}
                  onChange={(event) => setDraftBaseUrl(event.target.value)}
                  placeholder={DEFAULT_OPENAI_BASE_URL}
                  className="mt-2 h-11 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm text-gray-800 outline-none transition-colors focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:focus:border-indigo-500 dark:focus:bg-neutral-800 dark:focus:ring-indigo-500/20"
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-gray-700 dark:text-neutral-300">
                  API Key
                </span>
                <span className="relative mt-2 block">
                  <KeyRound className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-gray-400 dark:text-neutral-500" />
                  <input
                    type={showApiKey ? "text" : "password"}
                    required
                    value={draftApiKey}
                    onChange={(event) => setDraftApiKey(event.target.value)}
                    autoComplete="off"
                    className="h-11 w-full rounded-lg border border-gray-200 bg-gray-50 pl-10 pr-11 text-sm text-gray-800 outline-none transition-colors focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:focus:border-indigo-500 dark:focus:bg-neutral-800 dark:focus:ring-indigo-500/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey((visible) => !visible)}
                    className="absolute right-1.5 top-1.5 inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-neutral-500 dark:hover:bg-neutral-700 dark:hover:text-neutral-200"
                    aria-label={showApiKey ? "隐藏 API Key" : "显示 API Key"}
                  >
                    {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </span>
              </label>

              <label className="block">
                <span className="text-sm font-medium text-gray-700 dark:text-neutral-300">
                  模型
                </span>
                <input
                  type="text"
                  required
                  value={draftModel}
                  onChange={(event) => setDraftModel(event.target.value)}
                  placeholder="例如 gpt-4.1-mini"
                  autoComplete="off"
                  className="mt-2 h-11 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm text-gray-800 outline-none transition-colors focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:focus:border-indigo-500 dark:focus:bg-neutral-800 dark:focus:ring-indigo-500/20"
                />
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-3 border-t border-gray-100 pt-5 dark:border-neutral-800">
              <button
                type="button"
                onClick={() => setIsConfigOpen(false)}
                className="h-10 rounded-lg border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={!draftApiKey.trim() || !draftBaseUrl.trim() || !draftModel.trim()}
                className="h-10 rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-300 dark:bg-indigo-500 dark:hover:bg-indigo-600 dark:disabled:bg-indigo-500/40"
              >
                保存
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default AISearch;
