import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { History } from "../../pages/History";
import { About } from "../../pages/About";
import { Sidebar } from "../../components/Sidebar";
import Settings from "../../pages/Settings";
import ScrollToTopButton from "../../components/ScrollToTopButton";
import { useRef } from "react";
import { Toaster } from "react-hot-toast";

const App = () => {
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <HashRouter>
      <Toaster position="top-center" />
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        {/* 主内容区域 */}
        <div ref={containerRef} className="flex-1 overflow-auto">
          <div>
            <Routes>
              <Route path="/" element={<History />} />
              <Route path="/about" element={<About />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
          <ScrollToTopButton containerRef={containerRef} />
        </div>
      </div>
    </HashRouter>
  );
};

export default App;
