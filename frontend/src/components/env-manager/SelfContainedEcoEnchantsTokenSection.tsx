import { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { isSuperAdmin } from '../../utils/rbac';
import EcoEnchantsTokenSection from './EcoEnchantsTokenSection';

export default function SelfContainedEcoEnchantsTokenSection() {
  const { user } = useAuth();
  const canWrite = isSuperAdmin(user?.role);
  const [isOpen, setIsOpen] = useState(false);
  return (
    <EcoEnchantsTokenSection
      isOpen={isOpen}
      onToggle={() => setIsOpen((v) => !v)}
      loading={false}
      onRefresh={() => {}}
      disabled={!canWrite}
    />
  );
}