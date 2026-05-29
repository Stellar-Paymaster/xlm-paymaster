import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import { CustomizableDashboardLayouts } from './CustomizableDashboardLayouts';

describe('CustomizableDashboardLayouts Component', () => {
  let localStorageMock: Record<string, string> = {};

  beforeEach(() => {
    cleanup();
    localStorageMock = {};
    global.localStorage = {
      getItem: (key: string) => localStorageMock[key] || null,
      setItem: (key: string, value: string) => { localStorageMock[key] = value.toString(); },
      removeItem: (key: string) => { delete localStorageMock[key]; },
      clear: () => { localStorageMock = {}; },
      length: 0,
      key: () => null
    } as any;
  });

  afterEach(() => {
    cleanup();
  });

  it('renders default widgets when no layout is saved', () => {
    render(<CustomizableDashboardLayouts />);
    assert.ok(screen.getByText('System Overview'));
    assert.ok(screen.getByText('Recent Activity'));
    assert.ok(screen.getByText('Asset Status'));
    assert.ok(screen.getByText('Quick Actions'));
  });

  it('loads saved layout from localStorage', () => {
    const customLayout = [
      { id: 'w-4', title: 'Quick Actions', content: 'Add Asset | Invite User' },
      { id: 'w-1', title: 'System Overview', content: 'CPU: 45% | Mem: 2GB' },
    ];
    localStorageMock['fluid-dashboard-layout'] = JSON.stringify(customLayout);

    render(<CustomizableDashboardLayouts />);
    
    const titles = screen.getAllByRole('heading', { level: 3 }).map(el => el.textContent);
    assert.equal(titles[0], 'Quick Actions');
    assert.equal(titles[1], 'System Overview');
    assert.equal(titles.length, 2);
  });

  it('resets to default layout', () => {
    const customLayout = [{ id: 'w-4', title: 'Quick Actions', content: 'Add Asset | Invite User' }];
    localStorageMock['fluid-dashboard-layout'] = JSON.stringify(customLayout);

    render(<CustomizableDashboardLayouts />);
    assert.equal(screen.getAllByRole('heading', { level: 3 }).length, 1);

    fireEvent.click(screen.getByLabelText('Reset Layout'));
    assert.equal(screen.getAllByRole('heading', { level: 3 }).length, 4);
  });

  it('handles corrupted localStorage gracefully', () => {
    localStorageMock['fluid-dashboard-layout'] = 'invalid-json';
    render(<CustomizableDashboardLayouts />);
    assert.equal(screen.getAllByRole('heading', { level: 3 }).length, 4);
  });
});