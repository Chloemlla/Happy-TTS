import React from 'react';
import MarkdownRenderer from './MarkdownRenderer';

interface MarkdownPreviewProps {
  markdown: string;
}

const MarkdownPreview: React.FC<MarkdownPreviewProps> = ({ markdown }) => {
  return (
    <MarkdownRenderer
      content={markdown}
      density="compact"
      controls={{
        showCopy: true,
        showSourceToggle: true,
        showExpandToggle: true,
        defaultExpanded: true,
        collapsedHeight: 520,
      }}
    />
  );
};

export default MarkdownPreview;
