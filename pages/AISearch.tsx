import React, { useState, useEffect, useRef } from "react";
import { Search, Loader2, KeyRound, Sparkles, Clock, Trash2, ChevronRight } from "lucide-react";
import { getAllHistory } from "../utils/db";
import { DASHSCOPE_API_KEY, AI_SEARCH_HISTORY } from "../utils/constants";
import { getStorageValue, setStorageValue } from "../utils/storage";

export interface AISearchRecord {
  id: string;
  query: string;
  reasoning: string;
  content: string;
  timestamp: number;
}

export const AISearch: React.FC = () => {
  const [apiKey, setApiKey] = useState("");
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
    getStorageValue(DASHSCOPE_API_KEY, "").then((key) => {
      setApiKey(key as string);
    });
    getStorageValue(AI_SEARCH_HISTORY, []).then((logs) => {
      setHistoryLogs(logs as AISearchRecord[]);
    });
  }, []);

  const saveApiKey = (val: string) => {
    setApiKey(val);
    setStorageValue(DASHSCOPE_API_KEY, val);
  };

  const startSearch = async () => {
    if (!apiKey) {
      alert("请先填写阿里云百炼 API Key");
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
      
      const historyTextStr = recentHistory.map(h => 
        `[${new Date(h.view_at * 1000).toLocaleString()}] ${h.title} (UP主: ${h.author_name}) - 链接: https://www.bilibili.com/video/${h.bvid}`
      ).join('\n');

      const systemPrompt = `你是一个深度的B站历史记录搜索助手。
用户因为忘记了具体的内容名字或者UP主名字，希望能用模糊的语义或零碎的回忆找到这段视频。
请你开启逻辑分析能力，去匹配以下用户最近看完的 ${recentHistory.length} 条历史记录。
给出你推导找到的准确视频（或者最接近的几个视频候选），带上它的完整标题、UP主名字和原样输出链接。如果没找到，就诚实地说没找到。

用户最近的历史记录如下：
${historyTextStr}
`;

      // 2. 调阿里云接口 SSE 流式读取
      const res = await fetch("https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Accept": "text/event-stream"
        },
        body: JSON.stringify({
          model: "qwen3.5-plus", 
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: query }
          ],
          stream: true,
          enable_thinking: true
        })
      });

      if (!res.ok) {
        throw new Error("HTTP " + res.status + ": " + (await res.text()));
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || ""; // 保留不完整的一行

          for (const line of lines) {
            const tLine = line.trim();
            if (tLine.startsWith("data:")) {
              const dataStr = tLine.slice(5).trim();
              if (dataStr === "[DONE]") continue;
              if (!dataStr) continue;

              try {
                const payload = JSON.parse(dataStr);
                const delta = payload.choices?.[0]?.delta;
                
                if (delta) {
                  // 处理思考过程
                  if (delta.reasoning_content) {
                    finalReasoning += delta.reasoning_content;
                    setReasoning((prev) => prev + delta.reasoning_content);
                  }
                  
                  // 处理完整的回复
                  if (delta.content) {
                    setIsAnswering(true);
                    finalContent += delta.content;
                    setContent((prev) => prev + delta.content);
                  }
                }
              } catch (e) {
                // Ignore parse errors on half-chunks
              }
            }
          }
        }
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
      const updated = prev.filter(log => log.id !== id);
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
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      
      {/* 侧边历史记录栏 */}
      <div className="w-64 bg-white border-r flex flex-col hidden md:flex flex-shrink-0 z-10">
        <div className="p-4 border-b flex items-center justify-between">
          <h2 className="text-[15px] font-bold flex items-center gap-2 text-gray-800">
            <Clock className="w-4 h-4 text-indigo-500" />
            探索历史
          </h2>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {historyLogs.length === 0 ? (
            <div className="text-center text-xs text-gray-400 mt-6">暂无搜索历史</div>
          ) : (
            historyLogs.map((log) => (
              <div 
                key={log.id}
                onClick={() => loadHistoryItem(log)}
                className="group p-3 rounded-xl hover:bg-gray-50 cursor-pointer transition-colors border border-transparent hover:border-gray-100 flex flex-col gap-1 relative"
              >
                <div className="text-sm font-medium text-gray-700 truncate pr-6 leading-tight">
                  {log.query}
                </div>
                <div className="text-[10px] text-gray-400">
                  {new Date(log.timestamp).toLocaleString()}
                </div>
                <button
                  onClick={(e) => deleteHistoryItem(e, log.id)}
                  className="absolute right-2 top-3 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-opacity p-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        <div className="bg-white border-b px-6 py-4 flex-shrink-0 flex items-center justify-between shadow-sm z-10">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-500" />
            AI 语义搜索
          </h1>
        
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 focus-within:ring-2 focus-within:ring-indigo-100 focus-within:border-indigo-400 focus-within:bg-white transition-all">
            <KeyRound className="w-4 h-4 text-gray-400 mr-2" />
            <input
              type="password"
              className="bg-transparent border-none focus:ring-0 text-sm w-48 p-0"
              placeholder="DashScope API Key"
              value={apiKey}
              onChange={(e) => saveApiKey(e.target.value)}
            />
          </div>
          <select 
            value={searchCount}
            onChange={(e) => setSearchCount(Number(e.target.value))}
            className="text-sm bg-gray-50 border border-gray-200 rounded-lg py-1.5 px-2 outline-none text-gray-600 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
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
          
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 relative">
            <h2 className="text-lg font-medium text-gray-800 mb-4 flex items-center justify-between">
              <span className="flex items-center gap-2">🤔 你在找什么？</span>
              {hasStarted && (
                <button 
                  onClick={clearCurrent}
                  className="text-xs text-gray-500 hover:text-indigo-500 flex items-center transition-colors"
                >
                  开启新探索 <ChevronRight className="w-3 h-3 ml-0.5" />
                </button>
              )}
            </h2>
            <div className="flex gap-3">
              <input
                type="text"
                className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 transition-all"
                placeholder="例如：那个讲量子力学把爱情解释得很搞笑的UP主..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && startSearch()}
              />
              <button
                onClick={startSearch}
                disabled={loading || !query}
                className="bg-indigo-500 hover:bg-indigo-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white px-6 py-3 rounded-xl font-medium flex items-center gap-2 transition-colors shadow-sm"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                {loading ? "搜索中" : "开始搜索"}
              </button>
            </div>
            {!apiKey && (
              <p className="text-xs text-red-500 mt-3 ml-1">
                * 首次使用请先在右上角配置阿里云百炼(DashScope) API Key 才能调用大模型。
              </p>
            )}
          </div>

        {hasStarted && (
            <div className="flex flex-col lg:flex-row gap-6 items-stretch w-full">
              
              {/* 左侧：思考过程卡片 */}
              {reasoning && (
                <div className="flex-1 bg-blue-50/50 rounded-2xl border border-blue-100 flex flex-col overflow-hidden min-h-[300px]">
                  <div className="px-5 py-3 bg-blue-50/80 border-b border-blue-100 font-medium text-blue-800 flex items-center justify-between gap-2 text-sm shrink-0">
                    <div className="flex items-center gap-2">
                      {isAnswering ? '💡 思考完毕' : <><Loader2 className="w-3.5 h-3.5 animate-spin" /> 深度思考中...</>}
                    </div>
                  </div>
                  <div className="p-5 text-sm text-gray-600 font-serif leading-relaxed whitespace-pre-wrap flex-1 overflow-y-auto max-h-[600px]">
                    {reasoning}
                  </div>
                </div>
              )}

              {/* 右侧：回复内容卡片 */}
              <div className="flex-1 flex flex-col gap-4">
                {(isAnswering || content) && (
                  <div className="bg-white rounded-2xl shadow-sm border border-gray-200 flex flex-col overflow-hidden min-h-[300px]">
                    <div className="px-5 py-3 bg-indigo-50 border-b border-indigo-100 font-medium text-indigo-900 text-sm shrink-0">
                      🎯 搜索结果
                    </div>
                    <div className="p-5 text-gray-800 text-[15px] leading-relaxed whitespace-pre-wrap flex-1 overflow-y-auto max-h-[600px]">
                      {content}
                    </div>
                  </div>
                )}

                {/* 错误提示卡片 */}
                {errorObj && (
                  <div className="bg-red-50 rounded-2xl shadow-sm border border-red-200 overflow-hidden shrink-0">
                    <div className="px-5 py-3 bg-red-100 border-b border-red-200 font-medium text-red-900 text-sm">
                      ❌ 搜索出错
                    </div>
                    <div className="p-5 text-red-800 text-[15px] leading-relaxed whitespace-pre-wrap">
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
    </div>
  );
};

export default AISearch;
