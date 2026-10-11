import { lazy, Suspense, useCallback, useRef, useState, type ReactNode } from "react";
import { Calculator, PenLine } from "lucide-react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BottomSheet } from "./BottomSheet";
import { DEFAULT_SNAP, isSnap, type Snap } from "./sheetSnap";
import { useColorScheme } from "./useColorScheme";

// Excalidraw is large, so it is only fetched the first time the board is opened.
const DrawingBoard = lazy(() => import("./DrawingBoard"));

// The height the sheet was last left at is remembered in this browser.
const SNAP_KEY = "brainrotnt:drawing-sheet-snap";
function savedSnap(): Snap {
  try {
    const value = Number(localStorage.getItem(SNAP_KEY));
    return isSnap(value) ? value : DEFAULT_SNAP;
  } catch {
    return DEFAULT_SNAP;
  }
}
function saveSnap(snap: Snap) {
  try {
    localStorage.setItem(SNAP_KEY, String(snap));
  } catch {
    // storage blocked: the sheet just opens at the default next time
  }
}

const wide = () => typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches;

interface DrawingBoardPanelProps {
  /** Pinned in the sheet's header once it covers the problem. */
  statement: string;
  /** This problem's calculator, shown beside the board when the problem allows one. */
  calculator: ReactNode | null;
  onDraw: () => void;
}

// The board opens in a bottom sheet. Once opened it stays mounted, so hiding the sheet does not throw
// the drawing away; it is discarded with the problem.
export function DrawingBoardPanel({ statement, calculator, onDraw }: DrawingBoardPanelProps) {
  const scheme = useColorScheme();
  const [opened, setOpened] = useState(false);
  const [visible, setVisible] = useState(false);
  const [snap, setSnap] = useState<Snap>(savedSnap);
  // Beside the board on a wide screen; on a phone it takes the board's place while shown.
  const [showCalculator, setShowCalculator] = useState(wide);
  const api = useRef<ExcalidrawImperativeAPI | null>(null);
  const refresh = useCallback(() => api.current?.refresh(), []);

  const changeSnap = (next: Snap) => {
    setSnap(next);
    saveSnap(next);
  };

  return (
    <section aria-label="Drawing board" className="flex items-center justify-between gap-3 rounded-lg bg-surface-sunken p-4">
      <div className="flex flex-col gap-0.5">
        <span className="text-heading-sm">Drawing board</span>
        <span className="text-body-sm text-ink-muted">Opens from the bottom; drag it to 50, 75% or full screen.</span>
      </div>
      <Button
        variant="outline"
        size="sm"
        aria-expanded={visible}
        onClick={() => {
          setOpened(true);
          setVisible((current) => !current);
        }}
      >
        <PenLine className="size-4" aria-hidden />
        {visible ? "Hide" : "Open"}
      </Button>

      {opened && (
        <BottomSheet
          label="Drawing board"
          open={visible}
          snap={snap}
          onSnap={changeSnap}
          onClose={() => setVisible(false)}
          onSettled={refresh}
          pinned={<p className="whitespace-pre-wrap">{statement}</p>}
          actions={
            calculator && (
              <Button
                variant="ghost"
                size="sm"
                className={cn(showCalculator && "bg-surface-high text-ink")}
                aria-pressed={showCalculator}
                onClick={() => {
                  setShowCalculator((current) => !current);
                  requestAnimationFrame(refresh);
                }}
              >
                <Calculator className="size-4" aria-hidden />
                <span className="max-sm:sr-only">Calculator</span>
              </Button>
            )
          }
        >
          <div className="flex h-full">
            <div className={cn("h-full min-w-0 flex-1", calculator && showCalculator && "max-md:hidden")}>
              <Suspense fallback={<p className="p-4 text-body-sm text-ink-muted">Loading the drawing board…</p>}>
                <DrawingBoard
                  scheme={scheme}
                  onDraw={onDraw}
                  onApi={(instance) => {
                    api.current = instance;
                  }}
                />
              </Suspense>
            </div>
            {calculator && (
              <aside aria-label="Calculator" hidden={!showCalculator} className="h-full w-full shrink-0 overflow-y-auto border-border p-4 md:w-80 md:border-l">
                {calculator}
              </aside>
            )}
          </div>
        </BottomSheet>
      )}
    </section>
  );
}
