const Feedback = () => {
  return (
    <div className="max-w-[800px] mx-auto p-6">
      <section>
        <h2 className="text-xl font-semibold mb-3">建议反馈</h2>
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
    </div>
  );
};

export default Feedback;
