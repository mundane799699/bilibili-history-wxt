import {
  BookOpen,
  CheckCircle2,
  CloudUpload,
  ExternalLink,
  FolderOpen,
  HelpCircle,
  LoaderCircle,
  NotebookPen,
  RotateCcw,
  Share2,
  Star,
  ThumbsUp,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { BackupPageHeader, BackupPageLayout } from "./backup/BackupPageHeader";
import { BAIDU_LOGIN_URL } from "../utils/baiduPan";
import { DEFAULT_VIDEO_BACKUP_DIR } from "../utils/constants";

const cardClass =
  "overflow-hidden rounded-2xl border border-line bg-white dark:border-night-line dark:bg-night-card";
const mockFrame =
  "rounded-xl border border-line bg-wash/60 p-4 dark:border-night-line dark:bg-night-line/40";
const linkButton =
  "inline-flex items-center gap-1.5 rounded-lg border border-line bg-white px-3 py-1.5 text-sm font-medium text-ink-soft transition-colors hover:bg-wash dark:border-night-line dark:bg-night-card dark:text-night-text dark:hover:bg-night-line/60";

interface StepProps {
  index: number;
  title: string;
  optional?: boolean;
  children: React.ReactNode;
  illustration?: React.ReactNode;
}

const Step = ({ index, title, optional, children, illustration }: StepProps) => (
  <li className={cardClass}>
    <div className="p-5">
      <div className="flex items-center gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-strong text-sm font-semibold text-white dark:bg-brand">
          {index}
        </span>
        <h2 className="font-semibold text-ink dark:text-night-text">{title}</h2>
        {optional && (
          <span className="rounded bg-wash px-1.5 py-0.5 text-xs text-ink-muted dark:bg-night-line dark:text-night-muted">
            可选
          </span>
        )}
      </div>
      <div className="mt-3 space-y-2 pl-10 text-sm leading-6 text-ink-soft dark:text-night-muted">
        {children}
      </div>
      {illustration && <div className="mt-4 pl-10">{illustration}</div>}
    </div>
  </li>
);

const Kbd = ({ children }: { children: React.ReactNode }) => (
  <span className="rounded bg-wash px-1.5 py-0.5 font-medium text-ink dark:bg-night-line dark:text-night-text">
    {children}
  </span>
);

/** 示意：视频备份页的百度网盘账号卡片 */
const AccountMock = () => (
  <div className={mockFrame}>
    <div className="flex items-center gap-3">
      <div className="h-9 w-9 rounded-full bg-gradient-to-br from-sky-300 to-sky-500" />
      <div>
        <p className="flex items-center gap-1.5 text-sm font-medium text-ink dark:text-night-text">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          你的百度账号
          <span className="rounded bg-white px-1.5 py-0.5 text-xs font-normal text-ink-muted dark:bg-night-card dark:text-night-muted">
            普通用户
          </span>
        </p>
        <p className="mt-0.5 text-xs text-ink-muted dark:text-night-muted">
          已用 54 GB / 2 TB，剩余 1.9 TB
        </p>
      </div>
    </div>
  </div>
);

/** 示意：保存目录输入框 */
const DirMock = () => (
  <div className={mockFrame}>
    <p className="mb-1.5 text-xs font-medium text-ink-soft dark:text-night-muted">保存到网盘目录</p>
    <div className="flex gap-2">
      <div className="flex-1 rounded-lg border border-line bg-white px-3 py-1.5 text-sm text-ink dark:border-night-line dark:bg-night dark:text-night-text">
        {DEFAULT_VIDEO_BACKUP_DIR}/2026
      </div>
      <span className="rounded-lg bg-brand-strong px-3 py-1.5 text-sm font-medium text-white dark:bg-brand">
        保存
      </span>
    </div>
  </div>
);

/** 示意：B 站视频页播放器下方的工具栏 */
const ToolbarMock = () => (
  <div className={mockFrame}>
    <div className="mb-3 aspect-[16/5] rounded-lg bg-gradient-to-br from-neutral-700 to-neutral-900" />
    <div className="flex items-center justify-between gap-4 text-xs text-ink-muted dark:text-night-muted">
      <div className="flex items-center gap-4">
        <span className="inline-flex items-center gap-1">
          <ThumbsUp className="h-4 w-4" />
          691
        </span>
        <span className="inline-flex items-center gap-1">
          <Star className="h-4 w-4" />
          1339
        </span>
        <span className="inline-flex items-center gap-1">
          <Share2 className="h-4 w-4" />
          59
        </span>
      </div>
      <div className="flex items-center gap-4">
        <span className="relative inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium text-brand ring-2 ring-brand ring-offset-2 ring-offset-wash dark:ring-offset-night-card">
          <CloudUpload className="h-4 w-4" />
          备份该视频
        </span>
        <span className="inline-flex items-center gap-1">
          <TriangleAlert className="h-4 w-4" />
          稿件举报
        </span>
        <span className="inline-flex items-center gap-1">
          <NotebookPen className="h-4 w-4" />
          记笔记
        </span>
      </div>
    </div>
  </div>
);

/** 示意：任务列表中的进度 */
const TaskMock = () => (
  <div className={`${mockFrame} space-y-3`}>
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      {["解析", "下载", "合成", "校验", "上传", "提交"].map((stage, i) => (
        <span key={stage} className="inline-flex items-center gap-1.5">
          <span
            className={`rounded-full px-2 py-0.5 ${
              i < 4
                ? "bg-brand-soft text-brand-strong dark:bg-brand/10 dark:text-brand"
                : i === 4
                  ? "bg-brand-strong text-white dark:bg-brand"
                  : "bg-white text-ink-muted dark:bg-night-card dark:text-night-muted"
            }`}
          >
            {stage}
          </span>
          {i < 5 && <span className="text-ink-faint">→</span>}
        </span>
      ))}
    </div>
    <div className="rounded-lg bg-white p-3 dark:bg-night-card">
      <div className="flex items-center justify-between gap-3">
        <p className="truncate text-sm font-medium text-ink dark:text-night-text">
          Bilibili无限历史记录浏览器插件介绍与演示
        </p>
        <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-brand-strong dark:text-brand">
          <LoaderCircle className="h-3 w-3 animate-spin" />
          上传
        </span>
      </div>
      <p className="mt-1 text-xs text-ink-muted dark:text-night-muted">
        1080P+ · 117.3 MB · 上传中 70.4 MB / 117.3 MB · 5.2 MB/s
      </p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-wash dark:bg-night-line">
        <div className="h-full w-3/5 rounded-full bg-brand" />
      </div>
    </div>
  </div>
);

/** 示意：完成后的任务操作 */
const DoneMock = () => (
  <div className={mockFrame}>
    <div className="flex items-center justify-between gap-3 rounded-lg bg-white p-3 dark:bg-night-card">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-ink dark:text-night-text">
          Bilibili无限历史记录浏览器插件介绍与演示
        </p>
        <p className="mt-1 truncate text-xs text-ink-muted dark:text-night-muted">
          {DEFAULT_VIDEO_BACKUP_DIR}/Bilibili无限历史记录浏览器插件介绍与演示_BV1PALHzREm1.mp4
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2 text-ink-muted dark:text-night-muted">
        <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">已完成</span>
        <span className="rounded-md p-1 text-brand-strong ring-2 ring-brand dark:text-brand">
          <ExternalLink className="h-4 w-4" />
        </span>
        <RotateCcw className="h-4 w-4" />
        <Trash2 className="h-4 w-4" />
      </div>
    </div>
  </div>
);

const FAQS: { q: string; a: React.ReactNode }[] = [
  {
    q: "点击按钮后提示「还没有登录百度网盘」？",
    a: (
      <>
        插件使用的是浏览器里百度网盘网页版的登录状态。请在<b>同一个浏览器</b>中打开 pan.baidu.com
        登录，然后回到视频页再点一次按钮。登录后可以在「视频备份」页点击「刷新」确认。
      </>
    ),
  },
  {
    q: "备份出来的画质不够高？",
    a: "插件会选择你的 B 站账号能观看的最高画质：未登录 B 站时通常只有 480P，登录后可以到 1080P，大会员可以获得 1080P+ / 4K 等更高画质。杜比视界画质会自动跳过。",
  },
  {
    q: "关掉插件页面会怎样？",
    a: "下载和上传都在插件页面里进行。只要还有任意一个插件页面开着，任务就会继续；全部关闭后，未完成的任务会在下次打开插件页面时从头重新开始。",
  },
  {
    q: "有文件大小限制吗？",
    a: "百度网盘普通用户单个文件不能超过 4GB，会员可以上传更大的文件。插件会在下载前预估大小，超过限制时直接提示，不会白白下载。",
  },
  {
    q: "哪些视频不能备份？",
    a: "番剧、电影、付费课程等没有 DASH 视频流的内容暂不支持；目前只支持 www.bilibili.com/video/ 开头的普通视频页。多 P 视频每次备份当前正在看的那一 P。",
  },
  {
    q: "同一个视频备份了多次会覆盖吗？",
    a: "不会覆盖。网盘中已有同名文件时，新文件会自动在文件名后加上时间重命名，不会覆盖原文件。",
  },
  {
    q: "视频页看不到「备份该视频」按钮？",
    a: "请确认「视频备份」页中的「在视频页显示按钮」开关已打开，然后刷新视频页。按钮会在页面加载完成后出现；如果找不到工具栏，会显示在页面右下角。",
  },
  {
    q: "备份失败了怎么办？",
    a: "任务下方会显示失败原因。处理后（例如重新登录网盘），点击任务右侧的重试按钮即可重新备份。如果反复失败，可以把失败原因通过「反馈」页告诉我们。",
  },
];

const VideoBackupTutorial = () => (
  <BackupPageLayout>
    <BackupPageHeader
      icon={BookOpen}
      title="视频备份教程"
      description="跟着下面几步，把喜欢的 B 站视频备份到你自己的百度网盘。整个过程不需要安装其他软件，也不需要输入任何账号密码。"
    />

    <ol className="space-y-4">
      <Step index={1} title="在浏览器中登录百度网盘" illustration={<AccountMock />}>
        <p>
          在当前浏览器里打开百度网盘网页版并登录。插件直接复用网页版的登录状态，
          <b>不会</b>索取你的账号密码。
        </p>
        <p>登录后回到插件的「视频备份」页，顶部能看到你的网盘昵称和剩余空间，就说明连接成功了。</p>
        <a href={BAIDU_LOGIN_URL} target="_blank" rel="noreferrer" className={linkButton}>
          <ExternalLink className="h-4 w-4" />
          打开百度网盘
        </a>
      </Step>

      <Step index={2} title="设置保存目录和视频编码" optional illustration={<DirMock />}>
        <p>
          视频默认保存在网盘的 <Kbd>{DEFAULT_VIDEO_BACKUP_DIR}</Kbd>{" "}
          目录。你可以改成任意目录，支持多级目录，不存在会自动创建。
        </p>
        <p>
          视频编码默认 <Kbd>AVC / H.264</Kbd>，几乎所有设备都能直接播放；想节省网盘空间可以选 HEVC
          或 AV1，但旧设备可能无法播放。
        </p>
      </Step>

      <Step index={3} title="登录 B 站以获得更高画质" optional>
        <p>
          插件会以你 B 站账号可用的<b>最高画质</b>备份。未登录时通常只有 480P，登录后可达
          1080P，大会员可备份 1080P+ / 4K。
        </p>
      </Step>

      <Step index={4} title="在视频页点击「备份该视频」" illustration={<ToolbarMock />}>
        <p>
          打开任意 B 站视频页，在播放器下方点赞、投币那一行的右侧，「稿件举报」的左边， 找到粉色的{" "}
          <Kbd>备份该视频</Kbd> 按钮并点击。
        </p>
        <p>
          页面顶部会提示「已加入备份队列」。多 P 视频会备份你当前正在看的那一 P，想备份其他 P
          就切换过去再点一次。
        </p>
      </Step>

      <Step index={5} title="等待备份完成" illustration={<TaskMock />}>
        <p>
          任务会在插件页面中自动执行：解析视频 → 下载 → 合成为 MP4 → 校验 → 上传到网盘。
          你可以在「视频备份」页的任务列表里看到实时进度和上传速度。
        </p>
        <p>
          备份期间你可以继续看视频、切换到其他标签页，只要<b>保持至少一个插件页面打开</b>即可。
          多个视频会排队依次备份。
        </p>
      </Step>

      <Step index={6} title="在网盘中查看视频" illustration={<DoneMock />}>
        <p>
          任务显示「已完成」后，点击右侧的 <ExternalLink className="inline h-3.5 w-3.5" />{" "}
          按钮即可在百度网盘中打开保存目录。
        </p>
        <p>
          文件名格式为 <Kbd>视频标题_BV号.mp4</Kbd>，多 P 视频为{" "}
          <Kbd>视频标题_P2_分P标题_BV号_p2.mp4</Kbd>。也可以点击保存目录旁的{" "}
          <FolderOpen className="inline h-3.5 w-3.5" /> 按钮直接打开目录。
        </p>
      </Step>
    </ol>

    <section className={`${cardClass} mt-8`}>
      <div className="flex items-center gap-2 border-b border-line px-5 py-3.5 dark:border-night-line">
        <HelpCircle className="h-4 w-4 text-ink-muted dark:text-night-muted" />
        <h2 className="font-semibold text-ink dark:text-night-text">常见问题</h2>
      </div>
      <div className="divide-y divide-line dark:divide-night-line">
        {FAQS.map((item) => (
          <details key={item.q} className="group px-5 py-3.5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-ink dark:text-night-text">
              {item.q}
              <span className="text-ink-faint transition-transform group-open:rotate-45">+</span>
            </summary>
            <p className="mt-2 text-sm leading-6 text-ink-soft dark:text-night-muted">{item.a}</p>
          </details>
        ))}
      </div>
    </section>

    <div className="mt-8 flex justify-center">
      <a
        href={browser.runtime.getURL("/my-history.html#/video-backup")}
        className="inline-flex items-center gap-1.5 rounded-lg bg-brand-strong px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-strong/90 dark:bg-brand dark:hover:bg-brand-strong"
      >
        <CloudUpload className="h-4 w-4" />
        去备份视频
      </a>
    </div>
  </BackupPageLayout>
);

export default VideoBackupTutorial;
