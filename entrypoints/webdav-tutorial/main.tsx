import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import { initTheme } from "../../utils/theme";
import "./style.css";

initTheme();
ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
