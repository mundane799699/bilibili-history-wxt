import { UPDATE_HISTORY } from "../utils/constants";

const Feedback = () => {
  return (
    <div className="max-w-[800px] mx-auto p-6">
      <section>
        <h2 className="text-3xl font-semibold mb-3">建议反馈</h2>
        <a
          className="text-blue-500 hover:underline text-base"
          href="https://c1p0xw7om7n.feishu.cn/share/base/form/shrcneS0t8RdC3byY9xC5ftQgub"
          target="_blank"
        >
          点击这里反馈建议
        </a>
      </section>

      <section className="mt-6">
        <h2 className="text-xl font-semibold mb-3">交流群</h2>
        <img src="/qrcode.jpg" alt="交流群" className="w-48 h-48 mx-auto" />
        <p className="text-center text-gray-600 text-sm mt-2">
          添加我们的微信，备注“Bilibili 无限历史记录”, 拉你进群。
        </p>
        <p className="text-center text-gray-600 text-sm mt-2">
          有任何建议和反馈都可以在群里提出, 反馈更迅速。
        </p>
      </section>

      <section className="mt-10">
        <h2 className="text-3xl font-bold mb-6">更新日志</h2>
        <ul className="space-y-8">
          {UPDATE_HISTORY.map((release) => (
            <li key={release.version}>
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-bold">{release.version}</h2>
                <p className="text-gray-600 text-base">{release.date}</p>
              </div>
              <ul className="list-disc list-inside text-gray-600 space-y-2 text-base">
                {release.changes.map((change, index) => (
                  <li key={index}>{change}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
};

export default Feedback;
