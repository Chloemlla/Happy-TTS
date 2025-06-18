import React from 'react';

const Footer: React.FC = () => {
  const year = new Date().getFullYear();
  return (
    <footer className="text-center text-gray-500 mt-8 mb-2 text-sm select-none">
      &copy; <a href="https://github.com/Happy-clo" target="_blank" rel="noopener noreferrer" className="ml-1">
        <i className="fab fa-github"></i>
      </a> Individual Developer Happy-clo {year}
    </footer>
  );
};

export default Footer; 