import { Excalidraw } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import type { ExcalidrawImperativeAPI, ExcalidrawInitialDataState } from "@excalidraw/excalidraw/types";
import type { Scheme } from "./colorScheme";

// Fonts are copied into /excalidraw/fonts at build time, so nothing is fetched from a CDN.
(window as unknown as { EXCALIDRAW_ASSET_PATH: string }).EXCALIDRAW_ASSET_PATH = "/excalidraw/";

// Working things out is mostly handwriting, so the board opens on the pencil (freedraw) with the thinnest
// stroke (Excalidraw's "thin", 1) instead of the selection tool. Both can still be changed on the board.
const INITIAL_DATA: ExcalidrawInitialDataState = {
  appState: {
    activeTool: { type: "freedraw", customType: null, locked: false, lastActiveTool: null },
    currentItemStrokeWidth: 1,
  },
};

// A throwaway canvas: no initial scene, nothing saved, nothing loaded. It lives and dies with the problem.
export default function DrawingBoard({ scheme, onDraw, onApi }: { scheme: Scheme; onDraw: () => void; onApi?: (api: ExcalidrawImperativeAPI) => void }) {
  return (
    <Excalidraw
      excalidrawAPI={onApi}
      initialData={INITIAL_DATA}
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
