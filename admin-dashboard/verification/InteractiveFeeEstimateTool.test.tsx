import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import { InteractiveFeeEstimateTool } from './InteractiveFeeEstimateTool';

describe('InteractiveFeeEstimateTool Component', () => {
  beforeEach(() => {
    cleanup();
  });

  it('renders default values correctly', () => {
    render(<InteractiveFeeEstimateTool />);
    
    const totalXlm = screen.getByTestId('total-xlm');
    // baseFee(100) + instructions(2000000 * 0.0001 = 200) + readBytes(4096 * 0.1 = 409.6) + writeBytes(1024 * 0.5 = 512)
    // resourceFee = floor(200 + 409.6 + 512) = 1121
    // baseTotal = 100 + 1121 = 1221
    // totalStroops = floor(1221 * 1.5) = 1831
    // XLM = 1831 / 10,000,000 = 0.0001831
    assert.equal(totalXlm.textContent, '0.0001831 XLM');
  });

  it('recalculates on base fee change', () => {
    render(<InteractiveFeeEstimateTool />);
    
    const baseFeeInput = screen.getByLabelText('Base Network Fee');
    fireEvent.change(baseFeeInput, { target: { value: '1000' } });
    
    // baseFee = 1000
    // baseTotal = 1000 + 1121 = 2121
    // totalStroops = floor(2121 * 1.5) = 3181
    // XLM = 0.0003181
    const totalXlm = screen.getByTestId('total-xlm');
    assert.equal(totalXlm.textContent, '0.0003181 XLM');
  });

  it('recalculates on CPU instructions change', () => {
    render(<InteractiveFeeEstimateTool />);
    
    const cpuInput = screen.getByLabelText('CPU Instructions');
    fireEvent.change(cpuInput, { target: { value: '5000000' } });
    
    // 5000000 * 0.0001 = 500
    // resourceFee = 500 + 409.6 + 512 = 1421
    // baseTotal = 100 + 1421 = 1521
    // totalStroops = floor(1521 * 1.5) = 2281
    const totalXlm = screen.getByTestId('total-xlm');
    assert.equal(totalXlm.textContent, '0.0002281 XLM');
  });

  it('recalculates on surge multiplier change', () => {
    render(<InteractiveFeeEstimateTool />);
    
    const surgeInput = screen.getByLabelText('Surge Multiplier');
    fireEvent.change(surgeInput, { target: { value: '2' } });
    
    // totalStroops = 1221 * 2 = 2442
    const totalXlm = screen.getByTestId('total-xlm');
    assert.equal(totalXlm.textContent, '0.0002442 XLM');
  });

  it('handles invalid inputs gracefully by falling back to 0 or 1', () => {
    render(<InteractiveFeeEstimateTool />);
    
    const baseFeeInput = screen.getByLabelText('Base Network Fee');
    fireEvent.change(baseFeeInput, { target: { value: 'abc' } }); // falls back to 0
    
    const totalXlm = screen.getByTestId('total-xlm');
    // baseTotal = 0 + 1121 = 1121
    // totalStroops = 1121 * 1.5 = 1681
    assert.equal(totalXlm.textContent, '0.0001681 XLM');
  });
});