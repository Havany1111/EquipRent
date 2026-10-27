import { useState } from 'react';
import type { UserProfile, UserRole } from '../types/database';
import { loginWithEmail, signUpWithProfile } from '../services/authService';
import { isSupabaseConfigured } from '../lib/supabase';

interface AuthScreenProps {
  onAuthenticated: (profile: UserProfile) => void;
}

export function AuthScreen({ onAuthenticated }: AuthScreenProps) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [selectedRole, setSelectedRole] = useState<UserRole>('customer');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [companyName, setCompanyName] = useState('');

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [infoMsg, setInfoMsg] = useState('');

  const handleQuickFill = (role: UserRole) => {
    setSelectedRole(role);
    if (role === 'customer') {
      setEmail('jordan.miller@buildcorp.com');
      setPassword('EquipRent2026!');
      setFullName('Jordan Miller');
      setPhone('+1-555-0103');
      setCompanyName('Apex Construction LLC');
    } else if (role === 'staff') {
      setEmail('marcus.tech@equiprent.com');
      setPassword('EquipRent2026!');
      setFullName('Marcus Vance');
      setPhone('+1-555-0102');
      setCompanyName('EquipRent Operations');
    } else {
      setEmail('admin@equiprent.com');
      setPassword('EquipRent2026!');
      setFullName('Alex Morgan');
      setPhone('+1-555-0101');
      setCompanyName('EquipRent Headquarters');
    }
    setErrorMsg('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setInfoMsg('');
    setLoading(true);

    try {
      if (mode === 'login') {
        const { profile } = await loginWithEmail(email, password);
        onAuthenticated(profile);
      } else {
        if (!fullName.trim()) throw new Error('Please enter your full name.');
        if (!password || password.length < 6)
          throw new Error('Password must be at least 6 characters.');

        const res = await signUpWithProfile({
          email,
          password,
          fullName,
          phone: phone || '+1-555-0199',
          companyName: companyName || 'Enterprise Partner',
          role: selectedRole,
        });

        if (res.message) setInfoMsg(res.message);
        onAuthenticated(res.profile);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Authentication failed';
      setErrorMsg(msg);
      if (mode === 'login' && msg.toLowerCase().includes('account does not exist')) {
        setInfoMsg('💡 Click "Create an account first" below to register this role in Supabase.');
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
            <div className="brand-circle-logo">E</div>
            <span className="brand-name">Equip<span>Rent</span></span>
          </div>
          <h1 className="auth-finset-title">{mode === 'login' ? 'Welcome back!' : 'Create your account'}</h1>
          <p className="auth-finset-sub">Select your operational tier to sign in or register with Supabase</p>
        </div>

        {/* ROLE SELECTION */}
        <div style={{ marginBottom: 18 }}>
          <div className="auth-roles-grid-finset">
            <button
              type="button"
              className={`auth-role-card-finset ${selectedRole === 'customer' ? 'active' : ''}`}
              onClick={() => {
                setSelectedRole('customer');
                setErrorMsg('');
              }}
            >
              <strong>Customer</strong>
              <small>Browse &amp; rent fleet</small>
            </button>

            <button
              type="button"
              className={`auth-role-card-finset ${selectedRole === 'staff' ? 'active' : ''}`}
              onClick={() => {
                setSelectedRole('staff');
                setErrorMsg('');
              }}
            >
              <strong>Staff / Tech</strong>
              <small>Dispatches &amp; checks</small>
            </button>

            <button
              type="button"
              className={`auth-role-card-finset ${selectedRole === 'admin' ? 'active' : ''}`}
              onClick={() => {
                setSelectedRole('admin');
                setErrorMsg('');
              }}
            >
              <strong>Admin / DBA</strong>
              <small>Audits &amp; stress tests</small>
            </button>
          </div>
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

        {/* QUICK FILL PRESETS */}
        <div className="quick-presets-finset">
          <span>Quick fill:</span>
          <button type="button" className="quick-preset-chip" onClick={() => handleQuickFill('customer')}>
            Jordan (Customer)
          </button>
          <button type="button" className="quick-preset-chip" onClick={() => handleQuickFill('staff')}>
            Marcus (Staff)
          </button>
          <button type="button" className="quick-preset-chip" onClick={() => handleQuickFill('admin')}>
            Alex (Admin)
          </button>
        </div>

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
          {mode === 'signup' && (
            <>
              <div className="form-group">
                <label>Full Legal Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Jordan Miller"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Contact Phone</label>
                  <input
                    type="tel"
                    placeholder="+1-555-0103"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Company / Organization</label>
                  <input
                    type="text"
                    placeholder="Apex Construction LLC"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                  />
                </div>
              </div>
            </>
          )}

          <div className="form-group">
            <label>Email Address</label>
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

          <button type="submit" className="auth-submit-purple" disabled={loading}>
            {loading ? (
              'Connecting to Supabase...'
            ) : mode === 'login' ? (
              `Sign In as ${selectedRole.toUpperCase()}`
            ) : (
              `Create ${selectedRole.toUpperCase()} Account`
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
          <div style={{ marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 20, background: '#f3f4f6', fontSize: 11, fontWeight: 600, color: '#4b5563' }}>
            <span>{isSupabaseConfigured ? '🟢 Live Supabase PostgreSQL Connected' : '🟡 Local Mode'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
