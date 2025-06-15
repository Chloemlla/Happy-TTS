import React, { useState } from 'react';
import { motion } from 'framer-motion';
import axios from 'axios';

const TTSForm = () => {
  const [text, setText] = useState('');
  const [voice, setVoice] = useState('nova');
  const [loading, setLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState('');

  const voices = [
    { id: 'alloy', name: 'Alloy' },
    { id: 'echo', name: 'Echo' },
    { id: 'fable', name: 'Fable' },
    { id: 'onyx', name: 'Onyx' },
    { id: 'nova', name: 'Nova' },
    { id: 'shimmer', name: 'Shimmer' }
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await axios.post('http://localhost:3000/api/tts', {
        text,
        voice,
        model: 'tts-1-hd',
        outputFormat: 'mp3',
        speed: 1.0
      });

      setAudioUrl(response.data.audioUrl);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-xl"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Text to Convert
          </label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            rows={4}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Voice
          </label>
          <select
            value={voice}
            onChange={(e) => setVoice(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
          >
            {voices.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </div>

        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          type="submit"
          disabled={loading}
          className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        >
          {loading ? 'Converting...' : 'Convert to Speech'}
        </motion.button>
      </form>

      {audioUrl && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-6"
        >
          <audio controls className="w-full">
            <source src={audioUrl} type="audio/mpeg" />
            Your browser does not support the audio element.
          </audio>
        </motion.div>
      )}
    </motion.div>
  );
};

export default TTSForm; 