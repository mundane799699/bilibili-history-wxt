export const WebdavTutorial = () => {
  return (
    <div className="container mx-auto p-6">
      <h1 className="mb-6 text-[26px] font-semibold tracking-[-0.02em] text-ink dark:text-night-text">
        WebDAV 配置教程
      </h1>
      <p className="text-sm mb-8">
        以坚果云为示例，参考教程：
        <a href="https://help.jianguoyun.com/?p=2064" target="_blank" rel="noopener noreferrer">
          https://help.jianguoyun.com/?p=2064
        </a>
      </p>
      <div>
        <p className="text-sm mb-2">配置示例图：</p>
        <img src="/example.png" alt="WebDAV 配置示例" className="w-full h-auto" />
      </div>
    </div>
  );
};
