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
          isActive
            ? "bg-brand-soft font-medium text-brand-strong dark:bg-brand/10 dark:text-brand"
            : "text-ink-soft hover:bg-wash dark:text-night-muted dark:hover:bg-night-line/60"
        }`}
      >
        <span className={isActive ? "text-brand-strong dark:text-brand" : "text-ink-muted"}>
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
            isOpen ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
          } overflow-hidden transition-all duration-200 ease-in-out`}
        >
          {subMenus.map((item) => {
            const active = location.pathname === item.to;
            return (
              <li key={item.to}>
                <Link
                  to={item.to}
                  className={`ml-4 flex h-8 items-center rounded-lg border-l pl-3 text-[12.5px] transition-colors ${
                    active
                      ? "border-brand text-brand-strong dark:border-brand dark:text-brand"
                      : "border-line text-ink-muted hover:border-ink-faint hover:text-ink-soft dark:border-night-line dark:text-night-muted dark:hover:text-night-text"
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
