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
}

const ExpandableMenu = ({
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

export default ExpandableMenu;
