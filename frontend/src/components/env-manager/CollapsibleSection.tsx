import React from 'react';
import { m } from 'framer-motion';
import { FaChevronDown } from 'react-icons/fa';
import { DURATION_06, ENTER_ANIMATE, ENTER_INITIAL, NO_DURATION } from './motion';

interface CollapsibleSectionProps {
  title: string;
  sectionKey: string;
  isOpen: boolean;
  onToggle: (key: string) => void;
  children: React.ReactNode;
  headerRight?: React.ReactNode;
  prefersReducedMotion?: boolean | null;
}

const CollapsibleSection = React.memo(function CollapsibleSection({
  title, sectionKey, isOpen, onToggle, children, headerRight, prefersReducedMotion
}: CollapsibleSectionProps) {
  return (
    <m.div
      className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden"
      initial={ENTER_INITIAL}
      animate={ENTER_ANIMATE}
      transition={prefersReducedMotion ? NO_DURATION : DURATION_06}
    >
      <button
        type="button"
        onClick={() => onToggle(sectionKey)}
        className="w-full flex items-center justify-between p-4 sm:p-6 hover:bg-gray-50 transition-colors cursor-pointer"
      >
        <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
        <div className="flex items-center gap-2">
          {headerRight}
          <FaChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </button>
      {isOpen && (
        <div className="px-4 sm:px-6 pb-4 sm:pb-6">
          {children}
        </div>
      )}
    </m.div>
  );
});

export default CollapsibleSection;
