import { getUnuploadedHistory, markHistoryAsUploaded } from "@/utils/db";
import { uploadBatchHistory } from "@/services/history";
import { toast } from "react-hot-toast";
import { useState } from "react";
import { useUserStore } from "@/utils/store";
import { LoginModal } from "@/components/LoginModal";

const CloudSync = () => {
  const { userInfo } = useUserStore();
  
  const [uploadModal, setUploadModal] = useState({
    isOpen: false,
    totalCount: 0,
    successCount: 0,
    failedCount: 0,
    currentBatch: 0,
    totalBatches: 0,
    isUploading: false,
    logs: [] as string[],
  });

  const [showLoginModal, setShowLoginModal] = useState(false);

  const handleUpload = async () => {
    // 检查用户是否已登录
    if (!userInfo) {
      setShowLoginModal(true);
      return;
    }

    try {
      console.log("开始上传数据到云端");
      // 从indexeddb中获取uploaded不为true的数据
      const unuploadedData = await getUnuploadedHistory();
      console.log("获取到未上传的数据:", unuploadedData.length, "条");

      if (unuploadedData.length === 0) {
        console.log("没有需要上传的数据");
        toast.success("没有需要上传的数据");
        return;
      }

      const batchSize = 100;
      const totalBatches = Math.ceil(unuploadedData.length / batchSize);

      // 初始化弹窗状态
      setUploadModal({
        isOpen: true,
        totalCount: unuploadedData.length,
        successCount: 0,
        failedCount: 0,
        currentBatch: 0,
        totalBatches,
        isUploading: true,
        logs: [
          `开始上传 ${unuploadedData.length} 条数据，共 ${totalBatches} 批`,
        ],
      });

      let batch = [];
      let successCount = 0;
      let failedCount = 0;
      let currentBatchIndex = 0;

      // 分批上传
      for (let i = 0; i < unuploadedData.length; i++) {
        batch.push(unuploadedData[i]);
        if (batch.length === batchSize || i === unuploadedData.length - 1) {
          currentBatchIndex++;
          const batchStartTime = new Date().toLocaleTimeString();

          // 更新当前批次信息
          setUploadModal((prev) => ({
            ...prev,
            currentBatch: currentBatchIndex,
            logs: [
              ...prev.logs,
              `正在上传第 ${currentBatchIndex} 批，共 ${batch.length} 条数据... (${batchStartTime})`,
            ],
          }));

          try {
            const result = (await uploadBatchHistory(batch)) as any;
            const { message, count, success } = result;
            const batchEndTime = new Date().toLocaleTimeString();

            if (success) {
              // 上传成功后，立即更新这批数据的uploaded状态
              try {
                await markHistoryAsUploaded(batch);
                successCount += count;
                setUploadModal((prev) => ({
                  ...prev,
                  successCount,
                  logs: [
                    ...prev.logs,
                    `✅ 第 ${currentBatchIndex} 批上传成功：${count} 条数据，已标记为已上传 (${batchEndTime})`,
                  ],
                }));
              } catch (dbError) {
                // 即使数据库更新失败，也要记录上传成功的数量
                successCount += count;
                setUploadModal((prev) => ({
                  ...prev,
                  successCount,
                  logs: [
                    ...prev.logs,
                    `⚠️ 第 ${currentBatchIndex} 批上传成功：${count} 条数据，但更新本地状态失败 (${batchEndTime})`,
                  ],
                }));
                console.error("更新本地数据库状态失败:", dbError);
              }
            } else {
              failedCount += batch.length;
              setUploadModal((prev) => ({
                ...prev,
                failedCount,
                logs: [
                  ...prev.logs,
                  `❌ 第 ${currentBatchIndex} 批上传失败：${batch.length} 条数据 - ${message} (${batchEndTime})`,
                ],
              }));
              console.error(`${batch.length}条数据上传失败`, message);
            }
          } catch (error) {
            failedCount += batch.length;
            const batchEndTime = new Date().toLocaleTimeString();
            setUploadModal((prev) => ({
              ...prev,
              failedCount,
              logs: [
                ...prev.logs,
                `❌ 第 ${currentBatchIndex} 批上传失败：${batch.length} 条数据 - ${error} (${batchEndTime})`,
              ],
            }));
            console.error(`${batch.length}条数据上传失败`, error);
          } finally {
            batch = [];
          }
        }
      }

      // 上传完成
      const completionTime = new Date().toLocaleTimeString();
      setUploadModal((prev) => ({
        ...prev,
        isUploading: false,
        logs: [
          ...prev.logs,
          `🎉 上传完成！成功：${successCount} 条，失败：${failedCount} 条 (${completionTime})`,
        ],
      }));

      if (successCount > 0) {
        toast.success(`成功上传 ${successCount} 条数据`);
      }
      if (failedCount > 0) {
        toast.error(`${failedCount} 条数据上传失败`);
      }
    } catch (error) {
      console.error("上传数据失败:", error);
      setUploadModal((prev) => ({
        ...prev,
        isUploading: false,
        logs: [...prev.logs, `❌ 上传过程出错：${error}`],
      }));
      toast.error("上传数据失败，请稍后重试");
    }
  };

  const handleDownload = () => {
    // TODO: 实现从云端获取数据的逻辑
    console.log("从云端获取数据");
  };

  const handleViewCloudData = () => {
    const baseUrl = import.meta.env.VITE_BASE_API || "https://bilibilihistory.com";
    window.open(`${baseUrl}/dashboard`, "_blank");
  };

  return (
    <div className="max-w-[800px] mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">云同步</h1>
      <p className="text-gray-600 text-base mb-2">
        云同步允许你将数据在浏览器插件和云端之间同步。
      </p>
      <p className="text-gray-600 text-base mb-8">
        该功能是付费功能，目前正在测试阶段，可免费上传500条。
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
          onClick={handleViewCloudData}
          className="flex items-center justify-center gap-3 px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg shadow-md hover:shadow-lg transition-all duration-200 transform hover:scale-105 min-w-[200px]"
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
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          查看云端数据
        </button>

        <button
          onClick={handleDownload}
          disabled
          className="disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-400 flex items-center justify-center gap-3 px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg shadow-md hover:shadow-lg transition-all duration-200 transform hover:scale-105 min-w-[200px]"
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
          从云端获取数据(待开发)
        </button>
      </div>

      <div className="mt-8 p-4 bg-gray-50 rounded-lg border border-gray-200">
        <h3 className="text-lg font-semibold mb-2 text-gray-800">使用说明</h3>
        <ul className="text-sm text-gray-600 space-y-1">
          <li>• 点击"上传数据到云端"将本地数据同步到云端服务器</li>
          <li>• 点击"查看云端数据"查看已同步到云端的数据</li>
          <li>• 点击"从云端获取数据"将云端数据同步到浏览器插件</li>
        </ul>
      </div>

      {/* 上传进度弹窗 */}
      {uploadModal.isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col">
            {/* 弹窗标题 */}
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
              <h2 className="text-xl font-semibold text-gray-800">
                数据上传进度
              </h2>
              {!uploadModal.isUploading && (
                <button
                  onClick={() =>
                    setUploadModal((prev) => ({ ...prev, isOpen: false }))
                  }
                  className="text-gray-400 hover:text-gray-600 text-2xl"
                >
                  ×
                </button>
              )}
            </div>

            {/* 进度信息 */}
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                <div className="bg-blue-50 p-3 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">
                    {uploadModal.totalCount}
                  </div>
                  <div className="text-sm text-gray-600">总数据量</div>
                </div>
                <div className="bg-green-50 p-3 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">
                    {uploadModal.successCount}
                  </div>
                  <div className="text-sm text-gray-600">成功上传</div>
                </div>
                <div className="bg-red-50 p-3 rounded-lg">
                  <div className="text-2xl font-bold text-red-600">
                    {uploadModal.failedCount}
                  </div>
                  <div className="text-sm text-gray-600">失败数量</div>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg">
                  <div className="text-2xl font-bold text-gray-600">
                    {uploadModal.currentBatch}/{uploadModal.totalBatches}
                  </div>
                  <div className="text-sm text-gray-600">批次进度</div>
                </div>
              </div>

              {/* 进度条 */}
              <div className="mt-4">
                <div className="flex justify-between text-sm text-gray-600 mb-1">
                  <span>总体进度</span>
                  <span>
                    {Math.round(
                      (uploadModal.currentBatch / uploadModal.totalBatches) *
                        100
                    )}
                    %
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{
                      width: `${
                        (uploadModal.currentBatch / uploadModal.totalBatches) *
                        100
                      }%`,
                    }}
                  ></div>
                </div>
              </div>
            </div>

            {/* 日志区域 */}
            <div className="flex-1 px-6 py-4 overflow-hidden flex flex-col">
              <h3 className="text-lg font-medium text-gray-800 mb-3">
                上传日志
              </h3>
              <div className="flex-1 bg-gray-50 rounded-lg p-4 overflow-y-auto">
                <div className="space-y-2">
                  {uploadModal.logs.map((log, index) => (
                    <div
                      key={index}
                      className={`text-sm p-2 rounded ${
                        log.includes("✅")
                          ? "bg-green-100 text-green-800"
                          : log.includes("❌")
                          ? "bg-red-100 text-red-800"
                          : log.includes("🎉")
                          ? "bg-blue-100 text-blue-800"
                          : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {log}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 底部按钮 */}
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end">
              {uploadModal.isUploading ? (
                <div className="flex items-center text-blue-600">
                  <svg
                    className="animate-spin -ml-1 mr-3 h-5 w-5 text-blue-600"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  正在上传中...
                </div>
              ) : (
                <button
                  onClick={() =>
                    setUploadModal((prev) => ({ ...prev, isOpen: false }))
                  }
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  关闭
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 登录提示弹窗 */}
      <LoginModal 
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
      />
    </div>
  );
};

export default CloudSync;
