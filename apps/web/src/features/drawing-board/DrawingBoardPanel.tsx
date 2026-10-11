import { lazy, Suspense, useState } from "react";
import { PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useColorScheme } from "./useColorScheme";

// Excalidraw is large, so it is only fetched the first time the board is opened.
const DrawingBoard = lazy(() => import("./DrawingBoard"));

// Once opened it stays mounted, so hiding the board does not throw the drawing away.
export function DrawingBoardPanel({ onDraw }: { onDraw: () => void }) {
  const scheme = useColorScheme();
  const [opened, setOpened] = useState(false);
  const [visible, setVisible] = useState(false);

  return (
    <section aria-label="Drawing board" className="flex flex-col gap-3 rounded-lg bg-surface-sunken p-4">
      <div className="flex items-center justify-between">
        <span className="text-heading-sm">Drawing board</span>
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
      </div>

      {opened && (
        <div hidden={!visible} className="h-[420px] overflow-hidden rounded-md border border-border">
          <Suspense fallback={<p className="p-4 text-body-sm text-ink-muted">Loading the drawing board…</p>}>
            <DrawingBoard scheme={scheme} onDraw={onDraw} />
          </Suspense>
        </div>
      )}
    </section>
  );
}
