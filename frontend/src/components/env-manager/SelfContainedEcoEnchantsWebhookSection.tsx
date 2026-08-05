import { useState } from 'react';
import EcoEnchantsWebhookSection from './EcoEnchantsWebhookSection';

export default function SelfContainedEcoEnchantsWebhookSection() {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <EcoEnchantsWebhookSection
      isOpen={isOpen}
      onToggle={() => setIsOpen((v) => !v)}
      loading={false}
      onRefresh={() => {}}
    />
  );
}