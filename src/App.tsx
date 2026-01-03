import { useState } from "react";
import styles from "./App.module.css";
import { useZoom } from "./hooks/useZoom";
import { Tips } from "./tips/index.tsx";
import { TipsLines } from "./tips-lines/index.tsx";
import { GridChecker } from "./grid-checker/index.tsx";

type View = "tips" | "tips-lines" | "grid-checker";

function App() {
  const zoom = useZoom();
  const [view, setView] = useState<View>("tips-lines");

  return (
    <div className={styles.appRoot} style={{ zoom }}>
      <div className={styles.viewToggle}>
        <button
          className={`${styles.viewButton} ${
            view === "tips" ? styles.viewButtonActive : ""
          }`}
          onClick={() => setView("tips")}
        >
          Tips
        </button>
        <button
          className={`${styles.viewButton} ${
            view === "tips-lines" ? styles.viewButtonActive : ""
          }`}
          onClick={() => setView("tips-lines")}
        >
          Tips Lines
        </button>
        <button
          className={`${styles.viewButton} ${
            view === "grid-checker" ? styles.viewButtonActive : ""
          }`}
          onClick={() => setView("grid-checker")}
        >
          Grid Checker
        </button>
      </div>
      {view === "tips" && <Tips />}
      {view === "tips-lines" && <TipsLines />}
      {view === "grid-checker" && <GridChecker />}
    </div>
  );
}

export default App;
