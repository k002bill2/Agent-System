import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { HelloWorld } from '../HelloWorld';

describe('HelloWorld Component', () => {
  it('renders with default message', () => {
    render(<HelloWorld />);

    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toBeInTheDocument();
    expect(heading).toHaveTextContent('Hello World');

    const description = screen.getByText('Welcome to the Agent Orchestration Service Dashboard!');
    expect(description).toBeInTheDocument();
  });

  it('renders with custom message', () => {
    const customMessage = 'Hello AOS Dashboard!';
    render(<HelloWorld message={customMessage} />);

    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent(customMessage);
  });

  it('applies custom className', () => {
    const { container } = render(<HelloWorld className="custom-class" />);

    const component = container.firstChild as HTMLElement;
    expect(component).toHaveClass('custom-class');
  });

  it('handles click events when onClick is provided', () => {
    const handleClick = vi.fn();
    render(<HelloWorld onClick={handleClick} />);

    const component = screen.getByRole('button');
    expect(component).toBeInTheDocument();

    fireEvent.click(component);
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('handles keyboard events (Enter key) when onClick is provided', () => {
    const handleClick = vi.fn();
    render(<HelloWorld onClick={handleClick} />);

    const component = screen.getByRole('button');
    fireEvent.keyDown(component, { key: 'Enter' });
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('does not handle keyboard events for other keys', () => {
    const handleClick = vi.fn();
    render(<HelloWorld onClick={handleClick} />);

    const component = screen.getByRole('button');
    fireEvent.keyDown(component, { key: 'Space' });
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('does not render as button when onClick is not provided', () => {
    render(<HelloWorld />);

    const button = screen.queryByRole('button');
    expect(button).not.toBeInTheDocument();
  });

  it('has proper accessibility attributes', () => {
    const message = 'Test Message';
    render(<HelloWorld message={message} />);

    const component = screen.getByLabelText(message);
    expect(component).toBeInTheDocument();
  });

  it('has proper accessibility attributes for interactive component', () => {
    const message = 'Test Message';
    const handleClick = vi.fn();
    render(<HelloWorld message={message} onClick={handleClick} />);

    const component = screen.getByLabelText(`Click to interact: ${message}`);
    expect(component).toBeInTheDocument();
    expect(component).toHaveAttribute('tabIndex', '0');
  });

  it('applies dark mode classes correctly', () => {
    const { container } = render(<HelloWorld />);

    const component = container.firstChild as HTMLElement;
    expect(component).toHaveClass('dark:bg-gray-800');
    expect(component).toHaveClass('dark:border-gray-700');

    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveClass('dark:text-gray-100');

    const description = screen.getByText('Welcome to the Agent Orchestration Service Dashboard!');
    expect(description).toHaveClass('dark:text-gray-400');
  });

  it('applies hover and focus styles when interactive', () => {
    const handleClick = vi.fn();
    const { container } = render(<HelloWorld onClick={handleClick} />);

    const component = container.firstChild as HTMLElement;
    expect(component).toHaveClass('cursor-pointer');
    expect(component).toHaveClass('hover:shadow-md');
    expect(component).toHaveClass('transition-shadow');
    expect(component).toHaveClass('focus:ring-2');
    expect(component).toHaveClass('focus:ring-blue-500');
  });
});