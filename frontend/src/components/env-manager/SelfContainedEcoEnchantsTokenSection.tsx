import { useState } from 'react';
import EcoEnchantsTokenSection from './EcoEnchantsTokenSection';

export default function SelfContainedEcoEnchantsTokenSection() {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <EcoEnchantsTokenSection
      isOpen={isOpen}
      onToggle={() => setIsOpen((v) => !v)}
      loading={false}
      onRefresh={() => {}}
    />
  );
}