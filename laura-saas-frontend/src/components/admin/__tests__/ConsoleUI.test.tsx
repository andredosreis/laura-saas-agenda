import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KpiCard, PlanDistributionBar } from '../ConsoleUI';

describe('KpiCard', () => {
  it('mostra label e valor', () => {
    render(<KpiCard label="Em Trial" value={3} />);
    expect(screen.getByText('Em Trial')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });
});

describe('PlanDistributionBar', () => {
  it('mostra a legenda com contagens por plano', () => {
    render(<PlanDistributionBar distribution={{ basico: 5, pro: 7, elite: 4, custom: 0 }} />);
    expect(screen.getByText('Distribuição por plano')).toBeInTheDocument();
    expect(screen.getByText('basico')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('mostra estado vazio quando não há tenants', () => {
    render(<PlanDistributionBar distribution={{ basico: 0, pro: 0, elite: 0, custom: 0 }} />);
    expect(screen.getByText('Sem tenants.')).toBeInTheDocument();
  });
});
