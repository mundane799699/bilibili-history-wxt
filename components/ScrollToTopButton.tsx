import { useEffect, useState, RefObject } from "react";

interface ScrollToTopButtonProps {
  containerRef: RefObject<HTMLDivElement | null>;
}

const ScrollToTopButton = ({ containerRef }: ScrollToTopButtonProps) => {
  const [showBackToTop, setShowBackToTop] = useState(false);

  const handleBackToTop = () => {
    if (containerRef.current) {
      containerRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  useEffect(() => {
    const handleScroll = () => {
      if (containerRef.current) {
        setShowBackToTop(containerRef.current.scrollTop > 300);
      }
    };

    const container = containerRef.current;
    if (container) {
      container.addEventListener("scroll", handleScroll);
      return () => {
        container.removeEventListener("scroll", handleScroll);
      };
    }
  }, [containerRef]);

  return (
    <div className="fixed bottom-4 right-4 z-[100]">
      <button
        className={`w-[50px] h-[50px] bg-[#fb7299] text-white rounded-xl cursor-pointer flex items-center justify-center text-2xl transition-all duration-300 shadow-[0_2px_10px_rgba(251,114,153,0.3)] hover:bg-[#fc8bab] hover:translate-y-[-5px] ${
          showBackToTop
            ? "opacity-100 translate-y-0"
            : "opacity-0 translate-y-5"
        }`}
        onClick={handleBackToTop}
        title="返回顶部"
      >
        ↑
      </button>
    </div>
  );
};

export default ScrollToTopButton;
