import { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { isSuperAdmin } from '../../utils/rbac';
import ProjectLumenConfigSection from './ProjectLumenConfigSection';

export default function SelfContainedProjectLumenConfigSection() {
  const [isOpen, setIsOpen] = useState(false);
  const { user } = useAuth();
  const canWrite = isSuperAdmin(user?.role);
  return (
    <ProjectLumenConfigSection
      isOpen={isOpen}
      onToggle={() => setIsOpen((v) => !v)}
      loading={false}
      onRefresh={() => {}}
      disabled={!canWrite}
    />
  );
}
