import { useState, useEffect } from "react";
import {
  deleteTouchIdPasskey,
  updateProfile,
  register,
  login,
  getMe,
  logout,
  getPasskeyLoginOptions,
  getPasskeyRegistrationOptions,
  getPasskeySignupOptions,
  hasSavedTouchIdCredential,
  verifyPasskeyLogin,
  verifyPasskeyRegistration,
  verifyPasskeySignup,
} from "../../api/gamedb";

type AuthView = "login" | "register" | "account" | "signedout";

async function loadPasskeyBrowser() {
  return import("@simplewebauthn/browser");
}

async function ensureLocalTouchIdAvailable() {
  const { browserSupportsWebAuthn, platformAuthenticatorIsAvailable } = await loadPasskeyBrowser();
  if (!browserSupportsWebAuthn() || !(await platformAuthenticatorIsAvailable())) {
    throw new Error("Touch ID is not available in this browser on this device");
  }
}

function isPasskeyCancel(error: any) {
  const message = String(error?.message ?? "").toLowerCase();
  return error?.name === "AbortError" || message.includes("abort signal") || message.includes("cancel");
}

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
          onAddPasskey={async () => {
            setError("");
            try {
              await ensureLocalTouchIdAvailable();
              const { options } = await getPasskeyRegistrationOptions();
              const { startRegistration } = await loadPasskeyBrowser();
              const credential = await startRegistration({ optionsJSON: options });
              await verifyPasskeyRegistration(credential);
            } catch (e: any) {
              if (isPasskeyCancel(e)) {
                setError("");
                return;
              }
              setError(e.message || "Touch ID setup failed");
            }
          }}
          onRemovePasskey={async () => {
            setError("");
            if (!window.confirm("Removing Touch ID will sign you out of this account.")) return;
            try {
              await deleteTouchIdPasskey();
              await logout();
              onLoggedIn(null);
              setUser(null);
              setView("signedout");
            } catch (e: any) {
              setError(e.message || "Touch ID passkey removal failed");
            }
          }}
          onUpdateDisplayName={async (displayName) => {
            setError("");
            try {
              const data = await updateProfile(displayName);
              setUser(data.user);
              onLoggedIn(data.user);
            } catch (e: any) {
              setError(e.message || "Display name update failed");
              throw e;
            }
          }}
          error={error}
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
          onPasskeyLogin={async () => {
            setError("");
            try {
              if (!hasSavedTouchIdCredential()) {
                setView("register");
                return;
              }
              await ensureLocalTouchIdAvailable();
              const { options, requestId } = await getPasskeyLoginOptions();
              const { startAuthentication } = await loadPasskeyBrowser();
              const credential = await startAuthentication({ optionsJSON: options });
              const data = await verifyPasskeyLogin(credential, requestId);
              onLoggedIn(data.user);
            } catch (e: any) {
              if (isPasskeyCancel(e)) {
                setError("");
                return;
              }
              if (e.message?.includes("404")) {
                setView("register");
                return;
              }
              setError(e.message || "Passkey sign in failed");
            }
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
          onPasskeyRegister={async (displayName) => {
            setError("");
            try {
              await ensureLocalTouchIdAvailable();
              const { options, requestId } = await getPasskeySignupOptions(displayName);
              const { startRegistration } = await loadPasskeyBrowser();
              const credential = await startRegistration({ optionsJSON: options });
              const data = await verifyPasskeySignup(requestId, credential);
              onLoggedIn(data.user);
            } catch (e: any) {
              if (isPasskeyCancel(e)) {
                setError("");
                return;
              }
              setError(e.message || "Touch ID account setup failed");
            }
          }}
          onSwitch={() => { setError(""); setView("login"); }}
        />
      )}
      {view === "signedout" && (
        <SignedOutView
          onClose={onClose}
          onSignIn={() => {
            setError("");
            setView("login");
          }}
        />
      )}
    </ModalShell>
  );
}

function AccountView({
  user,
  onAddPasskey,
  onRemovePasskey,
  onUpdateDisplayName,
  onLogout,
  error,
}: {
  user: any;
  onAddPasskey: () => void;
  onRemovePasskey: () => void;
  onUpdateDisplayName: (displayName: string) => Promise<void>;
  onLogout: () => void;
  error: string;
}) {
  const [isEditingName, setIsEditingName] = useState(false);
  const [displayName, setDisplayName] = useState(user.display_name || "");
  const [message, setMessage] = useState("");
  const canSaveName = displayName.trim().length >= 2 && displayName.trim().length <= 40;

  const saveDisplayName = async () => {
    if (!canSaveName) return;
    setMessage("");
    await onUpdateDisplayName(displayName.trim());
    setIsEditingName(false);
    setMessage("Display name updated.");
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-[17px] font-normal text-white tracking-tight">Account</h2>
        <p className="text-[13px] text-white/50 mt-1">
          {String(user.email || "").endsWith("@macready.local") ? "Signed in with Touch ID" : `Signed in as ${user.email}`}
        </p>
      </div>
      
      <div className="bg-[#111] border border-[#2a2a2a] rounded-lg p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white font-medium">
            {user.display_name?.[0]?.toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            {isEditingName ? (
              <div className="flex gap-2">
                <input
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  className="min-w-0 flex-1 rounded-lg border border-white/15 bg-white/[0.06] px-3 py-1.5 text-[13px] text-white outline-none transition-colors focus:border-white/40"
                  maxLength={40}
                  autoFocus
                />
                <button
                  onClick={saveDisplayName}
                  disabled={!canSaveName}
                  className="rounded-lg border border-white/15 px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:border-white/35 disabled:opacity-45"
                >
                  Save
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <p className="truncate text-[14px] text-white font-medium">{user.display_name}</p>
                <button
                  onClick={() => {
                    setMessage("");
                    setIsEditingName(true);
                  }}
                  className="rounded-md border border-white/10 px-2 py-0.5 text-[11px] text-white/50 transition-colors hover:border-white/25 hover:text-white"
                >
                  Edit
                </button>
              </div>
            )}
            <p className="text-[12px] text-white/40">Member since {new Date().getFullYear()}</p>
          </div>
        </div>
      </div>

      {error && <p className="text-[11px] text-red-400">{error}</p>}
      {message && <p className="text-[11px] text-white/55">{message}</p>}

      <button
        onClick={onAddPasskey}
        className="w-full py-2.5 rounded-lg border border-white/15 bg-white/10 text-white text-[13px] font-medium hover:bg-white/15 transition-colors inline-flex items-center justify-center gap-2"
      >
        <PasskeyIcon />
        Add Passkey
      </button>

      <button
        onClick={onRemovePasskey}
        className="w-full py-2.5 rounded-lg border border-white/15 bg-white/[0.04] text-white/70 text-[13px] font-medium hover:border-red-400/35 hover:text-red-300 transition-colors"
      >
        Remove Touch ID
      </button>

      <button 
        onClick={onLogout}
        className="w-full py-2.5 rounded-lg border border-red-500/30 bg-red-500/10 text-red-500 text-[13px] font-medium hover:bg-red-500/20 transition-colors"
      >
        Sign out
      </button>
    </div>
  );
}

function SignedOutView({ onClose, onSignIn }: { onClose: () => void; onSignIn: () => void }) {
  return (
    <div className="space-y-5 py-2 text-center">
      <div>
        <h2 className="text-[17px] font-normal text-white tracking-tight">Touch ID removed</h2>
        <p className="mt-2 text-[13px] text-white/55">You have been signed out of this account.</p>
      </div>
      <div className="flex flex-col gap-2">
        <button onClick={onSignIn} className="w-full py-2.5 rounded-lg bg-white text-black text-[13px] font-medium hover:bg-white/90 transition-colors">
          Sign in
        </button>
        <button onClick={onClose} className="w-full py-2.5 rounded-lg border border-white/15 bg-white/[0.04] text-white/70 text-[13px] font-medium hover:border-white/30 hover:text-white transition-colors">
          Done
        </button>
      </div>
    </div>
  );
}

function PasskeyIcon() {
  return (
    <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center text-[#ff375f]" aria-hidden="true">
      <svg width="22" height="22" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
        <path d="M12.5 22.5c0-6.35 5.15-11.5 11.5-11.5s11.5 5.15 11.5 11.5" />
        <path d="M8.5 24c0-8.56 6.94-15.5 15.5-15.5S39.5 15.44 39.5 24" />
        <path d="M5.5 27c0-10.22 8.28-18.5 18.5-18.5S42.5 16.78 42.5 27" />
        <path d="M15.5 25c0-4.69 3.81-8.5 8.5-8.5s8.5 3.81 8.5 8.5" />
        <path d="M19 27c0-2.76 2.24-5 5-5s5 2.24 5 5" />
        <path d="M24 27c0 7.2-2.25 12.15-6.25 15.75" />
        <path d="M29 29.5c-.35 5.65-1.9 10.25-4.8 14" />
        <path d="M33.5 29c-.22 4.3-1.15 8.45-2.95 12.35" />
        <path d="M14.5 30c-.55 3.35-1.8 6.15-3.8 8.45" />
        <path d="M19.5 31.5c-.75 4.55-2.5 8.3-5.25 11.25" />
        <path d="M9.5 31.5c-.35 1.65-.95 3.1-1.8 4.35" />
        <path d="M38.25 30.5c-.15 2.2-.5 4.3-1.05 6.3" />
      </svg>
    </span>
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

function LoginForm({ error, onLogin, onPasskeyLogin, onSwitch }: { error: string; onLogin: (e: string, p: string) => void; onPasskeyLogin: () => void; onSwitch: () => void }) {
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
        <button onClick={onPasskeyLogin} className="w-full py-2.5 rounded-lg border border-white/15 bg-white/10 text-white text-[13px] font-medium hover:bg-white/15 transition-colors inline-flex items-center justify-center gap-2">
          <PasskeyIcon />
          Sign in with Passkey
        </button>
        <p className="text-center text-[11px] text-white/80 mt-2 font-normal">
          Don't have an account? <button onClick={onSwitch} className="text-white hover:text-white/80 transition-colors ml-1 font-normal">Sign up</button>
        </p>
      </div>
    </div>
  );
}

function RegisterForm({ error, onRegister, onPasskeyRegister, onSwitch }: { error: string; onRegister: (e: string, p: string, n: string) => void; onPasskeyRegister: (displayName: string) => void; onSwitch: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [touchIdName, setTouchIdName] = useState("");
  const inputCls = "w-full bg-[#111] border border-[#2a2a2a] rounded-lg px-3.5 py-2.5 text-[13px] text-white placeholder:text-white/50 focus:outline-none focus:border-white/70 transition-colors";

  return (
    <div>
      <h2 className="text-[17px] font-normal text-white tracking-tight mb-6">Create account</h2>
      <div className="space-y-3">
        {error && <p className="text-[11px] text-red-400">{error}</p>}
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
          <p className="mt-1.5 text-[10px] text-white/40">Only needed for email and password signup.</p>
        </div>
        <button onClick={() => onRegister(email, password, displayName)} disabled={!email || !password || !displayName} className="w-full py-2.5 rounded-lg bg-white text-black text-[13px] font-medium hover:bg-white/90 transition-colors disabled:opacity-60">Create account with password</button>
        <div className="py-1 text-center text-[10px] uppercase tracking-[0.22em] text-white/30">or</div>
        <div>
          <label className="block text-[10px] text-white/80 mb-1.5 uppercase tracking-wider">Touch ID account name</label>
          <input value={touchIdName} onChange={(e) => setTouchIdName(e.target.value)} placeholder="Your display name" className={inputCls} />
        </div>
        <button onClick={() => onPasskeyRegister(touchIdName.trim())} disabled={!touchIdName.trim()} className="w-full py-2.5 rounded-lg border border-white/15 bg-white/10 text-white text-[13px] font-medium hover:bg-white/15 transition-colors inline-flex items-center justify-center gap-2 disabled:opacity-60">
          <PasskeyIcon />
          Create account with Touch ID
        </button>
        <p className="text-center text-[11px] text-white/80 mt-2 font-normal">
          Already have an account? <button onClick={onSwitch} className="text-white hover:text-white/80 transition-colors ml-1 font-normal">Sign in</button>
        </p>
      </div>
    </div>
  );
}
