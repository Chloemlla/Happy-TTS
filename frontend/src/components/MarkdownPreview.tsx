import React from 'react';
import MarkdownRenderer from './MarkdownRenderer';

interface MarkdownPreviewProps {
  markdown: string;
}

const MarkdownPreview: React.FC<MarkdownPreviewProps> = ({ markdown }) => {
  return <MarkdownRenderer content={markdown} />;
};

export default MarkdownPreview;
