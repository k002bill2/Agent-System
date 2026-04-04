import { useState } from 'react';
import { HelloWorld } from '@/components/HelloWorld';

export function HelloWorldDemo() {
  const [clickCount, setClickCount] = useState(0);
  const [message, setMessage] = useState('Hello World');

  const handleClick = () => {
    setClickCount(prev => prev + 1);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <header>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-4">
            HelloWorld Component Demo
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Testing the HelloWorld component with different configurations
          </p>
        </header>

        {/* Default HelloWorld */}
        <section>
          <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-4">
            Default Component
          </h2>
          <HelloWorld />
        </section>

        {/* Interactive HelloWorld */}
        <section>
          <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-4">
            Interactive Component (Clicked {clickCount} times)
          </h2>
          <HelloWorld
            message="Click me!"
            onClick={handleClick}
            className="max-w-md mx-auto"
          />
        </section>

        {/* Custom Message HelloWorld */}
        <section>
          <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-4">
            Custom Message
          </h2>
          <div className="space-y-4">
            <div>
              <label htmlFor="message" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Custom Message:
              </label>
              <input
                id="message"
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm
                         bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100
                         focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter your message..."
              />
            </div>
            <HelloWorld message={message} className="max-w-lg mx-auto" />
          </div>
        </section>

        {/* Styling Variations */}
        <section>
          <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-4">
            Styling Variations
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <HelloWorld
              message="Blue Theme"
              className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950"
            />
            <HelloWorld
              message="Green Theme"
              className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950"
            />
          </div>
        </section>
      </div>
    </div>
  );
}