import React, { useState, useEffect, useRef } from "react";
import { Folder, Search, Loader2, KeyRound, Sparkles } from "lucide-react";
import { getAllHistory } from "../utils/db";
import { DASHSCOPE_API_KEY } from "../utils/constants";
import { getStorageValue, setStorageValue } from "../utils/storage";

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

  useEffect(() => {
    getStorageValue(DASHSCOPE_API_KEY, "").then((key) => {
      setApiKey(key as string);
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
                    setReasoning((prev) => prev + delta.reasoning_content);
                  }
                  
                  // 处理完整的回复
                  if (delta.content) {
                    setIsAnswering(true);
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

    } catch (err: any) {
      console.error("AI Search Error:", err);
      setErrorObj(err.message || "请求发生未知错误");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50 overflow-hidden">
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
          
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            <h2 className="text-lg font-medium text-gray-800 mb-4 flex items-center gap-2">
              🤔 你在找什么？
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
            <div className="space-y-4">
              {/* 思考过程卡片 */}
              {reasoning && (
                <div className="bg-blue-50/50 rounded-2xl border border-blue-100 overflow-hidden">
                  <div className="px-5 py-3 bg-blue-50/80 border-b border-blue-100 font-medium text-blue-800 flex items-center gap-2 text-sm">
                    {isAnswering ? '💡 思考完毕' : <><Loader2 className="w-3.5 h-3.5 animate-spin" /> 深度思考中...</>}
                  </div>
                  <div className="p-5 text-sm text-gray-600 font-serif leading-relaxed whitespace-pre-wrap">
                    {reasoning}
                  </div>
                </div>
              )}

              {/* 回复内容卡片 */}
              {(isAnswering || content) && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                  <div className="px-5 py-3 bg-indigo-50 border-b border-indigo-100 font-medium text-indigo-900 text-sm">
                    🎯 搜索结果
                  </div>
                  <div className="p-5 text-gray-800 text-[15px] leading-relaxed whitespace-pre-wrap">
                    {content}
                  </div>
                </div>
              )}

              {/* 错误提示卡片 */}
              {errorObj && (
                <div className="bg-red-50 rounded-2xl shadow-sm border border-red-200 overflow-hidden">
                  <div className="px-5 py-3 bg-red-100 border-b border-red-200 font-medium text-red-900 text-sm">
                    ❌ 搜索出错
                  </div>
                  <div className="p-5 text-red-800 text-[15px] leading-relaxed whitespace-pre-wrap">
                    {errorObj}
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default AISearch;
