import { Link, useNavigate, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";

export interface ExpandableMenuProps {
  title: string;
  icon: React.ReactNode;
  to?: string;
  isOpen?: boolean;
  subMenus?: {
    title: string;
    to: string;
  }[];
  tourId?: string;
  /** 侧边栏折叠为图标栏时只显示图标，名称与子菜单改为悬停浮层 */
  collapsed?: boolean;
}

const ExpandableMenu = (props: ExpandableMenuProps) =>
  props.collapsed ? <CollapsedMenu {...props} /> : <ExpandedMenu {...props} />;

const ExpandedMenu = ({
  title,
  icon,
  to,
  isOpen: initialIsOpen = false,
  subMenus,
  tourId,
}: ExpandableMenuProps) => {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(initialIsOpen);
  const location = useLocation();
  const isSubMenuActive = !!subMenus?.some((item) => item.to === location.pathname);
  const isActive = subMenus?.length ? isSubMenuActive : location.pathname === to;
  // 子菜单被选中时，父级只高亮文字，背景高亮交给子项，避免两层色块叠在一起
  const isParentOfActive = !!subMenus?.length && isSubMenuActive;

  // 进入某个子菜单页面时（例如新手引导跳转），自动展开所属菜单
  useEffect(() => {
    if (isSubMenuActive) setIsOpen(true);
  }, [isSubMenuActive]);

  const handleClick = (target: string | undefined, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (target) navigate(target);
  };

  return (
    <div>
      <button
        type="button"
        data-tour={tourId}
        onClick={(e) => {
          if (subMenus && subMenus.length > 0) setIsOpen(!isOpen);
          handleClick(to, e);
        }}
        className={`group flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[13px] transition-colors ${
          isParentOfActive
            ? "font-medium text-brand-strong hover:bg-wash dark:text-brand dark:hover:bg-night-line/60"
            : isActive
              ? "bg-brand font-medium text-white shadow-sm shadow-brand/30"
              : "text-ink-soft hover:bg-wash dark:text-night-muted dark:hover:bg-night-line/60"
        }`}
      >
        <span
          className={
            isParentOfActive
              ? "text-brand-strong dark:text-brand"
              : isActive
                ? "text-white"
                : "text-ink-muted"
          }
        >
          {icon}
        </span>
        <span className="truncate">{title}</span>
        {subMenus && (
          <ChevronRight
            className={`ml-auto h-3.5 w-3.5 flex-shrink-0 text-ink-faint transition-transform duration-200 ${
              isOpen ? "rotate-90" : ""
            }`}
          />
        )}
      </button>

      {subMenus && (
        <ul
          className={`${
            isOpen ? "mt-0.5 max-h-96 opacity-100" : "max-h-0 opacity-0"
          } space-y-0.5 overflow-hidden transition-all duration-200 ease-in-out`}
        >
          {subMenus.map((item) => {
            const active = location.pathname === item.to;
            return (
              <li key={item.to}>
                <Link
                  to={item.to}
                  className={`flex h-8 items-center rounded-lg pl-9 pr-2.5 text-[12.5px] transition-colors ${
                    active
                      ? "bg-brand font-medium text-white shadow-sm shadow-brand/30"
                      : "text-ink-muted hover:bg-wash hover:text-ink-soft dark:text-night-muted dark:hover:bg-night-line/60 dark:hover:text-night-text"
                  }`}
                >
                  {item.title}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

/**
 * 折叠态菜单项：只显示图标。悬停时在右侧弹出浮层——普通项显示名称，带子菜单的项显示子菜单列表。
 * 侧边栏的 nav 是 overflow-y-auto，绝对定位会被裁掉，所以浮层用 fixed 定位并按按钮位置计算 top。
 */
const CollapsedMenu = ({ title, icon, to, subMenus, tourId }: ExpandableMenuProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [flyoutTop, setFlyoutTop] = useState<number | null>(null);
  const hasSubMenus = !!subMenus?.length;
  const isActive = hasSubMenus
    ? !!subMenus?.some((item) => item.to === location.pathname)
    : location.pathname === to;

  const showFlyout = (event: React.MouseEvent<HTMLElement> | React.FocusEvent<HTMLElement>) => {
    setFlyoutTop(event.currentTarget.getBoundingClientRect().top);
  };
  const hideFlyout = () => setFlyoutTop(null);

  return (
    // 浮层是该 div 的 DOM 子节点，鼠标从按钮移入浮层不会触发 mouseleave
    <div onMouseEnter={showFlyout} onMouseLeave={hideFlyout}>
      <button
        type="button"
        data-tour={tourId}
        aria-label={title}
        onFocus={showFlyout}
        onBlur={hideFlyout}
        onClick={() => {
          // 带子菜单的项点击时进入第一个子页面
          const target = hasSubMenus ? subMenus![0].to : to;
          if (target) navigate(target);
        }}
        className={`mx-auto flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
          isActive
            ? "bg-brand text-white shadow-sm shadow-brand/30"
            : "text-ink-muted hover:bg-wash hover:text-ink-soft dark:text-night-muted dark:hover:bg-night-line/60 dark:hover:text-night-text"
        }`}
      >
        {icon}
      </button>

      {flyoutTop !== null && (
        // 左侧 pl-2 是透明"桥"，让鼠标能从按钮平滑移入浮层
        <div
          className={`fixed left-14 z-50 pl-2 ${hasSubMenus ? "" : "pointer-events-none"}`}
          style={{ top: flyoutTop }}
        >
          {hasSubMenus ? (
            <div className="min-w-36 rounded-xl border border-line bg-white p-1.5 shadow-lift dark:border-night-line dark:bg-night-card">
              <p className="px-2.5 pb-1 pt-1 text-[11px] font-medium text-ink-faint dark:text-night-muted">
                {title}
              </p>
              {subMenus!.map((item) => {
                const active = location.pathname === item.to;
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={hideFlyout}
                    className={`flex h-8 items-center rounded-lg px-2.5 text-[12.5px] transition-colors ${
                      active
                        ? "bg-brand font-medium text-white"
                        : "text-ink-soft hover:bg-wash dark:text-night-muted dark:hover:bg-night-line/60 dark:hover:text-night-text"
                    }`}
                  >
                    {item.title}
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="mt-1 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-[12px] font-medium text-white shadow-lift dark:bg-night-line dark:text-night-text">
              {title}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ExpandableMenu;
