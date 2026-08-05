import { useState } from 'react';
import { Mail, Lock, Phone } from 'lucide-react';
import { API_BASE_URL } from '../config';

export default function Login({ setAuth }) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password }),
      });

      if (response.ok) {
        const data = await response.json();
        // Save user to local storage
        localStorage.setItem('auth_token', data.token);
        localStorage.setItem('user_id', data.user_id);
        setAuth({
          token: data.token,
          userId: data.user_id,
        });
      } else {
        const errData = await response.json();
        setError(errData.detail || 'Invalid credentials');
      }
    } catch (err) {
      setError('Could not connect to the server');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <div className="login-header">
          <div className="logo-glow login-logo"></div>
          <h1>NexusAI</h1>
          <p>Login with Email or Mobile</p>
        </div>

        <form onSubmit={handleLogin} className="login-form">
          {error && <div className="login-error">{error}</div>}

          <div className="input-group">
            <div className="input-icon">
              {identifier.includes('@') ? <Mail size={18} /> : <Phone size={18} />}
            </div>
            <input
              type="text"
              placeholder="Email or Mobile Number"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
            />
          </div>

          <div className="input-group">
            <div className="input-icon">
              <Lock size={18} />
            </div>
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button type="submit" className="login-button" disabled={loading}>
            {loading ? 'Authenticating...' : 'Login / Register'}
          </button>
        </form>
      </div>
    </div>
  );
}
