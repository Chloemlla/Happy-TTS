import { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { isSuperAdmin } from '../../utils/rbac';
import MediaToolConfigSection from './MediaToolConfigSection';

export default function SelfContainedMediaToolConfigSection() {
  const { user } = useAuth();
  const canWrite = isSuperAdmin(user?.role);
  const [isOpen, setIsOpen] = useState(false);
  return (
    <MediaToolConfigSection
      isOpen={isOpen}
      onToggle={() => setIsOpen((v) => !v)}
      loading={false}
      onRefresh={() => {}}
      disabled={!canWrite}
    />
  );
}
