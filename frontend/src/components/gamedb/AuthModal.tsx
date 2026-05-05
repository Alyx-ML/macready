import { useState, useEffect } from "react";
import { register, login, getMe, logout } from "../../api/gamedb";

type AuthView = "login" | "register" | "account";

export function AuthModal({ onClose, onLoggedIn, user: initialUser }: { onClose: () => void; onLoggedIn: (user: any) => void; user?: any }) {
  const [view, setView] = useState<AuthView>(initialUser ? "account" : "login");
  const [loading, setLoading] = useState(!initialUser);
  const [error, setError] = useState("");
  const [user, setUser] = useState(initialUser);

  useEffect(() => {
    if (initialUser) return;
    getMe().then((data: any) => {
      if (data) {
        setUser(data.user);
        setView("account");
      }
      setLoading(false);
    });
  }, [initialUser]);

  if (loading) {
    return (
      <ModalShell onClose={onClose}>
        <div className="flex flex-col items-center justify-center py-12 space-y-4">
          <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
          <p className="text-[12px] text-white/50">Verifying session...</p>
        </div>
      </ModalShell>
    );
  }

  return (
    <ModalShell onClose={onClose}>
      {view === "account" && user && (
        <AccountView 
          user={user} 
          onLogout={async () => {
            try { await logout(); } catch (e) { console.error("API logout failed", e); }
            onLoggedIn(null);
            onClose();
          }} 
        />
      )}
      {view === "login" && (
        <LoginForm
          error={error}
          onLogin={async (email, password) => {
            setError("");
            try {
              const data = await login(email, password);
              onLoggedIn(data.user);
            } catch (e: any) { setError(e.message?.includes("401") ? "Invalid credentials" : e.message); }
          }}
          onSwitch={() => { setError(""); setView("register"); }}
        />
      )}
      {view === "register" && (
        <RegisterForm
          error={error}
          onRegister={async (email, password, displayName) => {
            setError("");
            try {
              const data = await register(email, password, displayName);
              onLoggedIn(data.user);
            } catch (e: any) { setError(e.message?.includes("409") ? "Email already registered" : e.message); }
          }}
          onSwitch={() => { setError(""); setView("login"); }}
        />
      )}
    </ModalShell>
  );
}

function AccountView({ user, onLogout }: { user: any; onLogout: () => void }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-[17px] font-normal text-white tracking-tight">Account</h2>
        <p className="text-[13px] text-white/50 mt-1">Signed in as {user.email}</p>
      </div>
      
      <div className="bg-[#111] border border-[#2a2a2a] rounded-lg p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white font-medium">
            {user.display_name?.[0]?.toUpperCase()}
          </div>
          <div>
            <p className="text-[14px] text-white font-medium">{user.display_name}</p>
            <p className="text-[12px] text-white/40">Member since {new Date().getFullYear()}</p>
          </div>
        </div>
      </div>

      <button 
        onClick={onLogout}
        className="w-full py-2.5 rounded-lg border border-red-500/30 bg-red-500/10 text-red-500 text-[13px] font-medium hover:bg-red-500/20 transition-colors"
      >
        Sign out
      </button>
    </div>
  );
}

function ModalShell({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70" />
      <div className="relative z-10 w-full max-w-[400px] mx-4 bg-[#0d0d0d] border border-[#2a2a2a] rounded-xl p-6" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center rounded-md hover:bg-[#1a1a1a] text-white/30 hover:text-white transition-colors">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M3 3l10 10M13 3L3 13" /></svg>
        </button>
        {children}
      </div>
    </div>
  );
}

function LoginForm({ error, onLogin, onSwitch }: { error: string; onLogin: (e: string, p: string) => void; onSwitch: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const inputCls = "w-full bg-[#111] border border-[#2a2a2a] rounded-lg px-3.5 py-2.5 text-[13px] text-white placeholder:text-white/50 focus:outline-none focus:border-white/70 transition-colors";

  return (
    <div>
      <h2 className="text-[17px] font-normal text-white tracking-tight mb-6">Sign in</h2>
      <div className="space-y-3">
        <div>
          <label className="block text-[10px] text-white/80 mb-1.5 uppercase tracking-wider">Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className={inputCls} />
        </div>
        <div>
          <label className="block text-[10px] text-white/80 mb-1.5 uppercase tracking-wider">Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className={inputCls} />
        </div>
        {error && <p className="text-[11px] text-red-400">{error}</p>}
        <button onClick={() => onLogin(email, password)} className="w-full mt-2 py-2.5 rounded-lg bg-white text-black text-[13px] font-medium hover:bg-white/90 transition-colors">Sign in</button>
        <p className="text-center text-[11px] text-white/80 mt-2 font-normal">
          Don't have an account? <button onClick={onSwitch} className="text-white hover:text-white/80 transition-colors ml-1 font-normal">Sign up</button>
        </p>
      </div>
    </div>
  );
}

function RegisterForm({ error, onRegister, onSwitch }: { error: string; onRegister: (e: string, p: string, n: string) => void; onSwitch: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const inputCls = "w-full bg-[#111] border border-[#2a2a2a] rounded-lg px-3.5 py-2.5 text-[13px] text-white placeholder:text-white/50 focus:outline-none focus:border-white/70 transition-colors";

  return (
    <div>
      <h2 className="text-[17px] font-normal text-white tracking-tight mb-6">Create account</h2>
      <div className="space-y-3">
        <div>
          <label className="block text-[10px] text-white/80 mb-1.5 uppercase tracking-wider">Username</label>
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Your username" className={inputCls} />
        </div>
        <div>
          <label className="block text-[10px] text-white/80 mb-1.5 uppercase tracking-wider">Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className={inputCls} />
        </div>
        <div>
          <label className="block text-[10px] text-white/80 mb-1.5 uppercase tracking-wider">Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className={inputCls} />
        </div>
        {error && <p className="text-[11px] text-red-400">{error}</p>}
        <button onClick={() => onRegister(email, password, displayName)} disabled={!email || !password || !displayName} className="w-full mt-2 py-2.5 rounded-lg bg-white text-black text-[13px] font-medium hover:bg-white/90 transition-colors disabled:opacity-60">Create account</button>
        <p className="text-center text-[11px] text-white/80 mt-2 font-normal">
          Already have an account? <button onClick={onSwitch} className="text-white hover:text-white/80 transition-colors ml-1 font-normal">Sign in</button>
        </p>
      </div>
    </div>
  );
}
