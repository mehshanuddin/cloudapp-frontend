import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { CognitoUserPool, CognitoUser, AuthenticationDetails } from 'amazon-cognito-identity-js';
import './App.css';

const API = 'https://bs5pfqng09.execute-api.us-east-1.amazonaws.com/prod';
const poolData = {
  UserPoolId: 'us-east-1_VMOL6Bepu',
  ClientId: '2lcc30bftsbgmgsun8gqogn1r2'
};
const userPool = new CognitoUserPool(poolData);

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(2) + ' ' + sizes[i];
}

function App() {
  const [user, setUser] = useState(null);
  const [authMode, setAuthMode] = useState('login');
  const [authForm, setAuthForm] = useState({ email: '', password: '', code: '' });
  const [items, setItems] = useState([]);
  const [files, setFiles] = useState([]);
  const [form, setForm] = useState({ name: '', description: '' });
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [storage, setStorage] = useState({ usedBytes: 0, limitBytes: 100 * 1024 * 1024, plan: 'free' });
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [showAddItem, setShowAddItem] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [activeTab, setActiveTab] = useState('files');
  const [showUserMenu, setShowUserMenu] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const current = userPool.getCurrentUser();
    if (current) {
      current.getSession((err, session) => {
        if (!err && session.isValid()) setUser(current);
      });
    }
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (user) {
      fetchItems();
      fetchFiles();
      fetchStorage();
    }
  }, [user]);

  const getUserId = () => user ? user.getUsername() : 'anonymous';

  const fetchItems = async () => {
    try {
      const res = await axios.get(API + '/items');
      setItems(res.data.items || []);
    } catch (e) { /* silent */ }
  };

  const fetchFiles = async () => {
    try {
      const res = await axios.get(API + '/files?userId=' + encodeURIComponent(getUserId()));
      setFiles(res.data.files || []);
    } catch (e) { /* silent */ }
  };

  const fetchStorage = async () => {
    try {
      const res = await axios.get(API + '/storage?userId=' + encodeURIComponent(getUserId()));
      setStorage(res.data);
    } catch (e) { /* silent */ }
  };

  const handleSignup = () => {
    setLoading(true);
    userPool.signUp(authForm.email, authForm.password, [], null, (err) => {
      setLoading(false);
      if (err) return setStatus(err.message);
      setStatus('Signup successful! Check email for verification code.');
      setAuthMode('verify');
    });
  };

  const handleVerify = () => {
    const cognitoUser = new CognitoUser({ Username: authForm.email, Pool: userPool });
    cognitoUser.confirmRegistration(authForm.code, true, (err) => {
      if (err) return setStatus(err.message);
      setStatus('Verified! Please login.');
      setAuthMode('login');
    });
  };

  const handleLogin = () => {
    setLoading(true);
    const authDetails = new AuthenticationDetails({ Username: authForm.email, Password: authForm.password });
    const cognitoUser = new CognitoUser({ Username: authForm.email, Pool: userPool });
    cognitoUser.authenticateUser(authDetails, {
      onSuccess: () => { setLoading(false); setUser(cognitoUser); setStatus(''); },
      onFailure: (err) => { setLoading(false); setStatus(err.message); }
    });
  };

  const handleLogout = () => {
    userPool.getCurrentUser() && userPool.getCurrentUser().signOut();
    setUser(null); setItems([]); setFiles([]);
  };

  const handleSubmit = async () => {
    if (!form.name) return setStatus('Name is required');
    setLoading(true);
    try {
      await fetch(API + '/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: form.name, description: form.description })
      });
      setStatus('Item created successfully');
      setForm({ name: '', description: '' });
      setShowAddItem(false);
      fetchItems();
    } catch (e) { setStatus('Error creating item'); }
    setLoading(false);
  };

  const doUploadMultiple = async (fileList) => {
    const filesArr = Array.from(fileList || []);
    if (filesArr.length === 0) return;

    setLoading(true);
    setStatus('Uploading ' + filesArr.length + ' file(s)...');

    let successCount = 0;
    let failCount = 0;
    let upgradeNeeded = false;

    for (const f of filesArr) {
      try {
        const res = await fetch(API + '/upload-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName: f.name,
            fileType: f.type,
            fileSize: f.size,
            userId: getUserId()
          })
        });
        const resData = await res.json();

        if (res.status === 403 && resData.needUpgrade) {
          upgradeNeeded = true;
          failCount++;
          continue;
        }

        await axios.put(resData.uploadUrl, f, { headers: { 'Content-Type': f.type } });

        await fetch(API + '/upload-complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileSize: f.size, userId: getUserId() })
        });
        successCount++;
      } catch (e) {
        failCount++;
      }
    }

    setLoading(false);
    fetchFiles();
    fetchStorage();

    if (upgradeNeeded) {
      setShowUpgrade(true);
      setStatus(successCount + ' uploaded, ' + failCount + ' failed (storage limit reached)');
    } else if (failCount > 0) {
      setStatus(successCount + ' uploaded, ' + failCount + ' failed');
    } else {
      setStatus(successCount + ' file(s) uploaded successfully');
    }
  };

  const handleUpgrade = async () => {
    setLoading(true);
    try {
      await fetch(API + '/upgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: getUserId() })
      });
      setStatus('Upgraded to Pro plan! You now have 5 GB.');
      setShowUpgrade(false);
      fetchStorage();
    } catch (e) { setStatus('Upgrade failed'); }
    setLoading(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    doUploadMultiple(e.dataTransfer.files);
  };

  const percentUsed = Math.min(100, (storage.usedBytes / storage.limitBytes) * 100);

  if (!user) return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <span className="logo-icon">⬚</span>
          <span className="logo-text">CloudBox</span>
        </div>
        <h2 className="auth-title">
          {authMode === 'login' ? 'Sign in' : authMode === 'signup' ? 'Create an account' : 'Verify your email'}
        </h2>
        <input className="auth-input" placeholder="Email" value={authForm.email}
          onChange={e => setAuthForm({ ...authForm, email: e.target.value })} />
        {authMode !== 'verify' && <input className="auth-input" placeholder="Password" type="password" value={authForm.password}
          onChange={e => setAuthForm({ ...authForm, password: e.target.value })} />}
        {authMode === 'verify' && <input className="auth-input" placeholder="Verification Code" value={authForm.code}
          onChange={e => setAuthForm({ ...authForm, code: e.target.value })} />}

        {authMode === 'login' && <button className="auth-btn" onClick={handleLogin} disabled={loading}>{loading ? 'Signing in...' : 'Sign in'}</button>}
        {authMode === 'signup' && <button className="auth-btn" onClick={handleSignup} disabled={loading}>{loading ? 'Creating...' : 'Create account'}</button>}
        {authMode === 'verify' && <button className="auth-btn" onClick={handleVerify}>Verify</button>}

        <p className="auth-switch">
          {authMode === 'login'
            ? <span>Don't have an account? <span className="auth-link" onClick={() => setAuthMode('signup')}>Sign up</span></span>
            : <span>Already have an account? <span className="auth-link" onClick={() => setAuthMode('login')}>Sign in</span></span>}
        </p>
        {status && <div className="auth-status">{status}</div>}
      </div>
    </div>
  );

  return (
    <div className="db-app">
      {/* Top Navbar */}
      <nav className="navbar">
        <div className="navbar-left">
          <span className="logo-icon">⬚</span>
          <span className="logo-text">CloudBox</span>
        </div>

        <div className="navbar-center">
          <span className={"navbar-link" + (activeTab === 'files' ? ' active' : '')}
            onClick={() => setActiveTab('files')}>📁 All files</span>
          <span className={"navbar-link" + (activeTab === 'records' ? ' active' : '')}
            onClick={() => setActiveTab('records')}>🗂️ Records ({items.length})</span>
        </div>

        <div className="navbar-right">
          <button className="nav-upload-btn" onClick={() => fileInputRef.current.click()}>+ Upload</button>
          <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }}
            onChange={e => doUploadMultiple(e.target.files)} />

          <div className="navbar-user" onClick={() => setShowUserMenu(!showUserMenu)}>
            <div className="user-avatar">{getUserId().charAt(0).toUpperCase()}</div>
            {showUserMenu && (
              <div className="user-dropdown">
                <div className="user-dropdown-email">{getUserId()}</div>
                <div className="user-dropdown-plan">{storage.plan === 'pro' ? 'Pro Plan' : 'Free Plan'}</div>
                <div className="user-dropdown-divider"></div>
                <div className="user-dropdown-item" onClick={handleLogout}>Sign out</div>
              </div>
            )}
          </div>
        </div>
      </nav>

      <div className="app-body">
        {/* Sidebar */}
        <aside className="sidebar">
          <div className="storage-box">
            <div className="storage-label">
              <span>{formatBytes(storage.usedBytes)} of {formatBytes(storage.limitBytes)} used</span>
            </div>
            <div className="storage-bar">
              <div className="storage-bar-fill" style={{ width: percentUsed + '%' }}></div>
            </div>
            {storage.plan === 'free' ? (
              <button className="upgrade-btn" onClick={() => setShowUpgrade(true)}>Get more space</button>
            ) : (
              <div className="plan-badge">PRO PLAN — 5 GB</div>
            )}
          </div>
        </aside>

        {/* Main content */}
        <main className="main-content">
          <div className="topbar">
            <h1>{activeTab === 'files' ? 'All files' : 'Records'}</h1>
            {activeTab === 'records' && (
              <button className="browse-btn" onClick={() => setShowAddItem(true)}>+ Add record</button>
            )}
          </div>

          {status && <div className="toast">{status}</div>}

          {activeTab === 'files' && (
            <>
              <div
                className={"dropzone" + (dragOver ? " dragover" : "")}
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
              >
                <div className="dropzone-icon">⬆</div>
                <p>Drag and drop a file here, or</p>
                <button className="browse-btn" onClick={() => fileInputRef.current.click()} disabled={loading}>
                  {loading ? 'Uploading...' : 'Browse files'}
                </button>
              </div>

              <div className="files-section">
                <div className="files-header">
                  <span>Name</span>
                  <span>Size</span>
                  <span>Modified</span>
                </div>
                {files.length === 0 ? (
                  <div className="empty-state">No files yet. Upload your first file above.</div>
                ) : (
                  files.map((f, idx) => (
                    <div key={idx} className="file-row">
                      <span className="file-name">📄 {f.name}</span>
                      <span className="file-size">{formatBytes(f.size)}</span>
                      <span className="file-date">{new Date(f.lastModified).toLocaleDateString()}</span>
                    </div>
                  ))
                )}
              </div>
            </>
          )}

          {activeTab === 'records' && (
            <div className="files-section">
              <div className="files-header">
                <span>Name</span>
                <span>Description</span>
                <span></span>
              </div>
              {items.length === 0 ? (
                <div className="empty-state">No records yet. Add your first record above.</div>
              ) : (
                items.map(it => (
                  <div key={it.id} className="file-row">
                    <span className="file-name">📝 {it.title}</span>
                    <span className="file-size">{it.description}</span>
                    <span></span>
                  </div>
                ))
              )}
            </div>
          )}
        </main>
      </div>

      {/* Add Item Modal */}
      {showAddItem && (
        <div className="modal-overlay" onClick={() => setShowAddItem(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <h2>Add Record</h2>
            <input className="auth-input" placeholder="Name" value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })} />
            <input className="auth-input" placeholder="Description" value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })} />
            <div className="modal-actions">
              <button className="modal-btn-secondary" onClick={() => setShowAddItem(false)}>Cancel</button>
              <button className="auth-btn" onClick={handleSubmit} disabled={loading}>{loading ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Upgrade Modal */}
      {showUpgrade && (
        <div className="modal-overlay" onClick={() => setShowUpgrade(false)}>
          <div className="modal-card upgrade-modal" onClick={e => e.stopPropagation()}>
            <div className="upgrade-icon">⬚</div>
            <h2>You're out of space</h2>
            <p className="upgrade-desc">Upgrade to Pro and get 5 GB of storage for your files.</p>

            <div className="plan-cards">
              <div className="plan-card">
                <div className="plan-name">Free</div>
                <div className="plan-price">$0<span>/mo</span></div>
                <div className="plan-feature">100 MB storage</div>
                <div className="plan-feature">Basic file uploads</div>
                <div className="plan-current">Current plan</div>
              </div>
              <div className="plan-card highlighted">
                <div className="plan-badge-top">RECOMMENDED</div>
                <div className="plan-name">Pro</div>
                <div className="plan-price">$9.99<span>/mo</span></div>
                <div className="plan-feature">5 GB storage</div>
                <div className="plan-feature">Priority support</div>
                <div className="plan-feature">No upload limits</div>
                <button className="auth-btn" onClick={handleUpgrade} disabled={loading}>
                  {loading ? 'Upgrading...' : 'Upgrade now (Demo)'}
                </button>
              </div>
            </div>
            <span className="modal-close" onClick={() => setShowUpgrade(false)}>Maybe later</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
