import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { CognitoUserPool, CognitoUser, AuthenticationDetails } from 'amazon-cognito-identity-js';
import './App.css';

const API = 'https://bs5pfqng09.execute-api.us-east-1.amazonaws.com/prod';
const poolData = {
  UserPoolId: 'us-east-1_VMOL6Bepu',
  ClientId: '2lcc30bftsbgmgsun8gqogn1r2'
};
const userPool = new CognitoUserPool(poolData);

function App() {
  const [user, setUser] = useState(null);
  const [authMode, setAuthMode] = useState('login');
  const [authForm, setAuthForm] = useState({ email: '', password: '', code: '' });
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ name: '', description: '' });
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const current = userPool.getCurrentUser();
    if (current) {
      current.getSession((err, session) => {
        if (!err && session.isValid()) setUser(current);
      });
    }
  }, []);

  useEffect(() => { if (user) fetchItems(); }, [user]);

  const fetchItems = async () => {
    try {
      const res = await axios.get(`${API}/items`);
      setItems(res.data.items || []);
    } catch (e) { setStatus('❌ Failed to fetch items'); }
  };

  const handleSignup = () => {
    setLoading(true);
    userPool.signUp(authForm.email, authForm.password, [], null, (err, result) => {
      setLoading(false);
      if (err) return setStatus(`❌ ${err.message}`);
      setStatus('✅ Signup successful! Check email for verification code.');
      setAuthMode('verify');
    });
  };

  const handleVerify = () => {
    const cognitoUser = new CognitoUser({ Username: authForm.email, Pool: userPool });
    cognitoUser.confirmRegistration(authForm.code, true, (err) => {
      if (err) return setStatus(`❌ ${err.message}`);
      setStatus('✅ Verified! Please login.');
      setAuthMode('login');
    });
  };

  const handleLogin = () => {
    setLoading(true);
    const authDetails = new AuthenticationDetails({ Username: authForm.email, Password: authForm.password });
    const cognitoUser = new CognitoUser({ Username: authForm.email, Pool: userPool });
    cognitoUser.authenticateUser(authDetails, {
      onSuccess: () => { setLoading(false); setUser(cognitoUser); setStatus(''); },
      onFailure: (err) => { setLoading(false); setStatus(`❌ ${err.message}`); }
    });
  };

  const handleLogout = () => {
    userPool.getCurrentUser()?.signOut();
    setUser(null); setItems([]);
  };

  const handleSubmit = async () => {
    if (!form.name) return setStatus('⚠️ Name is required');
    setLoading(true);
    try {
      await axios.post(`${API}/items`, form);
      setStatus('✅ Item created');
      setForm({ name: '', description: '' });
      fetchItems();
    } catch (e) { setStatus('❌ Error creating item'); }
    setLoading(false);
  };

  const handleUpload = async () => {
    if (!file) return setStatus('⚠️ Select a file first');
    setLoading(true);
    try {
      const res = await axios.post(`${API}/upload`, { filename: file.name, contentType: file.type });
      await axios.put(res.data.uploadUrl, file, { headers: { 'Content-Type': file.type } });
      setStatus(`✅ Uploaded: ${file.name}`);
    } catch (e) { setStatus('❌ Upload failed'); }
    setLoading(false);
  };

  if (!user) return (
    <div className="app">
      <header>
        <h1>☁️ CloudApp</h1>
        <p>AWS Cloud-Native Demo — DynamoDB · S3 · Lambda · Cognito</p>
      </header>
      <div className="card">
        <h2>{authMode === 'login' ? 'Login' : authMode === 'signup' ? 'Sign Up' : 'Verify Email'}</h2>
        <input placeholder="Email" value={authForm.email}
          onChange={e => setAuthForm({ ...authForm, email: e.target.value })} />
        {authMode !== 'verify' && <input placeholder="Password" type="password" value={authForm.password}
          onChange={e => setAuthForm({ ...authForm, password: e.target.value })} />}
        {authMode === 'verify' && <input placeholder="Verification Code" value={authForm.code}
          onChange={e => setAuthForm({ ...authForm, code: e.target.value })} />}
        {authMode === 'login' && <button onClick={handleLogin} disabled={loading}>{loading ? '...' : 'Login'}</button>}
        {authMode === 'signup' && <button onClick={handleSignup} disabled={loading}>{loading ? '...' : 'Sign Up'}</button>}
        {authMode === 'verify' && <button onClick={handleVerify}>Verify</button>}
        <p style={{marginTop:'1rem', fontSize:'0.85rem', color:'#718096'}}>
          {authMode === 'login' ? <span>No account? <span className="link" onClick={() => setAuthMode('signup')}>Sign Up</span></span>
            : <span>Have account? <span className="link" onClick={() => setAuthMode('login')}>Login</span></span>}
        </p>
        {status && <div className="status">{status}</div>}
      </div>
    </div>
  );

  return (
    <div className="app">
      <header>
        <h1>☁️ CloudApp</h1>
        <p>Logged in as <strong>{user.getUsername()}</strong> &nbsp;
          <span className="link" onClick={handleLogout}>[Logout]</span></p>
      </header>

      <section className="card">
        <h2>Add Item</h2>
        <input placeholder="Name" value={form.name}
          onChange={e => setForm({ ...form, name: e.target.value })} />
        <input placeholder="Description" value={form.description}
          onChange={e => setForm({ ...form, description: e.target.value })} />
        <button onClick={handleSubmit} disabled={loading}>{loading ? 'Saving...' : 'Save to DynamoDB'}</button>
      </section>

      <section className="card">
        <h2>Upload File</h2>
        <input type="file" onChange={e => setFile(e.target.files[0])} />
        <button onClick={handleUpload} disabled={loading}>{loading ? 'Uploading...' : 'Upload to S3'}</button>
      </section>

      {status && <div className="status">{status}</div>}

      <section className="card">
        <h2>Items ({items.length})</h2>
        {items.length === 0 ? <p className="empty">No items yet.</p> :
          items.map(item => (
            <div key={item.id} className="item">
              <strong>{item.name}</strong><span>{item.description}</span>
            </div>
          ))}
        <button onClick={fetchItems}>↻ Refresh</button>
      </section>
    </div>
  );
}

export default App;
