import { Heart, Play, Pause, Loader2, Square } from "lucide-react";
import { SearchResultItem } from "../pages/music/SearchMusic";
import { useState, useRef, useEffect } from "react";
import { Howl } from "howler";

const SontItem = ({ item }: { item: SearchResultItem }) => {
  // 音频播放状态管理
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const howlRef = useRef<Howl | null>(null);

  // 组件卸载时清理音频资源
  useEffect(() => {
    return () => {
      if (howlRef.current) {
        howlRef.current.stop();
        howlRef.current.unload();
      }
    };
  }, []);

  const getCover = (item: SearchResultItem) => {
    let cover = "";
    switch (item.type) {
      case "video":
        cover = `https:${item.pic}@672w_378h_1c_!web-search-common-cover.avif`;
        break;
      case "ketang":
        cover = `${item.pic}@672w_378h_1c_!web-search-common-cover.avif`;
        break;
      default:
        cover = item.pic;
    }
    return cover;
  };

  // 格式化时间戳
  const formatDate = (timestamp: number): string => {
    if (timestamp === 0) return "";
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString("zh-CN");
  };

  // 清理HTML标签
  const cleanHtml = (html: string): string => {
    return html.replace(/<[^>]*>/g, "");
  };

  const handlePlay = async (item: SearchResultItem) => {
    try {
      setError(null);

      // 如果已经有音频实例且正在播放，则暂停
      if (isPlaying && howlRef.current) {
        howlRef.current.pause();
        setIsPlaying(false);
        return;
      }

      // 如果已经有音频实例但暂停了，则继续播放
      if (howlRef.current && !isPlaying) {
        howlRef.current.play();
        return;
      }

      // 如果没有音频实例，则创建新的
      setIsLoading(true);

      // https://api.bilibili.com/x/web-interface/view?bvid=BV1Za411A78m
      const response = await fetch(
        `https://api.bilibili.com/x/web-interface/view?bvid=${item.bvid}`
      );
      const { data, code, message } = await response.json();
      if (code !== 0) {
        throw new Error(message || "获取视频信息失败");
      }
      const { cid } = data;

      // https://api.bilibili.com/x/player/playurl?fnval=16&bvid=BV1ZL411i7YQ&cid=1141484127
      const response2 = await fetch(
        `https://api.bilibili.com/x/player/playurl?fnval=16&bvid=${item.bvid}&cid=${cid}`
      );
      const {
        data: data2,
        code: code2,
        message: message2,
      } = await response2.json();
      if (code2 !== 0) {
        throw new Error(message2 || "获取播放地址失败");
      }

      const { dash } = data2;
      if (!dash || !dash.audio || dash.audio.length === 0) {
        throw new Error("未找到音频流");
      }

      const url = getUpUrl(dash.audio[0]);
      // 音频URL: https://upos-sz-mirrorcos.bilivideo.com/upgcxcode/27/41/1141484127/1141484127_nb3-1-30232.m4s?e=ig8euxZM2rNcNbdlhoNvNC8BqJIzNbfqXBvEqxTEto8BTrNvN0GvT90W5JZMkX_YN0MvXg8gNEV4NC8xNEV4N03eN0B5tZlqNxTEto8BTrNvNeZVuJ10Kj_g2UB02J0mN0B5tZlqNCNEto8BTrNvNC7MTX502C8f2jmMQJ6mqF2fka1mqx6gqj0eN0B599M=&platform=pc&deadline=1757742372&os=cosbv&og=cos&trid=24f4d752005449a694e70e34a474887u&uipk=5&mid=3382088&oi=0x240884410c08bb3055767312c03672b6&nbs=1&gen=playurlv3&upsig=43553846d3b0a2d670779d40cc004c7d&uparams=e,platform,deadline,os,og,trid,uipk,mid,oi,nbs,gen&bvc=vod&nettype=0&bw=109960&dl=0&f=u_0_0&agrr=0&buvid=59B5EE85-AC62-367D-45DE-0FE215D3A8BF29152infoc&build=0&orderid=1,3
      console.log("音频URL:", url);

      // 创建新的Howl实例
      howlRef.current = new Howl({
        src: [url],
        format: ["m4a", "mp3"],
        html5: true, // 强制使用HTML5 Audio
        onload: () => {
          setIsLoading(false);
          console.log("音频加载完成");
        },
        onplay: () => {
          setIsPlaying(true);
          setIsLoading(false);
          console.log("开始播放");
        },
        onpause: () => {
          setIsPlaying(false);
          console.log("暂停播放");
        },
        onend: () => {
          setIsPlaying(false);
          setIsLoading(false);
          console.log("播放结束");
        },
        onplayerror: (id: any, error: any) => {
          console.error("播放错误:", error);
          setError("音频播放失败");
          setIsPlaying(false);
          setIsLoading(false);
        },
        onloaderror: (id: any, error: any) => {
          console.error("加载错误:", error);
          setError("音频加载失败");
          setIsPlaying(false);
          setIsLoading(false);
        },
      });

      // 播放音频
      howlRef.current.play();
    } catch (error) {
      console.error("播放失败:", error);
      setError(error instanceof Error ? error.message : "播放失败");
      setIsPlaying(false);
      setIsLoading(false);
    }
  };

  const handleStop = () => {
    if (howlRef.current) {
      howlRef.current.stop();
      howlRef.current.unload();
      howlRef.current = null;
    }
    setIsPlaying(false);
    setIsLoading(false);
    setError(null);
  };

  const getUpUrl = (obj: any) => {
    const url1 = obj.baseUrl || "";
    const url2 = obj.backup_url?.[0] || "";
    const url3 = obj.backup_url?.[1] || "";

    // 找到第一个不是https://xy 开头的url
    const urlList = [url1, url2, url3].filter(
      (url) => !url.startsWith("https://xy")
    );
    return urlList[0] || url1;
  };

  return (
    <div className="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow duration-300 overflow-hidden">
      <div className="flex gap-4 p-4 items-center">
        {/* 视频封面 */}
        <div className="flex-shrink-0 w-40 h-24 relative">
          <img
            src={getCover(item)}
            alt={cleanHtml(item.title)}
            className="w-full h-full object-cover rounded-lg"
          />
          <div className="absolute bottom-1 right-1 bg-black bg-opacity-70 text-white text-xs px-1 rounded">
            {item.duration}
          </div>
        </div>

        {/* 视频信息 */}
        <div className="flex-1 min-w-0">
          {/* 标题 */}
          <h3
            className="text-lg font-semibold text-gray-900 mb-2 truncate hover:text-pink-600 cursor-pointer"
            onClick={() => window.open(item.arcurl, "_blank")}
            dangerouslySetInnerHTML={{ __html: item.title }}
          />

          {/* UP主信息 */}
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm text-gray-600 hover:text-pink-600 cursor-pointer">
              {item.author}
            </span>
            <span className="text-xs text-gray-400">
              {formatDate(item.pubdate)}
            </span>
          </div>

          {/* 描述 */}
          <p className="text-sm text-gray-600 mb-3 truncate">
            {item.description}
          </p>

          {/* 错误提示 */}
          {error && (
            <div className="text-red-500 text-xs mb-2 flex items-center gap-1">
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* 操作按钮 */}
        <div className="flex items-center gap-2">
          <button
            className="p-2 hover:bg-gray-100 rounded-full transition-colors duration-200"
            onClick={handleStop}
            title="停止"
          >
            <Square size={20} />
          </button>
          <button
            className={`p-2 rounded-full transition-colors duration-200 ${
              isPlaying
                ? "bg-pink-500 text-white hover:bg-pink-600"
                : "hover:bg-gray-100"
            } ${isLoading ? "cursor-not-allowed" : "cursor-pointer"}`}
            onClick={() => handlePlay(item)}
            disabled={isLoading}
            title={isLoading ? "加载中..." : isPlaying ? "暂停" : "播放"}
          >
            {isLoading ? (
              <Loader2 size={20} className="animate-spin" />
            ) : isPlaying ? (
              <Pause size={20} />
            ) : (
              <Play size={20} />
            )}
          </button>
          <button className="p-2 hover:bg-gray-100 rounded-full transition-colors duration-200">
            <Heart size={20} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default SontItem;
