import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { FirebaseProvider } from "./firebase/FirebaseProvider";
import "./index.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root container #root not found in document.");
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <FirebaseProvider>
        <App />
      </FirebaseProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
