import { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { isSuperAdmin } from '../../utils/rbac';
import SecuritySecretSection from './SecuritySecretSection';

export default function SelfContainedSecuritySecretSection() {
  const [isOpen, setIsOpen] = useState(false);
  const { user } = useAuth();
  const canWrite = isSuperAdmin(user?.role);
  return (
    <SecuritySecretSection
      isOpen={isOpen}
      onToggle={() => setIsOpen((v) => !v)}
      loading={false}
      onRefresh={() => {}}
      disabled={!canWrite}
    />
  );
}