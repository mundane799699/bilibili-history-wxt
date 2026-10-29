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

  // 进入某个子菜单页面时（例如新手引导跳转），自动展开所属菜单
  useEffect(() => {
    if (isSubMenuActive) setIsOpen(true);
  }, [isSubMenuActive]);

  const handleClick = (to: string | undefined, e: React.MouseEvent, isSubMenu: boolean) => {
    // 阻止事件冒泡，避免影响其他点击事件
    e.preventDefault();
    e.stopPropagation();

    // 导航到指定路径
    if (to) {
      navigate(to);
    }
  };

  return (
    <div className="cursor-pointer">
      <div
        data-tour={tourId}
        className={`py-4 flex items-center pl-6 pr-3 hover:text-pink-500 text-sm whitespace-nowrap ${
          location.pathname === to ? "text-pink-500" : "text-slate-600 dark:text-neutral-300"
        }`}
        onClick={(e) => {
          // 如果有子菜单，切换展开状态
          if (subMenus && subMenus.length > 0) {
            setIsOpen(!isOpen);
          }
          // 如果有跳转路径，执行跳转
          handleClick(to, e, false);
        }}
      >
        {icon}
        <span className="ml-2 text-xs">{title}</span>
        {subMenus && (
          <ChevronRight
            className={`
                ml-auto w-4 h-4 flex-shrink-0
                transition-transform duration-300 ease-in-out
                ${isOpen ? "rotate-90" : "rotate-0"}
              `}
          />
        )}
      </div>
      {subMenus && (
        <ul
          className={`${
            isOpen ? "max-h-96" : "max-h-0"
          } overflow-hidden transition-all duration-300 ease-in-out`}
        >
          {subMenus.map((item, index) => (
            <li key={index}>
              <Link
                to={item.to}
                className={`py-4 flex items-center pl-6 hover:text-pink-500 text-sm whitespace-nowrap ${
                  location.pathname === item.to
                    ? "text-pink-500"
                    : "text-slate-600 dark:text-neutral-400"
                }`}
              >
                <span className="ml-6 text-xs">{item.title}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default ExpandableMenu;
