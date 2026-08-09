import { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { isSuperAdmin } from '../../utils/rbac';
import EcoEnchantsWebhookSection from './EcoEnchantsWebhookSection';

export default function SelfContainedEcoEnchantsWebhookSection() {
  const { user } = useAuth();
  const canWrite = isSuperAdmin(user?.role);
  const [isOpen, setIsOpen] = useState(false);
  return (
    <EcoEnchantsWebhookSection
      isOpen={isOpen}
      onToggle={() => setIsOpen((v) => !v)}
      loading={false}
      onRefresh={() => {}}
      disabled={!canWrite}
    />
  );
}