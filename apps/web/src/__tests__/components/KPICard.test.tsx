/**
 * KPICard Component Tests
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { KPICard, KPIGrid } from '../../components/widgets/KPICard';

const mockKPICardProps = {
  label: 'Total Products',
  value: 1250,
  unit: 'items',
  trend: {
    direction: 'up' as const,
    percent: 12.5,
    period: 'vs last month',
  },
  sparkline: [100, 120, 115, 130, 125, 140, 135],
  color: 'blue' as const,
};

describe('KPICard', () => {
  it('renders with label and value', () => {
    render(<KPICard {...mockKPICardProps} />);

    expect(screen.getByText('Total Products')).toBeInTheDocument();
    expect(screen.getByText('1,250')).toBeInTheDocument();
  });

  it('renders with unit when provided', () => {
    render(<KPICard {...mockKPICardProps} />);

    expect(screen.getByText('items')).toBeInTheDocument();
  });

  it('displays trend information', () => {
    render(<KPICard {...mockKPICardProps} />);

    expect(screen.getByText('12.5%')).toBeInTheDocument();
    expect(screen.getByText('vs last month')).toBeInTheDocument();
  });

  it('shows upward trend indicator for positive trend', () => {
    render(<KPICard {...mockKPICardProps} />);

    // The TrendingUp icon should be present
    const container = document.querySelector('.text-green-600');
    expect(container).toBeInTheDocument();
  });

  it('shows downward trend indicator for negative trend', () => {
    const downTrendProps = {
      ...mockKPICardProps,
      trend: {
        direction: 'down' as const,
        percent: -5.2,
        period: 'vs last week',
      },
    };

    render(<KPICard {...downTrendProps} />);

    const container = document.querySelector('.text-red-600');
    expect(container).toBeInTheDocument();
  });

  it('renders clickable when onClick is provided', () => {
    const handleClick = vi.fn();
    render(<KPICard {...mockKPICardProps} onClick={handleClick} />);

    // The cursor-pointer class is on the outer wrapper with rounded-lg
    const card = document.querySelector('.rounded-lg.cursor-pointer');
    expect(card).toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    const handleClick = vi.fn();
    render(<KPICard {...mockKPICardProps} onClick={handleClick} />);

    const card = screen.getByText('Total Products').closest('div')?.parentElement;
    if (card) {
      fireEvent.click(card);
      expect(handleClick).toHaveBeenCalledTimes(1);
    }
  });

  it('applies correct color theme', () => {
    const { rerender } = render(<KPICard {...mockKPICardProps} color="blue" />);
    expect(document.querySelector('.bg-blue-50')).toBeInTheDocument();

    rerender(<KPICard {...mockKPICardProps} color="green" />);
    expect(document.querySelector('.bg-emerald-50')).toBeInTheDocument();

    rerender(<KPICard {...mockKPICardProps} color="amber" />);
    expect(document.querySelector('.bg-amber-50')).toBeInTheDocument();

    rerender(<KPICard {...mockKPICardProps} color="red" />);
    expect(document.querySelector('.bg-red-50')).toBeInTheDocument();
  });

  it('renders sparkline SVG', () => {
    render(<KPICard {...mockKPICardProps} />);

    const svg = document.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('formats large numbers with locale string', () => {
    const largeValueProps = {
      ...mockKPICardProps,
      value: 1234567,
    };

    render(<KPICard {...largeValueProps} />);

    // Should be formatted as 1,234,567
    expect(screen.getByText('1,234,567')).toBeInTheDocument();
  });
});

describe('KPIGrid', () => {
  const mockCards = [
    { ...mockKPICardProps, label: 'Card 1', value: 100 },
    { ...mockKPICardProps, label: 'Card 2', value: 200 },
    { ...mockKPICardProps, label: 'Card 3', value: 300 },
    { ...mockKPICardProps, label: 'Card 4', value: 400 },
  ];

  it('renders all cards in grid', () => {
    render(<KPIGrid cards={mockCards} />);

    expect(screen.getByText('Card 1')).toBeInTheDocument();
    expect(screen.getByText('Card 2')).toBeInTheDocument();
    expect(screen.getByText('Card 3')).toBeInTheDocument();
    expect(screen.getByText('Card 4')).toBeInTheDocument();
  });

  it('applies grid layout classes', () => {
    const { container } = render(<KPIGrid cards={mockCards} />);

    const grid = container.firstChild;
    expect(grid).toHaveClass('grid');
    expect(grid).toHaveClass('grid-cols-1');
    expect(grid).toHaveClass('sm:grid-cols-2');
    expect(grid).toHaveClass('lg:grid-cols-4');
  });

  it('renders correct number of cards', () => {
    const { container } = render(<KPIGrid cards={mockCards} />);

    const cards = container.querySelectorAll('.rounded-lg');
    expect(cards.length).toBe(4);
  });
});
