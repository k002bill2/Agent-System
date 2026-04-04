import { memo } from 'react';
import { cn } from '@/lib/utils';

interface HelloWorldProps {
  /** Custom message to display */
  message?: string;
  /** Additional CSS classes */
  className?: string;
  /** Optional click handler */
  onClick?: () => void;
}

export const HelloWorld: React.FC<HelloWorldProps> = memo(({
  message = 'Hello World',
  className,
  onClick,
}) => {
  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => e.key === 'Enter' && onClick?.()}
      aria-label={onClick ? `Click to interact: ${message}` : message}
      className={cn(
        'p-4 text-center bg-white rounded-lg shadow-sm border border-gray-200',
        'dark:bg-gray-800 dark:border-gray-700',
        onClick && 'cursor-pointer hover:shadow-md transition-shadow focus:ring-2 focus:ring-blue-500',
        className
      )}
    >
      <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-gray-100">
        {message}
      </h1>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
        Welcome to the Agent Orchestration Service Dashboard!
      </p>
    </div>
  );
});

HelloWorld.displayName = 'HelloWorld';