import { nextMatchNumber, roundAbbr, suggestMatchCode, suggestRoundOrder } from '../matchCode';

describe('roundAbbr', () => {
  it('abbreviates common round names', () => {
    expect(roundAbbr('Quarterfinal', 3)).toBe('QF');
    expect(roundAbbr('Semi-finals', 4)).toBe('SF');
    expect(roundAbbr('Round of 16', 2)).toBe('R16');
    expect(roundAbbr('Opening Round', 1)).toBe('O');
    expect(roundAbbr('Final', 5)).toBe('F');
    expect(roundAbbr('3rd Place', 5)).toBe('3RD');
    expect(roundAbbr('Consolation Semifinal', 1)).toBe('CSF');
  });
  it('falls back to a compact name, or the round order', () => {
    expect(roundAbbr('Heat 1', 1)).toBe('HEAT1');
    expect(roundAbbr('185 lb', 1)).toBe('185LB');
    expect(roundAbbr('', 2)).toBe('R2');
    expect(roundAbbr(null, 0)).toBe('R1');
  });
});

describe('suggestMatchCode', () => {
  it('builds event + round + number', () => {
    expect(suggestMatchCode('SOC', 'Quarterfinal', 3, 3, [])).toBe('SOC-QF3');
    expect(suggestMatchCode('SOC', 'Opening Round', 1, 2, [])).toBe('SOC-O2');
    expect(suggestMatchCode('SOC', 'Round of 16', 2, 4, [])).toBe('SOC-R16-4');
    expect(suggestMatchCode('BPT', 'Heat 1', 1, 1, [])).toBe('BPT-HEAT1-1');
  });
  it('drops the number for single-match rounds like the Final', () => {
    expect(suggestMatchCode('SOC', 'Final', 5, 1, [])).toBe('SOC-F');
    expect(suggestMatchCode('SOC', '3rd Place', 5, 1, [])).toBe('SOC-3RD');
    expect(suggestMatchCode('SOC', 'Final', 5, 2, [])).toBe('SOC-F2');
  });
  it('never repeats an existing code', () => {
    expect(suggestMatchCode('SOC', 'Quarterfinal', 3, 1, ['soc-qf1'])).toBe('SOC-QF1-2');
    expect(suggestMatchCode('SOC', 'Final', 5, 1, ['SOC-F', 'SOC-F-2'])).toBe('SOC-F-3');
  });
});

describe('numbers and round order', () => {
  const ms = [
    { stage_id: 's1', round_name: 'Quarterfinal', round_order: 3, match_number: 1 },
    { stage_id: 's1', round_name: 'quarterfinal ', round_order: 3, match_number: 2 },
    { stage_id: 's1', round_name: 'Round of 16', round_order: 2, match_number: 8 },
    { stage_id: 's2', round_name: 'Quarterfinal', round_order: 1, match_number: 7 },
  ];
  it('numbers the next match in the same stage and round', () => {
    expect(nextMatchNumber(ms, 's1', 'Quarterfinal')).toBe(3);
    expect(nextMatchNumber(ms, 's1', 'Semifinal')).toBe(1);
  });
  it('reuses a round order, or puts a new round after the last one', () => {
    expect(suggestRoundOrder(ms, 's1', 'Quarterfinal')).toBe(3);
    expect(suggestRoundOrder(ms, 's1', 'Semifinal')).toBe(4);
    expect(suggestRoundOrder(ms, 's3', 'Anything')).toBe(1);
  });
});
