import React from 'react';

const Footer: React.FC = () => {
  const year = new Date().getFullYear();
  return (
    <footer className="text-center text-gray-500 mt-8 mb-2 text-sm select-none">
      Copyright ©{' '}
      <a 
        href="https://github.com/Happy-clo" 
        target="_blank" 
        rel="noopener noreferrer" 
        className="hover:text-blue-500 transition-colors duration-200"
      >
        Individual Developer Happy-clo
      </a>{' '}
      {year}
    </footer>
  );
};

export default Footer; 