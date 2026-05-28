import React, { useEffect } from 'react';
import { FaExternalLinkAlt } from 'react-icons/fa';

const API_DOCS_URL = 'https://tts.chloemlla.com/api-docs/';

const normalizePath = (pathname: string) => pathname.replace(/\/+$/, '');

const ApiDocs: React.FC = () => {
  useEffect(() => {
    const targetUrl = new URL(API_DOCS_URL);

    if (
      window.location.origin !== targetUrl.origin
      || normalizePath(window.location.pathname) !== normalizePath(targetUrl.pathname)
    ) {
      window.location.replace(API_DOCS_URL);
    }
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12 text-slate-950">
      <section className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-6 text-center shadow-sm">
        <h1 className="text-2xl font-semibold">API Docs</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          API documentation is available at the official endpoint.
        </p>
        <a
          className="mt-6 inline-flex items-center justify-center gap-2 rounded-lg bg-sky-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-sky-800"
          href={API_DOCS_URL}
          rel="noopener noreferrer"
        >
          <FaExternalLinkAlt aria-hidden="true" />
          Open API Docs
        </a>
      </section>
    </main>
  );
};

export default ApiDocs;
