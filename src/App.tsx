import { useState } from "react";
import styles from "./App.module.css";
import { useZoom } from "./hooks/useZoom";
import { Tips } from "./tips/index.tsx";
import { TipsLines } from "./tips-lines/index.tsx";
import { GridChecker } from "./grid-checker/index.tsx";
import { BetGame } from "./bet-game/index.tsx";

type View = "tips" | "tips-lines" | "grid-checker" | "bet-game";

function App() {
  const [view, setView] = useState<View>("bet-game");

  // Only use zoom for non-bet-game views (they need fixed 1920x1080 layout)
  const zoom = useZoom("fit");

  // For bet-game: use responsive layout (no zoom, full viewport)
  // For others: use the scaled fixed-size layout
  const isBetGame = view === "bet-game";

  return (
    <div
      className={isBetGame ? styles.appRootMobile : styles.appRoot}
      style={isBetGame ? undefined : { zoom }}
    >
      <div className={styles.viewToggle}>
        <button
          className={`${styles.viewButton} ${
            view === "bet-game" ? styles.viewButtonActive : ""
          }`}
          onClick={() => setView("bet-game")}
        >
          🎰 Bet
        </button>
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
          Lines
        </button>
        <button
          className={`${styles.viewButton} ${
            view === "grid-checker" ? styles.viewButtonActive : ""
          }`}
          onClick={() => setView("grid-checker")}
        >
          Grid
        </button>
      </div>
      {view === "bet-game" && <BetGame />}
      {view === "tips" && <Tips />}
      {view === "tips-lines" && <TipsLines />}
      {view === "grid-checker" && <GridChecker />}
    </div>
  );
}

export default App;
