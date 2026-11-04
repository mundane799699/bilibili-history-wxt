import { UPDATE_HISTORY } from "../utils/constants";

const UpdateHistory = () => {
  return (
    <div className="max-w-[800px] mx-auto p-6">
      <h1 className="mb-6 text-[26px] font-semibold tracking-[-0.02em] text-ink dark:text-night-text">
        更新日志
      </h1>
      <ul className="space-y-8">
        {UPDATE_HISTORY.map((release) => (
          <li key={release.version}>
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-bold">{release.version}</h2>
              <p className="text-ink-soft text-base">{release.date}</p>
            </div>
            <ul className="list-disc list-inside text-ink-soft space-y-2 text-base">
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
