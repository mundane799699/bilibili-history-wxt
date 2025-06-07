import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { History } from "../../pages/History";
import { About } from "../../pages/About";
import { Sidebar } from "../../components/Sidebar";
import Settings from "../../pages/Settings";
import ScrollToTopButton from "../../components/ScrollToTopButton";
import { useRef } from "react";
import { Toaster } from "react-hot-toast";
import Feedback from "../../pages/Feedback";
import UpdateHistory from "../../pages/UpdateHistory";
import OpenSource from "../../pages/OpenSource";
import CloudSync from "../../pages/CloudSync";
const App = () => {
  return (
    <HashRouter>
      <Toaster position="top-center" />
      <div className="flex h-screen">
        <Sidebar />
        {/* 主内容区域 */}
        <div className="ml-40 w-full">
          <div>
            <Routes>
              <Route path="/" element={<History />} />
              <Route path="/about" element={<About />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/feedback" element={<Feedback />} />
              <Route path="/cloud-sync" element={<CloudSync />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
          <ScrollToTopButton />
        </div>
      </div>
    </HashRouter>
  );
};

export default App;
