import React from "react";
import ReactDOM from "react-dom/client";
import VideoBackupTutorial from "@/pages/VideoBackupTutorial";
import { initTheme } from "../../utils/theme";
import "./style.css";

initTheme();
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <VideoBackupTutorial />
  </React.StrictMode>,
);
