import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";
import "katex/dist/katex.min.css";

// Explanations are written by an agent, so raw HTML in them is never rendered (react-markdown drops it
// unless told otherwise) and links open in a new tab without access to this page.
export default function Markdown({ source }: { source: string }) {
  return (
    <div className="flex flex-col gap-3 text-body-sm text-ink [&_code]:text-code [&_h1]:text-heading-sm [&_h2]:text-heading-sm [&_h3]:text-heading-sm [&_li]:ml-5 [&_ol]:list-decimal [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-surface-raised [&_pre]:p-3 [&_strong]:font-semibold [&_ul]:list-disc [&_a]:text-brand [&_a]:underline [&_.katex-display]:overflow-x-auto">
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{ a: ({ node: _, ...props }) => <a {...props} target="_blank" rel="noreferrer noopener" /> }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
