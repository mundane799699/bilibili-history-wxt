const CloudSync = () => {
  const handleUpload = () => {
    // TODO: 实现上传数据到云端的逻辑
    console.log("上传数据到云端");
  };

  const handleDownload = () => {
    // TODO: 实现从云端获取数据的逻辑
    console.log("从云端获取数据");
  };

  return (
    <div className="max-w-[800px] mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">云同步</h1>
      <p className="text-gray-600 text-base mb-8">
        云同步是允许你将数据在浏览器插件和云端之间同步的功能。
      </p>

      <div className="flex flex-col sm:flex-row gap-4 justify-center">
        <button
          onClick={handleUpload}
          className="flex items-center justify-center gap-3 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shadow-md hover:shadow-lg transition-all duration-200 transform hover:scale-105 min-w-[200px]"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3-3m0 0l3 3m-3-3v12"
            />
          </svg>
          上传数据到云端
        </button>

        <button
          onClick={handleDownload}
          className="flex items-center justify-center gap-3 px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg shadow-md hover:shadow-lg transition-all duration-200 transform hover:scale-105 min-w-[200px]"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3 3m0 0l-3-3m3 3V8"
            />
          </svg>
          从云端获取数据
        </button>
      </div>

      <div className="mt-8 p-4 bg-gray-50 rounded-lg border border-gray-200">
        <h3 className="text-lg font-semibold mb-2 text-gray-800">使用说明</h3>
        <ul className="text-sm text-gray-600 space-y-1">
          <li>• 点击"上传数据到云端"将本地数据同步到云端服务器</li>
          <li>• 点击"从云端获取数据"将云端数据同步到浏览器插件</li>
        </ul>
      </div>
    </div>
  );
};

export default CloudSync;
