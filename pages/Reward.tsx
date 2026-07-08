// Fake data for now; update this list on each release
const REWARD_LIST: { name: string; amount: number; date: string; message?: string }[] = [
  { name: "苦乐都跟随", amount: 0.5, date: "2026-07-03", message: "b站无限历史插件很好用" },
  { name: "佚名", amount: 10, date: "2026-06-09" },
  { name: "十分钟的人生", amount: 10, date: "2026-05-30" },
  { name: "毛志伟", amount: 5, date: "2026-05-21", message: "非常不错，继续加油" },
  { name: "佚名", amount: 1, date: "2026-05-10" },
];

const Reward = () => {
  return (
    <div className="max-w-[800px] mx-auto p-6">
      <h2 className="text-3xl font-semibold mb-3">赞赏支持</h2>

      <section className="mt-10">
        <p className="text-center text-gray-600 dark:text-neutral-400 text-base mb-6">
          如果这个插件对你有帮助，欢迎扫码赞赏，感谢你的支持，这是我持续维护的动力。
        </p>
        <img src="/reward.jpg" alt="微信赞赏码" className="w-64 h-64 mx-auto object-contain" />
        <p className="text-center text-gray-600 dark:text-neutral-400 text-sm mt-4">
          使用微信扫一扫，对作者进行赞赏
        </p>
      </section>

      <section className="mt-12">
        <h2 className="text-3xl font-semibold mb-3">为什么要赞赏？</h2>
        <ol className="list-decimal list-outside pl-6 mt-4 space-y-3 text-base text-gray-600 dark:text-neutral-400">
          <li>
            目前我们主要使用 Claude
            Code、Codex等AI编程工具进行开发，这些都需要付费订阅，每个月都是不小的开销。
          </li>
          <li>插件完全免费，所有数据都存在你本地，我们不会通过你的数据获得任何收益。</li>
          <li>如果缺少赞赏，我们会逐渐失去持续更新和维护的动力，新功能和 Bug 修复都会变慢。</li>
          <li>你的每一次赞赏，都是对我们最直接的认可，也会让这个插件走得更远。</li>
        </ol>
      </section>

      <section className="mt-12">
        <h2 className="text-3xl font-semibold mb-3">赞赏名单</h2>
        <p className="text-gray-600 dark:text-neutral-400 text-base mb-4">
          赞赏后添加作者微信zflyoung(请备注赞赏支持）, 您的名字将在下个版本更新后出现在名单中
        </p>
        <ul className="divide-y divide-gray-200 dark:divide-neutral-700 border border-gray-200 dark:border-neutral-700 rounded-lg">
          {REWARD_LIST.map((item, index) => (
            <li key={index} className="flex items-center justify-between px-4 py-3">
              <div>
                <span className="font-medium text-base">{item.name}</span>
                {item.message && (
                  <p className="text-base text-gray-500 dark:text-neutral-400 mt-1">{item.message}</p>
                )}
              </div>
              <div className="text-right shrink-0 ml-4">
                <span className="text-orange-500 font-semibold text-base">¥{item.amount}</span>
                <p className="text-xs text-gray-400 dark:text-neutral-500 mt-1">{item.date}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
};

export default Reward;
