const UpdateHistory = () => {
  return (
    <div className="max-w-[800px] mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">更新日志</h1>
      <ul className="space-y-6">
        <li>
          <h2 className="text-lg font-bold">1.4.1</h2>
          <ul className="list-disc list-inside text-gray-600 space-y-2 text-base">
            <li>修复了1.4.0版本引入的视频跳转的bug</li>
          </ul>
        </li>
        <li>
          <h2 className="text-lg font-bold">1.4.0</h2>
          <ul className="list-disc list-inside text-gray-600 space-y-2 text-base">
            <li>修复了番剧和课堂的跳转</li>
            <li>侧边栏添加了更新日志和反馈</li>
          </ul>
        </li>
      </ul>
    </div>
  );
};

export default UpdateHistory;
