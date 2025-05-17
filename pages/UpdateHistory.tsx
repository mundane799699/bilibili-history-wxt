import { UPDATE_HISTORY } from "../utils/constants";

const UpdateHistory = () => {
  return (
    <div className="max-w-[800px] mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">更新日志</h1>
      <ul className="space-y-6">
        {UPDATE_HISTORY.map((release) => (
          <li key={release.version}>
            <h2 className="text-lg font-bold">{release.version}</h2>
            <ul className="list-disc list-inside text-gray-600 space-y-2 text-base">
              {release.changes.map((change, index) => (
                <li key={index}>{change}</li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default UpdateHistory;
