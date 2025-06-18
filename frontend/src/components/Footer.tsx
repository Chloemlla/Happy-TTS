import React from 'react';
import { FaGithub } from 'react-icons/fa';

const Footer: React.FC = () => {
  const year = new Date().getFullYear();
  return (
    <footer className="text-center text-gray-500 mt-8 mb-2 text-sm select-none">
      &copy; <a href="https://github.com/Happy-clo" target="_blank" rel="noopener noreferrer" className="ml-1 inline-block align-middle">
        <FaGithub className="inline align-text-bottom" />
      </a> Individual Developer Happy-clo {year}
    </footer>
  );
};

export default Footer; 