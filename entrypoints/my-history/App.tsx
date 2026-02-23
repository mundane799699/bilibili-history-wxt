import { HashRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { History } from "../../pages/History";
import { About } from "../../pages/About";
import { Sidebar } from "../../components/Sidebar";
import Settings from "../../pages/Settings";
import ScrollToTopButton from "../../components/ScrollToTopButton";
import { Toaster } from "react-hot-toast";
import Feedback from "../../pages/Feedback";
import CloudSync from "../../pages/CloudSync";
import SearchMusic from "../../pages/music/SearchMusic";
import LikedMusic from "../../pages/music/LikedMusic";
import { Favorites } from "../../pages/Favorites";
import Welcome from "../../pages/Welcome";

const MainLayout = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation();
  const isWelcome = location.pathname === "/welcome";

  return (
    <div className="flex h-screen bg-gray-50">
      {!isWelcome && <Sidebar />}
      {/* 主内容区域 */}
      <div className={`${!isWelcome ? "ml-40" : ""} w-full transition-all duration-300`}>
        {children}
      </div>
    </div>
  );
};

const App = () => {
  return (
    <HashRouter>
      <Toaster position="top-center" />
      <MainLayout>
        <div>
          <Routes>
            <Route path="/welcome" element={<Welcome />} />
            <Route path="/" element={<History />} />
            <Route path="/about" element={<About />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/feedback" element={<Feedback />} />
            <Route path="/cloud-sync" element={<CloudSync />} />
            <Route path="/favorites" element={<Favorites />} />
            <Route path="/music/search" element={<SearchMusic />} />
            <Route path="/music/liked" element={<LikedMusic />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
        <ScrollToTopButton />
      </MainLayout>
    </HashRouter>
  );
};

export default App;
