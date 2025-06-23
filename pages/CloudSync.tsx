import { getUnUploadedHistory, markHistoryAsUploaded } from "@/utils/db";
import { uploadBatchHistory } from "@/services/history";
import { toast } from "react-hot-toast";
import { useState } from "react";
import { useUserStore } from "@/utils/store";
import { LoginModal } from "@/components/LoginModal";

const CloudSync = () => {
  const { userInfo } = useUserStore();
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [uploadInfo, setUploadInfo] = useState({
    isUploading: false,
    isOpen: false,
    totalCount: 0,
    successCount: 0,
    failedCount: 0,
    message: "",
  });

  const handleUpload = async () => {
    // 检查用户是否已登录
    if (!userInfo) {
      setShowLoginModal(true);
      return;
    }

    try {
      console.log("开始上传数据到云端");
      // 从indexeddb中获取uploaded不为true的数据
      const unUploadedData = await getUnUploadedHistory();
      console.log("获取到未上传的数据:", unUploadedData.length, "条");

      if (unUploadedData.length === 0) {
        console.log("没有需要上传的数据");
        toast.success("没有需要上传的数据");
        return;
      }

      // 初始化弹窗信息
      setUploadInfo({
        isUploading: true,
        totalCount: unUploadedData.length,
        isOpen: true,
        successCount: 0,
        failedCount: 0,
        message: "",
      });
      const batchSize = 100;
      let batch = [];
      // 分批上传
      for (let i = 0; i < unUploadedData.length; i++) {
        batch.push(unUploadedData[i]);
        if (batch.length === batchSize || i === unUploadedData.length - 1) {
          // 达到条件，上传该批次数据
          const result = (await uploadBatchHistory(batch)) as any;
          const { message, success } = result;
          if (success) {
            // 上传成功，标记为已上传
            await markHistoryAsUploaded(batch);
            setUploadInfo((prev) => ({
              ...prev,
              successCount: prev.successCount + batch.length,
            }));
          } else {
            setUploadInfo((prev) => ({
              ...prev,
              failedCount: prev.failedCount + batch.length,
            }));
            if (message === "目前免费用户最多可以上传500条历史记录") {
              setUploadInfo((prev) => ({
                ...prev,
                failedCount: prev.totalCount - prev.successCount,
                message: message,
              }));
              // 达到免费用户上传上限，不再上传，直接跳出循环
              break;
            }
          }
          // 清空批次
          batch = [];
        }
      }
    } catch (error) {
      console.error("上传数据失败:", error);
    } finally {
      setUploadInfo((prev) => ({
        ...prev,
        isUploading: false,
      }));
    }
  };

  const handleDownload = () => {
    // TODO: 实现从云端获取数据的逻辑
    console.log("从云端获取数据");
  };

  const handleViewCloudData = () => {
    const baseUrl =
      import.meta.env.VITE_BASE_API || "https://bilibilihistory.com";
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
      {uploadInfo.isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col">
            {/* 弹窗标题 */}
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
              <h2 className="text-xl font-semibold text-gray-800">
                数据上传进度
              </h2>
              {!uploadInfo.isUploading && (
                <button
                  onClick={() =>
                    setUploadInfo((prev) => ({
                      ...prev,
                      isOpen: false,
                    }))
                  }
                  className="text-gray-400 hover:text-gray-600 text-2xl"
                >
                  ×
                </button>
              )}
            </div>
            <div className="p-6 flex flex-col gap-2">
              <p>未上传记录数量：{uploadInfo.totalCount}条</p>
              <p className="text-green-500">
                上传成功：{uploadInfo.successCount}条
              </p>
              <p className="text-red-500">
                上传失败：{uploadInfo.failedCount}条
              </p>
              {uploadInfo.message && (
                <p className="text-red-500">{uploadInfo.message}</p>
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
