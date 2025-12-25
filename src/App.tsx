import styles from "./App.module.css";
import { useZoom } from "./hooks/useZoom";
import { Tips } from "./tips/index.tsx";

function App() {
  const zoom = useZoom();

  return (
    <div className={styles.appRoot} style={{ zoom }}>
      <Tips />
    </div>
  );
}

export default App;
