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
        <p>赞赏后添加作者微信zflyoung(请备注赞赏支持）, 您的名字将在下个版本更新后出现在名单中</p>
      </section>
    </div>
  );
};

export default Reward;
