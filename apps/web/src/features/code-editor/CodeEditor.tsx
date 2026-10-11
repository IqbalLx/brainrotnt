import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { bracketMatching, HighlightStyle, indentOnInput, syntaxHighlighting } from "@codemirror/language";
import { EditorState, type Extension } from "@codemirror/state";
import { drawSelection, EditorView, highlightActiveLine, keymap, lineNumbers } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { useEffect, useRef } from "react";
import type { CodeLanguage } from "./languages";

interface CodeEditorProps {
  language: CodeLanguage;
  value: string;
  onChange: (value: string) => void;
  /** Ctrl or Cmd with Enter. */
  onSubmit: () => void;
  readOnly: boolean;
  label: string;
}

// Colours come from the design tokens, so the editor follows the light and dark themes with no extra work.
const theme = EditorView.theme({
  "&": { backgroundColor: "var(--surface-sunken)", color: "var(--ink)", fontSize: "14px" },
  ".cm-content": { fontFamily: "var(--font-mono, ui-monospace, monospace)", caretColor: "var(--brand)", padding: "12px 0" },
  ".cm-scroller": { fontFamily: "var(--font-mono, ui-monospace, monospace)", lineHeight: "1.6", maxHeight: "420px" },
  ".cm-gutters": { backgroundColor: "var(--surface-sunken)", color: "var(--ink-faint)", border: "none" },
  ".cm-activeLine": { backgroundColor: "color-mix(in srgb, var(--ink) 6%, transparent)" },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--ink-muted)" },
  ".cm-cursor": { borderLeftColor: "var(--brand)" },
  "&.cm-focused": { outline: "2px solid var(--focus-ring)", outlineOffset: "2px" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": { backgroundColor: "color-mix(in srgb, var(--brand) 30%, transparent)" },
  ".cm-matchingBracket": { backgroundColor: "color-mix(in srgb, var(--brand) 25%, transparent)", outline: "none" },
});

const highlighting = HighlightStyle.define([
  { tag: [tags.keyword, tags.controlKeyword, tags.operatorKeyword, tags.definitionKeyword, tags.moduleKeyword], color: "var(--brand)" },
  { tag: [tags.string, tags.special(tags.string)], color: "var(--success)" },
  { tag: [tags.number, tags.bool, tags.null, tags.atom], color: "var(--blocked)" },
  { tag: [tags.comment, tags.lineComment, tags.blockComment], color: "var(--ink-faint)", fontStyle: "italic" },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName), tags.definition(tags.variableName)], color: "var(--ink)", fontWeight: "600" },
  { tag: [tags.invalid], color: "var(--danger)" },
]);

const languageExtension = (language: CodeLanguage): Extension => (language === "python" ? python() : javascript());

export default function CodeEditor({ language, value, onChange, onSubmit, readOnly, label }: CodeEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  // The editor is created once per language; callbacks are read through refs so it never has to be rebuilt for them.
  const callbacks = useRef({ onChange, onSubmit });
  callbacks.current = { onChange, onSubmit };

  useEffect(() => {
    if (!host.current) return;
    const editor = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          history(),
          drawSelection(),
          indentOnInput(),
          bracketMatching(),
          highlightActiveLine(),
          syntaxHighlighting(highlighting),
          languageExtension(language),
          EditorState.tabSize.of(language === "python" ? 4 : 2),
          EditorState.readOnly.of(readOnly),
          EditorView.editable.of(!readOnly),
          EditorView.contentAttributes.of({ "aria-label": label, "aria-describedby": "code-editor-help" }),
          keymap.of([
            { key: "Mod-Enter", run: () => (callbacks.current.onSubmit(), true) },
            indentWithTab,
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) callbacks.current.onChange(update.state.doc.toString());
          }),
          theme,
        ],
      }),
    });
    view.current = editor;
    return () => {
      editor.destroy();
      view.current = null;
    };
    // `value` is only the starting document: after that the editor owns the text.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, readOnly, label]);

  // A change that did not come from typing (switching back to a language, resetting to the starter) replaces the text.
  useEffect(() => {
    const editor = view.current;
    if (editor && editor.state.doc.toString() !== value) {
      editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value } });
    }
  }, [value]);

  return <div ref={host} className="overflow-hidden rounded-md border border-border" />;
}
