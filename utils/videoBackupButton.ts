/**
 * 在 B 站视频页（/video/BV…、/video/av…、/list/…?bvid=…）注入「备份该视频」按钮。
 *
 * 重要：按钮绝不能插进 B 站的 DOM 树。视频页是 SSR + Vue 激活（hydration），
 * 往 Vue 管理的节点里插入外来元素会导致激活失败，整页的懒加载图片、推荐列表、
 * 弹幕列表等都会停在灰色占位状态。因此按钮挂在 <body> 末尾（Vue 根节点 #app 之外），
 * 用绝对定位"贴"到播放器下方工具栏右侧；找不到工具栏时退化为右下角悬浮按钮。
 */
import { biliVideoTargetKey, parseBiliVideoUrl } from "./biliVideoUrl";
import { VIDEO_BACKUP_BUTTON_ENABLED } from "./constants";

const BUTTON_ID = "bhx-video-backup-btn";
const TOAST_ID = "bhx-video-backup-toast";
const TOOLBAR_SELECTORS = [".video-toolbar-right", ".video-toolbar-container .toolbar-right"];
const FALLBACK_DELAY = 6000;
// 插件主题粉色（与 tailwind.config.js 中 brand / brand.strong 一致）
const BRAND_COLOR = "#fb7299";
const BRAND_COLOR_STRONG = "#f05a84";

const CLOUD_ICON = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 13v8"/><path d="M4 14.9A7 7 0 1 1 15.7 8h1.8a4.5 4.5 0 0 1 2.5 8.2"/><path d="m8 17 4-4 4 4"/></svg>`;

const parseVideoLocation = () => parseBiliVideoUrl(location.href);

const currentTitle = () => {
  const el = document.querySelector<HTMLElement>("h1.video-title, .video-info-title h1");
  return (
    el?.getAttribute("title") ||
    el?.textContent ||
    document.title.replace(/_哔哩哔哩.*$/, "")
  )
    .trim()
    .slice(0, 200);
};

const showToast = (html: string, duration = 5000) => {
  document.getElementById(TOAST_ID)?.remove();
  const toast = document.createElement("div");
  toast.id = TOAST_ID;
  Object.assign(toast.style, {
    position: "fixed",
    left: "50%",
    top: "80px",
    transform: "translateX(-50%)",
    zIndex: "100000",
    background: "rgba(24,25,28,.92)",
    color: "#fff",
    padding: "10px 16px",
    borderRadius: "8px",
    fontSize: "14px",
    lineHeight: "1.6",
    boxShadow: "0 6px 20px rgba(0,0,0,.25)",
    maxWidth: "420px",
  } satisfies Partial<CSSStyleDeclaration>);
  toast.innerHTML = html;
  document.body.appendChild(toast);
  window.setTimeout(() => toast.remove(), duration);
  return toast;
};

const bindToastAction = (toast: HTMLElement, selector: string, action: string) => {
  toast.querySelector(selector)?.addEventListener("click", (event) => {
    event.preventDefault();
    void browser.runtime.sendMessage({ action });
    toast.remove();
  });
};

const linkStyle = `color:${BRAND_COLOR};cursor:pointer;text-decoration:underline;margin-left:6px`;

const handleClick = async (button: HTMLElement) => {
  const target = parseVideoLocation();
  if (!target) {
    showToast("无法识别当前视频");
    return;
  }
  if (button.dataset.busy === "1") return;
  button.dataset.busy = "1";
  const label = button.querySelector<HTMLElement>("[data-label]");
  const originalText = label?.textContent ?? "";
  if (label) label.textContent = "提交中…";
  try {
    const response = await browser.runtime.sendMessage({
      action: "enqueueVideoBackup",
      bvid: target.bvid,
      aid: target.aid,
      page: target.page,
      title: currentTitle(),
    });
    if (response?.success) {
      const text =
        response.status === "exists"
          ? "该视频已在备份队列中"
          : "已加入备份队列，正在后台上传到百度网盘";
      const toast = showToast(`${text}<a data-open style="${linkStyle}">查看进度</a>`);
      bindToastAction(toast, "[data-open]", "openVideoBackupPage");
    } else if (response?.needLogin) {
      const toast = showToast(
        `还没有登录百度网盘<a data-login style="${linkStyle}">去登录</a>，登录后再点一次即可`,
        8000,
      );
      bindToastAction(toast, "[data-login]", "openBaiduLogin");
    } else {
      showToast(`备份失败：${response?.error ?? "未知错误"}`);
    }
  } catch (error) {
    showToast(`备份失败：${error instanceof Error ? error.message : String(error)}`);
  } finally {
    button.dataset.busy = "0";
    if (label) label.textContent = originalText;
  }
};

const BUTTON_GAP = 16;
const POSITION_INTERVAL = 500;

const applyStyle = (button: HTMLElement, floating: boolean) => {
  button.dataset.floating = floating ? "1" : "0";
  const base: Partial<CSSStyleDeclaration> = {
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    cursor: "pointer",
    userSelect: "none",
    fontSize: "13px",
    lineHeight: "20px",
    whiteSpace: "nowrap",
  };
  // 先清空再赋值，避免两种形态的样式残留
  button.removeAttribute("style");
  Object.assign(
    button.style,
    floating
      ? {
          ...base,
          position: "fixed",
          right: "24px",
          bottom: "96px",
          zIndex: "9999",
          padding: "8px 14px",
          borderRadius: "20px",
          background: BRAND_COLOR,
          color: "#fff",
          boxShadow: "0 4px 14px rgba(251,114,153,.35)",
        }
      : {
          ...base,
          position: "absolute",
          zIndex: "2",
          color: BRAND_COLOR,
        },
  );
};

const createButton = () => {
  const button = document.createElement("div");
  button.id = BUTTON_ID;
  button.title = "下载该视频并上传到百度网盘（Bilibili 无限历史记录）";
  button.setAttribute("role", "button");
  button.innerHTML = `${CLOUD_ICON}<span data-label>备份该视频</span>`;
  button.addEventListener("mouseenter", () => {
    if (button.dataset.floating !== "1") button.style.color = BRAND_COLOR_STRONG;
  });
  button.addEventListener("mouseleave", () => {
    if (button.dataset.floating !== "1") button.style.color = BRAND_COLOR;
  });
  button.addEventListener("click", () => void handleClick(button));
  return button;
};

const findToolbar = () => {
  for (const selector of TOOLBAR_SELECTORS) {
    const el = document.querySelector<HTMLElement>(selector);
    if (el && el.getClientRects().length > 0) return el;
  }
  return null;
};

export function setupVideoBackupButton() {
  if (location.hostname !== "www.bilibili.com") return;

  let enabled = true;
  let startedAt = Date.now();
  let lastKey = "";
  let button: HTMLElement | null = null;

  const update = () => {
    const target = enabled ? parseVideoLocation() : null;
    if (!target) {
      button?.remove();
      button = null;
      return;
    }
    // 切换到另一个视频（含播放列表页切换、分 P）时重新计时
    const key = biliVideoTargetKey(target);
    if (key !== lastKey) {
      lastKey = key;
      startedAt = Date.now();
    }

    const toolbar = findToolbar();
    if (!toolbar && Date.now() - startedAt < FALLBACK_DELAY) {
      // 工具栏还没渲染出来，先不显示，避免悬浮按钮闪一下
      button?.remove();
      button = null;
      return;
    }

    if (!button) button = createButton();
    if (!button.isConnected) document.body.appendChild(button);

    if (!toolbar) {
      if (button.dataset.floating !== "1") applyStyle(button, true);
      return;
    }
    if (button.dataset.floating !== "0") applyStyle(button, false);

    // 放在工具栏右侧区域第一个元素的左边，与其垂直居中
    const anchor = (toolbar.firstElementChild as HTMLElement | null) ?? toolbar;
    const anchorRect = anchor.getBoundingClientRect();
    const toolbarRect = toolbar.getBoundingClientRect();
    const width = button.offsetWidth;
    const height = button.offsetHeight;
    const left =
      (anchor === toolbar ? toolbarRect.left : anchorRect.left) - width - BUTTON_GAP + scrollX;
    const top = toolbarRect.top + (toolbarRect.height - height) / 2 + scrollY;
    const nextLeft = `${Math.round(left)}px`;
    const nextTop = `${Math.round(top)}px`;
    if (button.style.left !== nextLeft) button.style.left = nextLeft;
    if (button.style.top !== nextTop) button.style.top = nextTop;
  };

  const start = () => {
    // 只读布局、只改自己挂在 body 下的节点，不观察也不修改 B 站的 DOM
    window.setInterval(update, POSITION_INTERVAL);
    window.addEventListener("resize", update);
    update();
  };

  void browser.storage.local
    .get(VIDEO_BACKUP_BUTTON_ENABLED)
    .then((result) => {
      enabled = result[VIDEO_BACKUP_BUTTON_ENABLED] !== false;
    })
    .catch(() => undefined)
    .finally(() => {
      // 等页面 load 后再开始，确保 Vue 激活已完成
      if (document.readyState === "complete") {
        start();
      } else {
        window.addEventListener("load", start, { once: true });
      }
    });

  browser.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && VIDEO_BACKUP_BUTTON_ENABLED in changes) {
      enabled = changes[VIDEO_BACKUP_BUTTON_ENABLED].newValue !== false;
      update();
    }
  });
}
