import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
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
}

const ExpandableMenu = ({
  title,
  icon,
  to,
  isOpen: initialIsOpen = false,
  subMenus,
}: ExpandableMenuProps) => {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(initialIsOpen);

  const handleClick = (
    to: string | undefined,
    e: React.MouseEvent,
    isSubMenu: boolean
  ) => {
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
        className="py-4 flex items-center text-slate-600 pl-6 hover:text-pink-400 text-sm"
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
                ml-6 w-4 h-4
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
                className="py-4 flex items-center text-slate-600 pl-6 hover:text-pink-400 text-sm"
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
