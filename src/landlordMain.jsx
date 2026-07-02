import React from "react";
import { createRoot } from "react-dom/client";
import LandlordApp from "./LandlordApp.jsx";
import "./landlord.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <LandlordApp />
  </React.StrictMode>
);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/landlord-sw.js").catch(() => {});
  });
}
