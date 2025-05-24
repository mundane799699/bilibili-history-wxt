const OpenSource = () => {
  return (
    <div className="max-w-[800px] mx-auto p-6">
      <p className="text-lg mb-2">
        欢迎各位开发者贡献代码，让这个插件变得更好用。
      </p>
      <p className="text-lg mb-6 text-amber-600">
        贡献突出者可以获得付费功能的免费使用权限。付费功能我在后续版本中会开发，比如数据云同步、AI加持等。
      </p>
      <p className="text-lg mb-6">目前积压的需求有很多，比如：</p>
      <ul className="list-disc pl-5 mb-6 text-base">
        <li>支持b站收藏的保存</li>
        <li>标签功能</li>
        <li>在b站删除历史记录后，同步删除插件历史记录</li>
        <li>webdav同步</li>
        <li>重命名功能</li>
        <li>支持分页</li>
      </ul>
      <p className="text-lg mb-6">
        具体需求可以在github项目地址加我微信具体沟通。
      </p>
      <p className="text-lg mb-6">
        因为我本人时间有限，但是又不想让这个项目的更新停滞，所以将代码开源。
      </p>
      <p className="text-lg mb-6">开源地址：</p>
      <p className="text-lg mb-6">
        <a
          className="text-blue-500"
          href="https://github.com/mundane799699/bilibili-history-wxt"
          target="_blank"
          rel="noopener noreferrer"
        >
          https://github.com/mundane799699/bilibili-history-wxt
        </a>
      </p>
    </div>
  );
};

export default OpenSource;
