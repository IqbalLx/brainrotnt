import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { settle, SNAPS, step, type Snap } from "./sheetSnap";

interface BottomSheetProps {
  label: string;
  open: boolean;
  snap: Snap;
  onSnap: (snap: Snap) => void;
  onClose: () => void;
  /** Called once the sheet has settled at a new height, for content that measures itself. */
  onSettled?: () => void;
  /** Shown in the header once the sheet covers most of the page, e.g. the problem being worked on. */
  pinned?: ReactNode;
  /** Extra header buttons, before the height controls. */
  actions?: ReactNode;
  children: ReactNode;
}

const SNAP_LABEL: Record<Snap, string> = { 0.25: "25%", 0.5: "50%", 0.75: "75%", 1: "Full" };
const percent = (snap: number) => Math.round(snap * 100);

interface Drag {
  pointerId: number;
  startY: number;
  startHeight: number;
  samples: { y: number; t: number }[];
}

/**
 * A non-modal sheet anchored to the bottom of the screen. It rests at 25, 50, 75 or 100% of the viewport
 * height: drag the header (a flick moves one step, dragging it nearly shut closes it), press the snap
 * buttons, or focus the handle and use the arrow keys. The page underneath stays usable, and gets bottom
 * padding while the sheet is open so nothing is stranded behind it. Closing only hides it, so whatever is
 * inside keeps its state.
 */
export function BottomSheet({ label, open, snap, onSnap, onClose, onSettled, pinned, actions, children }: BottomSheetProps) {
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const drag = useRef<Drag | null>(null);
  const sheet = useRef<HTMLElement>(null);

  // Keep the page scrollable past the sheet, so the answer box is never stuck underneath it.
  useEffect(() => {
    if (!open || snap === 1) return;
    const previous = document.body.style.paddingBottom;
    document.body.style.paddingBottom = `${percent(snap)}dvh`;
    return () => {
      document.body.style.paddingBottom = previous;
    };
  }, [open, snap]);

  // Content that caches its position (a canvas) needs telling once the height has stopped changing.
  useEffect(() => {
    if (!open || dragHeight !== null) return;
    const element = sheet.current;
    const done = () => onSettled?.();
    const timer = setTimeout(done, 260);
    element?.addEventListener("transitionend", done, { once: true });
    return () => {
      clearTimeout(timer);
      element?.removeEventListener("transitionend", done);
    };
  }, [open, snap, dragHeight, onSettled]);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    // Buttons keep working as buttons, and the pinned text can be scrolled and selected.
    if (event.button !== 0 || (event.target as HTMLElement).closest("button, [data-no-drag]")) return;
    const height = sheet.current?.getBoundingClientRect().height ?? 0;
    drag.current = { pointerId: event.pointerId, startY: event.clientY, startHeight: height, samples: [{ y: event.clientY, t: event.timeStamp }] };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragHeight(height);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const height = Math.min(Math.max(current.startHeight + current.startY - event.clientY, 0), window.innerHeight);
    current.samples = [...current.samples, { y: event.clientY, t: event.timeStamp }].filter((s) => event.timeStamp - s.t < 100);
    setDragHeight(height);
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    drag.current = null;
    const viewport = window.innerHeight;
    const height = Math.min(Math.max(current.startHeight + current.startY - event.clientY, 0), viewport);
    // Only the last 100 ms count, so holding still before letting go is a slow release.
    const recent = current.samples.filter((s) => event.timeStamp - s.t < 100);
    const first = recent[0] ?? { y: event.clientY, t: event.timeStamp };
    const seconds = (event.timeStamp - first.t) / 1000;
    // Upward movement grows the sheet, so velocity is positive when the pointer moves up.
    const velocity = seconds > 0 ? (first.y - event.clientY) / viewport / seconds : 0;
    setDragHeight(null);
    const next = settle(height / viewport, velocity);
    if (next === null) onClose();
    else onSnap(next);
  };

  const onHandleKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const keys: Record<string, () => Snap> = {
      ArrowUp: () => step(snap, 1),
      ArrowRight: () => step(snap, 1),
      ArrowDown: () => step(snap, -1),
      ArrowLeft: () => step(snap, -1),
      Home: () => SNAPS[0],
      End: () => SNAPS[SNAPS.length - 1],
    };
    if (!keys[event.key]) return;
    event.preventDefault();
    onSnap(keys[event.key]());
  };

  const dragging = dragHeight !== null;
  const showPinned = pinned && (dragging ? (dragHeight ?? 0) / window.innerHeight > 0.6 : snap >= 0.75);

  return createPortal(
    <section
      ref={sheet}
      hidden={!open}
      aria-label={label}
      style={{ height: dragging ? `${dragHeight}px` : `${percent(snap)}dvh` }}
      className={cn(
        "fixed inset-x-0 bottom-0 z-30 flex flex-col overflow-hidden border-t border-border-strong bg-surface-raised shadow-[0_-12px_32px_rgb(0_0_0/0.35)]",
        snap === 1 && !dragging ? "rounded-none pt-[env(safe-area-inset-top,0px)]" : "rounded-t-xl",
        !dragging && "transition-[height] duration-200 ease-out motion-reduce:transition-none",
      )}
    >
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className={cn("flex shrink-0 touch-none select-none flex-col gap-2 border-b border-border px-4 pb-2 pt-1.5", dragging ? "cursor-grabbing" : "cursor-grab")}
      >
        <div
          role="slider"
          tabIndex={0}
          aria-label={`${label} height`}
          aria-orientation="vertical"
          aria-valuemin={percent(SNAPS[0])}
          aria-valuemax={100}
          aria-valuenow={percent(snap)}
          aria-valuetext={`${percent(snap)}% of the screen`}
          onKeyDown={onHandleKey}
          className="mx-auto flex h-4 w-16 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-focus-ring"
        >
          <span className="h-1 w-10 rounded-full bg-border-strong" aria-hidden />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-heading-sm text-ink">{label}</span>
          <div className="flex items-center gap-2">
            {actions}
            <div role="group" aria-label="Sheet height" className="flex rounded-md border border-border p-0.5">
              {SNAPS.map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={!dragging && snap === value}
                  onClick={() => onSnap(value)}
                  className={cn(
                    "rounded px-2 py-0.5 text-label transition-colors focus-visible:outline-2 focus-visible:outline-focus-ring",
                    !dragging && snap === value ? "bg-surface-high text-ink" : "text-ink-muted hover:text-ink",
                  )}
                >
                  {SNAP_LABEL[value]}
                </button>
              ))}
            </div>
            <Button variant="ghost" size="sm" onClick={onClose} aria-label={`Hide ${label.toLowerCase()}`}>
              <ChevronDown className="size-4" aria-hidden />
              Hide
            </Button>
          </div>
        </div>

        {showPinned && (
          <div data-no-drag className="max-h-24 cursor-auto select-text overflow-y-auto text-body-sm text-ink-muted">
            {pinned}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1">{children}</div>
    </section>,
    document.body,
  );
}
