import { useState, useEffect } from "react";
import { getAllLikedMusic } from "../../utils/db";
import { LikedMusic as LikedMusicType } from "../../utils/types";
import LikedMusicItem from "../../components/LikedMusicItem";

const LikedMusic = () => {
  const [likedMusic, setLikedMusic] = useState<LikedMusicType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadLikedMusic = async () => {
    try {
      setLoading(true);
      const musicList = await getAllLikedMusic();
      setLikedMusic(musicList);
    } catch (err) {
      console.error("加载喜欢音乐失败:", err);
      setError("加载喜欢音乐失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLikedMusic();
  }, []);

  const handleMusicRemoved = (bvid: string) => {
    setLikedMusic((prev) => prev.filter((music) => music.bvid !== bvid));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-gray-500">加载中...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-red-500">{error}</div>
      </div>
    );
  }

  return (
    <div className="">
      {/* 当前歌曲信息展示区域 */}
      <div className="flex items-center gap-4 sticky p-4 top-0 bg-white z-10 border-b border-gray-200">
        <h1 className="text-xl font-semibold text-gray-800">我喜欢的音乐</h1>
        <span className="text-sm text-gray-500">({likedMusic.length} 首)</span>
      </div>

      {/* 歌单列表 */}
      {likedMusic.length > 0 ? (
        <div className="mx-auto max-w-6xl p-4">
          <div className="space-y-4">
            {likedMusic.map((music) => (
              <LikedMusicItem
                key={music.bvid}
                music={music}
                onRemoved={() => handleMusicRemoved(music.bvid)}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center min-h-96">
          <div className="text-gray-500">暂无喜欢的音乐</div>
        </div>
      )}
    </div>
  );
};

export default LikedMusic;
