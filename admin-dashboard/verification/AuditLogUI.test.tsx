import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import { AuditLogUI } from './AuditLogUI';

describe('AuditLogUI Component', () => {
  beforeEach(() => {
    cleanup();
  });

  it('renders all initial logs', () => {
    render(<AuditLogUI />);
    assert.ok(screen.getByText('admin@fluid.dev'));
    assert.ok(screen.getByText('operator@fluid.dev'));
    assert.ok(screen.getByText('system'));
  });

  it('filters logs by search term (actor)', () => {
    render(<AuditLogUI />);
    const searchInput = screen.getByLabelText('Search Audit Logs');
    
    fireEvent.change(searchInput, { target: { value: 'operator' } });
    
    assert.ok(screen.getByText('operator@fluid.dev'));
    assert.equal(screen.queryByText('system'), null);
  });

  it('filters logs by search term (details)', () => {
    render(<AuditLogUI />);
    const searchInput = screen.getByLabelText('Search Audit Logs');
    
    fireEvent.change(searchInput, { target: { value: 'fee config' } });
    
    assert.ok(screen.getByText('Updated fee config'));
    assert.equal(screen.queryByText('Successful login'), null);
  });

  it('filters logs by action', () => {
    render(<AuditLogUI />);
    const actionSelect = screen.getByLabelText('Filter by Action');
    
    fireEvent.change(actionSelect, { target: { value: 'ADD_ASSET' } });
    
    assert.ok(screen.getByText('ADD_ASSET'));
    assert.equal(screen.queryByText('LOGIN'), null);
    assert.equal(screen.queryByText('SYNC'), null);
  });

  it('filters logs by time range', () => {
    render(<AuditLogUI />);
    const timeSelect = screen.getByLabelText('Filter by Time Range');
    
    fireEvent.change(timeSelect, { target: { value: '24H' } });
    assert.ok(screen.getByText('Successful login'));
    assert.ok(screen.getByText('Added EURC to whitelist'));
    
    // System sync log on May 13 should be excluded for 24H relative to May 15
    assert.equal(screen.queryByText('Ledger sync completed'), null);
  });

  it('shows empty state when no logs match', () => {
    render(<AuditLogUI />);
    const searchInput = screen.getByLabelText('Search Audit Logs');
    
    fireEvent.change(searchInput, { target: { value: 'nonexistentstring123' } });
    
    assert.ok(screen.getByText('No audit logs match the current filters.'));
  });
});