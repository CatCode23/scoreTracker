import { displayLogin, isUsernameAccount, isValidLogin, toLoginEmail } from '../username';

describe('username sign-in', () => {
  it('turns a plain username into the account email', () => {
    expect(toLoginEmail('jsmith')).toBe('jsmith@wotb.local');
    expect(toLoginEmail('  JSmith ')).toBe('jsmith@wotb.local');
    expect(toLoginEmail('j.smith-2')).toBe('j.smith-2@wotb.local');
  });
  it('leaves real email addresses alone (lower-cased)', () => {
    expect(toLoginEmail('Andrew@Example.com')).toBe('andrew@example.com');
  });
  it('validates usernames and emails', () => {
    expect(isValidLogin('jsmith')).toBe(true);
    expect(isValidLogin('a@b.co')).toBe(true);
    expect(isValidLogin('j')).toBe(false);
    expect(isValidLogin('j smith')).toBe(false);
    expect(isValidLogin('jsmith!')).toBe(false);
    expect(isValidLogin('not@an-email')).toBe(false);
  });
  it('shows username accounts by their username', () => {
    expect(displayLogin('jsmith@wotb.local')).toBe('jsmith');
    expect(displayLogin('andrew@example.com')).toBe('andrew@example.com');
    expect(displayLogin(null)).toBe('');
    expect(isUsernameAccount('jsmith@wotb.local')).toBe(true);
    expect(isUsernameAccount('andrew@example.com')).toBe(false);
  });
});
