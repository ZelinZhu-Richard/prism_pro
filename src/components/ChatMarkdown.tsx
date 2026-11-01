import {
  memo,
  useMemo,
  useState,
  useEffect,
  Children,
  isValidElement,
  type ReactNode,
} from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import katex from "katex";
import { Copy, Check } from "lucide-react";
import { chatLink, chatMath } from "../chat-markdown";
const plugins = [remarkGfm, remarkMath];
function textOf(value: ReactNode): string {
  return Children.toArray(value)
    .map((child) =>
      typeof child === "string" || typeof child === "number"
        ? String(child)
        : isValidElement<{ children?: ReactNode }>(child)
          ? textOf(child.props.children)
          : "",
    )
    .join("");
}
export function CopyChat({
  text,
  label = "Copy reply",
}: {
  text: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    setCopied(false);
    setError("");
  }, [text]);
  return (
    <>
      <button
        className="chat-copy"
        aria-label={label}
        title={label}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setError("");
          } catch {
            setError(
              "Copy was unavailable. Select and copy the text manually.",
            );
          }
        }}
      >
        {copied ? <Check size={13} /> : <Copy size={13} />}
        <span>{copied ? "Copied" : "Copy"}</span>
      </button>
      {error && (
        <span className="field-help" role="status">
          {error}
        </span>
      )}
    </>
  );
}
export function ChatMath({
  source,
  display,
}: {
  source: string;
  display: boolean;
}) {
  const html = useMemo(() => {
    try {
      if (source.length > 8000) return null;
      return katex.renderToString(source, {
        displayMode: display,
        throwOnError: true,
        trust: false,
        strict: "ignore",
        maxExpand: 500,
        maxSize: 10,
        macros: {},
        output: "htmlAndMathml",
      });
    } catch {
      return null;
    }
  }, [source, display]);
  return html ? (
    <span
      className={display ? "chat-math-display" : "chat-math-inline"}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  ) : (
    <code
      className="chat-math-fallback"
      title="This equation could not be rendered locally."
    >
      {source}
    </code>
  );
}
function ChatPre({ children }: { children?: ReactNode }) {
  const element = Children.toArray(children).find(isValidElement) as
    | React.ReactElement<{ className?: string; children?: ReactNode }>
    | undefined;
  if (element?.props.className?.includes("math-display"))
    return <div className="chat-equation">{children}</div>;
  const code = textOf(children),
    language =
      /language-([\w+-]+)/.exec(element?.props.className ?? "")?.[1] ??
      "Source";
  return (
    <div className="chat-code">
      <div>
        <span>{language}</span>
        <CopyChat text={code} label="Copy code" />
      </div>
      <pre tabIndex={0}>{children}</pre>
    </div>
  );
}
export const ChatMarkdown = memo(function ChatMarkdown({
  text,
}: {
  text: string;
}) {
  const [raw, setRaw] = useState(false),
    bounded = text.length <= 100000;
  return (
    <div className="chat-rich-text">
      {!bounded || raw ? (
        <pre className="chat-raw" tabIndex={0}>
          {text}
        </pre>
      ) : (
        <Markdown
          remarkPlugins={plugins}
          skipHtml
          urlTransform={(url, key) => (key === "href" ? chatLink(url) : "")}
          components={{
            a: ({ href, children }) =>
              href ? (
                <a href={href} target="_blank" rel="noopener noreferrer">
                  {children}
                </a>
              ) : (
                <span>{children}</span>
              ),
            img: ({ alt }) => (
              <span className="field-help">
                [Image omitted{alt ? `: ${alt}` : ""}]
              </span>
            ),
            pre: ({ children }) => <ChatPre>{children}</ChatPre>,
            code: ({ className, children }) =>
              className?.includes("language-math") ? (
                <ChatMath
                  source={textOf(children).replace(/\n$/, "")}
                  display={className.includes("math-display")}
                />
              ) : (
                <code className={className}>{children}</code>
              ),
            table: ({ children }) => (
              <div className="chat-table-scroll" tabIndex={0}>
                <table>{children}</table>
              </div>
            ),
          }}
        >
          {chatMath(text)}
        </Markdown>
      )}
      <div className="chat-response-actions">
        <CopyChat text={text} />
        {bounded && (
          <button onClick={() => setRaw((v) => !v)}>
            {raw ? "Formatted reply" : "Plain text"}
          </button>
        )}
        {!bounded && (
          <span className="field-help">Large reply shown as plain text.</span>
        )}
      </div>
    </div>
  );
});
