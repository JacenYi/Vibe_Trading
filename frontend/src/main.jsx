import React from "react";
import ReactDOM from "react-dom/client";
import { I18nProvider } from "./context/I18nContext.jsx";
import { WalletProvider } from "./context/WalletContext.jsx";
import App from "./App.jsx";
import "./styles/global.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <I18nProvider>
      <WalletProvider>
        <App />
      </WalletProvider>
    </I18nProvider>
  </React.StrictMode>
);
