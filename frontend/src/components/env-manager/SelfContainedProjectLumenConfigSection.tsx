import { useState } from 'react';
import ProjectLumenConfigSection from './ProjectLumenConfigSection';

export default function SelfContainedProjectLumenConfigSection() {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <ProjectLumenConfigSection
      isOpen={isOpen}
      onToggle={() => setIsOpen((v) => !v)}
      loading={false}
      onRefresh={() => {}}
    />
  );
}
