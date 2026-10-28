import { useState } from 'react';
import type { UserProfile, UserRole } from '../types/database';
import { loginWithEmail, signUpWithProfile, isSupabaseConfigured, logoutUser } from '../lib/supabase';
import { formatPhilippinePhone } from '../lib/formatters';

interface AuthScreenProps {
  onAuthenticated: (profile: UserProfile) => void;
}

export function AuthScreen({ onAuthenticated }: AuthScreenProps) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [selectedRole, setSelectedRole] = useState<UserRole>('customer');

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [infoMsg, setInfoMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setInfoMsg('');
    setLoading(true);

    try {
      if (mode === 'login') {
        const { profile } = await loginWithEmail(email, password);
        if (profile.role !== selectedRole) {
          await logoutUser();
          throw new Error(
            `This account is registered as ${profile.role}. Ask an administrator to update its role before signing in as ${selectedRole}.`
          );
        }
        onAuthenticated(profile);
      } else {
        if (!fullName.trim()) throw new Error('Please enter your full name.');
        if (!password || password.length < 6)
          throw new Error('Password must be at least 6 characters.');

        const res = await signUpWithProfile({
          email,
          password,
          fullName,
          phone: formatPhilippinePhone(phone),
          companyName,
          requestedRole: selectedRole,
        });

        if (res.profile) {
          await logoutUser();
        }
        setMode('login');
        setPassword('');
        setSelectedRole('customer');
        setInfoMsg(`${res.message} Please sign in.`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Authentication failed';
      setErrorMsg(msg);
      if (mode === 'login') {
        const normalizedMessage = msg.toLowerCase();
        if (normalizedMessage.includes('database error querying schema')) {
          setInfoMsg(
            'Check your Supabase project logs and database setup. Do not rerun the full schema script on a project that already contains data.'
          );
        } else if (normalizedMessage.includes('invalid login credentials')) {
          setInfoMsg(
            'Check the email and password, or create a customer account. Staff and admin access must be provisioned by an administrator.'
          );
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-finset-outer">
      <div className="auth-finset-card">
        {/* FinSet-style Circular Brand Header */}
        <div className="auth-finset-header">
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, justifyContent: 'center' }}>
            <span className="brand-name">Equip<span>Rent</span></span>
          </div>
          <h1 className="auth-finset-title">{mode === 'login' ? 'Welcome back!' : 'Create your account'}</h1>
        </div>

        {/* TABS */}
        <div className="auth-tabs-finset">
          <button
            type="button"
            className={`auth-tab-btn-finset ${mode === 'login' ? 'active' : ''}`}
            onClick={() => {
              setMode('login');
              setErrorMsg('');
            }}
          >
            Sign In
          </button>
          <button
            type="button"
            className={`auth-tab-btn-finset ${mode === 'signup' ? 'active' : ''}`}
            onClick={() => {
              setMode('signup');
              setErrorMsg('');
            }}
          >
            Create Account
          </button>
        </div>

        {!isSupabaseConfigured && (
          <div style={{ padding: '10px 14px', borderRadius: 12, background: 'var(--red-bg)', color: 'var(--red-kpi)', fontSize: 12, fontWeight: 600, marginBottom: 14 }}>
            Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local, then restart the app.
          </div>
        )}

        {errorMsg && (
          <div style={{ padding: '10px 14px', borderRadius: 12, background: 'var(--red-bg)', color: 'var(--red-kpi)', fontSize: 12, fontWeight: 600, marginBottom: 14 }}>
            {errorMsg}
          </div>
        )}
        {infoMsg && (
          <div style={{ padding: '10px 14px', borderRadius: 12, background: 'var(--green-bg)', color: 'var(--green-kpi)', fontSize: 12, fontWeight: 600, marginBottom: 14 }}>
            {infoMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form-finset">
          <fieldset className="auth-role-picker">
            <legend>{mode === 'login' ? 'Sign in as' : 'Request a role'}</legend>
            <div className="auth-roles-grid-finset">
              {([
                ['customer', 'Customer'],
                ['staff', 'Staff'],
                ['admin', 'Admin'],
              ] as const).map(([role, label]) => (
                <button
                  key={role}
                  type="button"
                  className={`auth-role-card-finset ${selectedRole === role ? 'active' : ''}`}
                  aria-pressed={selectedRole === role}
                  onClick={() => setSelectedRole(role)}
                >
                  <strong>{label}</strong>
                </button>
              ))}
            </div>
          </fieldset>

          {mode === 'signup' && (
            <>
              <div className="form-group">
                <label>Full Name</label>
                <input
                  type="text"
                  required
                  placeholder="Your full name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Phone</label>
                  <input
                    type="tel"
                    required
                    autoComplete="tel"
                    inputMode="tel"
                    maxLength={16}
                    placeholder="+63 912 345 6789"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    onBlur={() => setPhone((value) => formatPhilippinePhone(value))}
                  />
                </div>
                <div className="form-group">
                  <label>Company</label>
                  <input
                    type="text"
                    placeholder="Optional"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                  />
                </div>
              </div>
            </>
          )}

          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              required
              placeholder="user@equiprent.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              required
              placeholder="••••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button type="submit" className="auth-submit-purple" disabled={loading || !isSupabaseConfigured}>
            {loading ? (
              'Signing in...'
            ) : mode === 'login' ? (
              'Sign In'
            ) : (
              'Create Account'
            )}
          </button>
        </form>

        <div style={{ marginTop: 22, textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
          {mode === 'login' ? (
            <p style={{ margin: 0 }}>
              No account yet?{' '}
              <button
                type="button"
                style={{ background: 'transparent', border: 0, color: 'var(--purple-main)', fontWeight: 700, cursor: 'pointer', padding: 0 }}
                onClick={() => {
                  setMode('signup');
                  setErrorMsg('');
                }}
              >
                Create an account first &rarr;
              </button>
            </p>
          ) : (
            <p style={{ margin: 0 }}>
              Already have an account?{' '}
              <button
                type="button"
                style={{ background: 'transparent', border: 0, color: 'var(--purple-main)', fontWeight: 700, cursor: 'pointer', padding: 0 }}
                onClick={() => {
                  setMode('login');
                  setErrorMsg('');
                }}
              >
                Sign in here &rarr;
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
