import React from 'react';

const Footer: React.FC = () => {
  const year = new Date().getFullYear();
  return (
    <footer className="text-center text-gray-500 mt-8 mb-2 text-sm select-none">
      &copy; Individual Developer Happy-clo
      <a href="https://github.com/Happy-clo" target="_blank" rel="noopener noreferrer" className="ml-2">
        <i className="fab fa-github"></i>
      </a>
      {year}
    </footer>
  );
};

export default Footer; 