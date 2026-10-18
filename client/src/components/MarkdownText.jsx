import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';

export default function MarkdownText({ children, inline = false }) {
  const content = String(children ?? '');
  const markdown = (
    <ReactMarkdown
      remarkPlugins={[remarkBreaks]}
      components={inline ? { p: ({ children: paragraph }) => <span className="markdown-text-inline">{paragraph}</span> } : undefined}
    >
      {content}
    </ReactMarkdown>
  );

  return inline ? markdown : <div className="markdown-text">{markdown}</div>;
}