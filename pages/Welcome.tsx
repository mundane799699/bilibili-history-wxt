import { useNavigate } from "react-router-dom";
import { UPDATE_HISTORY } from "../utils/constants";

const Welcome = () => {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center min-h-[80vh] bg-white p-6 rounded-xl shadow-sm m-4 max-w-[800px] mx-auto">
      <h1 className="mb-2 text-[30px] font-semibold tracking-[-0.03em] text-ink dark:text-night-text">
        欢迎使用 Bilibili History
      </h1>

      <button
        onClick={() => navigate("/")}
        className="px-10 py-3 bg-brand text-white rounded-xl font-semibold shadow-lg hover:shadow-xl hover:bg-brand-strong transform hover:-translate-y-0.5 transition-all duration-200 active:translate-y-0 active:shadow-md mb-12"
      >
        进入首页
      </button>

      {/* About Page Content */}
      <div className="w-full border-t border-line pt-10">
        <div className="space-y-8 text-left">
          <section>
            <h2 className="text-xl font-semibold mb-3 text-ink">官网</h2>
            <a
              href="https://bilibilihistory.com"
              target="_blank"
              className="text-brand font-semibold text-lg transition-all duration-200 hover:text-brand"
            >
              bilibilihistory.com
            </a>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3 text-ink">简介</h2>
            <div className="text-ink-soft text-base space-y-4">
              <p>
                由于b站本身的历史记录有存储上限，而我希望可以查看更久远的历史记录，所以开发了这个扩展。
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3 text-ink">功能特点</h2>
            <ul className="list-disc list-inside text-ink-soft space-y-2 text-base">
              <li>突破 Bilibili 历史记录的数量限制</li>
              <li>支持按时间排序浏览历史记录</li>
              <li>支持搜索历史记录</li>
              <li>每隔1分钟自动增量的同步一次历史记录</li>
              <li>所有数据都存储在本地indexedDB</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3 text-ink">使用说明</h2>
            <ol className="list-decimal list-inside text-ink-soft space-y-2 text-base">
              <li>登录b站网页版</li>
              <li>安装扩展后，点击扩展图标</li>
              <li>首次点击立即同步按钮会全量同步你的 Bilibili 观看历史</li>
              <li>同步完成后，点击打开历史记录页面按钮，即可查看历史记录</li>
              <li>可以使用搜索框搜索特定的历史记录</li>
              <li>向下滚动可以加载更多历史记录</li>
            </ol>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3 text-ink">隐私说明</h2>
            <p className="text-ink-soft text-base">
              本扩展仅用于同步和展示你的 Bilibili
              观看历史，所有数据都存储在本地，不会上传到任何服务器。
              我们不会收集任何个人信息或浏览数据。
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3 text-ink">开源说明</h2>
            <p className="text-ink-soft text-base">
              本项目代码已开源，欢迎各位开发者贡献代码，让这个插件变得更好用。
            </p>
            <p className="text-ink-soft text-base mt-2">开源地址：</p>
            <p className="text-lg mb-6 break-all">
              <a
                className="text-brand hover:text-brand-strong"
                href="https://github.com/mundane799699/bilibili-history-wxt"
                target="_blank"
                rel="noopener noreferrer"
              >
                https://github.com/mundane799699/bilibili-history-wxt
              </a>
            </p>
            <p className="text-lg mb-6 text-amber-600 bg-amber-50 p-4 rounded-lg border border-amber-100">
              贡献突出者可以获得付费功能的免费使用权限。付费功能我在后续版本中会开发，比如数据云同步、AI加持等。
            </p>
            <p className="text-ink-soft text-base">目前积压的需求有很多，比如：</p>
            <ul className="list-disc pl-5 mb-6 text-base text-ink-soft mt-2">
              <li>标签功能</li>
              <li>webdav同步</li>
              <li>重命名功能</li>
              <li>支持分页</li>
            </ul>
            <p className="text-base text-ink-soft">
              具体需求可以在github项目地址加我微信具体沟通。
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3 text-ink">更新日志</h2>
            <ul className="space-y-8">
              {UPDATE_HISTORY.map((release) => (
                <li key={release.version}>
                  <div className="flex justify-between items-center mb-2">
                    <h2 className="text-lg font-bold text-ink-soft">{release.version}</h2>
                    <span className="text-sm text-ink-muted bg-wash px-2 py-1 rounded">
                      {release.date}
                    </span>
                  </div>
                  <ul className="list-disc list-inside text-ink-soft space-y-2 text-base pl-2">
                    {release.changes.map((change, index) => (
                      <li key={index}>{change}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
};

export default Welcome;
