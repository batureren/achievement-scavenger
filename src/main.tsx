import React, { Suspense } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./i18n";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Suspense fallback={<div style={{ color: "white", padding: "20px" }}>Loading language...</div>}>
      <App />
    </Suspense>
  </React.StrictMode>
);