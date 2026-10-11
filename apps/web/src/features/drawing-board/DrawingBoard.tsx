import { Excalidraw } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import type { Scheme } from "./colorScheme";

// Fonts are copied into /excalidraw/fonts at build time, so nothing is fetched from a CDN.
(window as unknown as { EXCALIDRAW_ASSET_PATH: string }).EXCALIDRAW_ASSET_PATH = "/excalidraw/";

// A throwaway canvas: no initial scene, nothing saved, nothing loaded. It lives and dies with the problem.
export default function DrawingBoard({ scheme, onDraw }: { scheme: Scheme; onDraw: () => void }) {
  return (
    <Excalidraw
      theme={scheme}
      autoFocus={false}
      handleKeyboardGlobally={false}
      UIOptions={{
        canvasActions: { loadScene: false, export: false, saveToActiveFile: false, saveAsImage: false, toggleTheme: false },
      }}
      onChange={(elements) => {
        if (elements.some((element) => !element.isDeleted)) onDraw();
      }}
    />
  );
}
