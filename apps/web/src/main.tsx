import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./index.css";

const raiz = document.getElementById("raiz");
if (!raiz) throw new Error("No existe el nodo raíz #raiz");

createRoot(raiz).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
