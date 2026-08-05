import React from 'react';

interface InfoBoxProps {
  icon: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

const InfoBox: React.FC<InfoBoxProps> = ({ icon, children, className = '' }) => (
  <div className={`rounded-2xl border border-amber-200 bg-amber-50/70 px-5 py-4 text-xs leading-5 text-amber-900 ${className}`}>
    <div className="flex items-start gap-2">
      <div className="mt-0.5 shrink-0 [&>svg]:w-4 [&>svg]:h-4 [&>svg]:text-amber-700">{icon}</div>
      <div>{children}</div>
    </div>
  </div>
);

export default InfoBox;