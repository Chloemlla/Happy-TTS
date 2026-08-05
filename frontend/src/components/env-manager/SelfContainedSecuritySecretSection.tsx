import { useState } from 'react';
import SecuritySecretSection from './SecuritySecretSection';

export default function SelfContainedSecuritySecretSection() {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <SecuritySecretSection
      isOpen={isOpen}
      onToggle={() => setIsOpen((v) => !v)}
      loading={false}
      onRefresh={() => {}}
    />
  );
}