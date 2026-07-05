import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ApiError } from '../lib/api';

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await register({ email, password, fullName, organizationName });
      navigate('/orgs');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-void text-text-primary px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 mb-8 justify-center">
          <svg width="24" height="24" viewBox="0 0 32 32">
            <rect width="32" height="32" rx="7" fill="#12161F" />
            <path d="M6 20 L11 20 L13 14 L16 24 L19 11 L21 20 L26 20" stroke="#5B8DEF" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-lg font-semibold tracking-tight">Forge</span>
        </div>

        <form onSubmit={handleSubmit} className="bg-surface border border-border-hair rounded-xl p-6 space-y-4">
          <h1 className="text-base font-medium">Create your account</h1>

          {error && <p className="text-sm text-signal-red bg-signal-red/10 rounded-md px-3 py-2">{error}</p>}

          <div>
            <label className="block text-xs text-text-muted mb-1">Full name</label>
            <input
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full bg-void border border-border-hair rounded-md px-3 py-2 text-sm focus:border-signal-blue outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">Organization name</label>
            <input
              required
              value={organizationName}
              onChange={(e) => setOrganizationName(e.target.value)}
              className="w-full bg-void border border-border-hair rounded-md px-3 py-2 text-sm focus:border-signal-blue outline-none"
              placeholder="Acme Corp"
            />
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-void border border-border-hair rounded-md px-3 py-2 text-sm focus:border-signal-blue outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">Password</label>
            <input
              type="password"
              required
              minLength={10}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-void border border-border-hair rounded-md px-3 py-2 text-sm focus:border-signal-blue outline-none"
              placeholder="At least 10 characters"
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-signal-blue text-void font-medium rounded-md py-2 text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {submitting ? 'Creating account…' : 'Create account'}
          </button>
          <p className="text-xs text-text-muted text-center">
            Already have an account?{' '}
            <Link to="/login" className="text-signal-blue hover:underline">
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
