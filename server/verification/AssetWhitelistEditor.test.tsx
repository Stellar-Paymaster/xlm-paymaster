import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import { AssetWhitelistEditor } from './AssetWhitelistEditor';
import crypto from 'node:crypto';

// Polyfill crypto for randomUUID in Node.js test environment
if (!global.crypto) {
  (global as any).crypto = {
    randomUUID: () => crypto.randomUUID()
  };
}

describe('AssetWhitelistEditor Component', () => {
  beforeEach(() => {
    cleanup();
  });

  it('renders initial assets (USDC and XLM)', () => {
    render(<AssetWhitelistEditor />);
    assert.ok(screen.getByText('USDC'));
    assert.ok(screen.getByText('XLM'));
  });

  it('adds a new asset correctly', () => {
    render(<AssetWhitelistEditor />);
    
    const codeInput = screen.getByLabelText('Asset Code');
    const issuerInput = screen.getByLabelText('Issuer Public Key');
    const addButton = screen.getByText('Add Asset');

    fireEvent.change(codeInput, { target: { value: 'EURC' } });
    fireEvent.change(issuerInput, { target: { value: 'GABC123' } });
    fireEvent.click(addButton);

    assert.ok(screen.getByText('EURC'));
    assert.ok(screen.getByText('GABC123'));
  });

  it('shows error when asset code is missing', () => {
    render(<AssetWhitelistEditor />);
    const addButton = screen.getByText('Add Asset');
    
    fireEvent.click(addButton);
    assert.ok(screen.getByText('Asset code is required.'));
  });

  it('prevents adding duplicate assets', () => {
    render(<AssetWhitelistEditor />);
    
    const codeInput = screen.getByLabelText('Asset Code');
    const addButton = screen.getByText('Add Asset');

    fireEvent.change(codeInput, { target: { value: 'XLM' } });
    fireEvent.click(addButton);

    assert.ok(screen.getByText('This asset is already in the whitelist.'));
  });

  it('removes an asset when remove button is clicked', () => {
    render(<AssetWhitelistEditor />);
    
    const removeButtons = screen.getAllByLabelText(/Remove/);
    fireEvent.click(removeButtons[0]); // Remove USDC

    const isUsdcPresent = screen.queryByText('USDC');
    assert.equal(isUsdcPresent, null);
  });

  it('toggles sponsorship status', () => {
    render(<AssetWhitelistEditor />);
    
    const toggleCheckbox = screen.getByLabelText('Toggle sponsorship for XLM') as HTMLInputElement;
    assert.equal(toggleCheckbox.checked, false);

    fireEvent.click(toggleCheckbox);
    assert.equal(toggleCheckbox.checked, true);
  });
});