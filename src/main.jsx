import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PrivyProvider } from "@privy-io/react-auth";
import "./index.css";
import App from "./App.jsx";
import { privyAppId, privyConfig } from "./privyConfig.js";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <PrivyProvider appId={privyAppId} config={privyConfig}>
      <App />
    </PrivyProvider>
  </StrictMode>
);