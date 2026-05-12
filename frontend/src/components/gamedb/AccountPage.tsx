import { useState, useEffect } from "react";
import { deleteHardware, deleteTouchIdPasskey, getMe, saveHardware, logout, updateProfile } from "../../api/gamedb";
import type { User, UserHardware } from "../../types/gamedb";

export function AccountPage({ onBack, onLogout, onSessionCleared }: { onBack: () => void; onLogout: () => void; onSessionCleared?: () => void }) {
  const [user, setUser] = useState<User | null>(null);
  const [hardware, setHardware] = useState<UserHardware[]>([]);
  const [loading, setLoading] = useState(true);
  const [showHwForm, setShowHwForm] = useState(false);
  const [chip, setChip] = useState("");
  const [macModel, setMacModel] = useState("");
  const [ram, setRam] = useState("");
  const [gpuCores, setGpuCores] = useState("");
  const [macosVer, setMacosVer] = useState("");
  const [passkeyMessage, setPasskeyMessage] = useState("");
  const [signedOutAfterRemoval, setSignedOutAfterRemoval] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [profileMessage, setProfileMessage] = useState("");

  useEffect(() => {
    getMe().then((data) => {
      if (data) {
        setUser(data.user);
        setHardware(data.hardware);
        setDisplayName(data.user.display_name);
      }
      setLoading(false);
    });
  }, []);

  const handleSaveHardware = async () => {
    await saveHardware({
      chip: chip || undefined,
      mac_model: macModel || undefined,
      ram_gb: ram ? parseInt(ram) : undefined,
      gpu_cores: gpuCores ? parseInt(gpuCores) : undefined,
      macos_version: macosVer || undefined,
      is_primary: true,
    });
    const me = await getMe();
    if (me) setHardware(me.hardware);
    setShowHwForm(false);
    setChip(""); setMacModel(""); setRam(""); setGpuCores(""); setMacosVer("");
  };

  const handleRemoveHardware = async () => {
    const machine = hardware[0];
    if (!machine) return;
    await deleteHardware(machine.id);
    const me = await getMe();
    if (me) setHardware(me.hardware);
  };

  const handleLogout = async () => {
    await logout();
    onLogout();
  };

  const handleRemovePasskey = async () => {
    setPasskeyMessage("");
    if (!window.confirm("Removing Touch ID will sign you out of this account.")) return;
    try {
      await deleteTouchIdPasskey();
      await logout();
      setUser(null);
      setSignedOutAfterRemoval(true);
      onSessionCleared?.();
    } catch (error: any) {
      setPasskeyMessage(error.message || "Touch ID passkey removal failed.");
    }
  };

  const handleSaveDisplayName = async () => {
    setProfileMessage("");
    try {
      const data = await updateProfile(displayName);
      setUser(data.user);
      setDisplayName(data.user.display_name);
      setIsEditingName(false);
      setProfileMessage("Display name updated.");
    } catch (error: any) {
      setProfileMessage(error.message || "Display name update failed.");
    }
  };

  if (loading) {
    return (
      <div className="py-16">
        <button onClick={onBack} className="text-[13px] text-white/40 hover:text-white mb-8 transition-colors">← Back</button>
        <div className="space-y-4">
          <div className="skeleton h-20 w-full rounded-xl" />
          <div className="skeleton h-48 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (signedOutAfterRemoval) {
    return (
      <div className="py-16 text-center">
        <p className="text-white text-[15px]">Touch ID removed.</p>
        <p className="mt-2 text-white/50 text-[13px]">You have been signed out of this account.</p>
        <button onClick={onBack} className="mt-5 text-[13px] text-white/50 hover:text-white transition-colors">← Back to games</button>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="py-16 text-center">
        <p className="text-white/40 text-[14px]">Not logged in.</p>
        <button onClick={onBack} className="mt-4 text-[13px] text-white/50 hover:text-white transition-colors">← Back to games</button>
      </div>
    );
  }

  const inputCls = "w-full bg-[#111] border border-[#2a2a2a] rounded-lg px-3.5 py-2.5 text-[13px] text-white placeholder:text-white/30 focus:outline-none focus:border-white/40 transition-colors";
  const labelCls = "block text-[11px] text-white mb-1.5 uppercase tracking-wider";

  const chipOptions = ["M1","M1 Pro","M1 Max","M1 Ultra","M2","M2 Pro","M2 Max","M2 Ultra","M3","M3 Pro","M3 Max","M4","M4 Pro","M4 Max","M5","M5 Pro","M5 Max"];
  const macModelOptions = [
    "MacBook Air 13-inch",
    "MacBook Air 15-inch",
    "MacBook Pro 14-inch",
    "MacBook Pro 16-inch",
    "Mac Neo",
    "iMac 24-inch",
    "Mac mini",
    "Mac Studio",
    "Mac Pro",
  ];
  const ramOptions = ["8","16","18","24","32","36","48","64","96","128","192"];
  const gpuCoreOptions = ["7","8","10","14","16","18","19","20","24","30","32","38","40","48","60","64","76"];
  const macosOptions = ["macOS Tahoe 26.5","macOS Tahoe 26.4","macOS Tahoe 26.3","macOS Tahoe 26.2","macOS Tahoe 26.1","macOS Tahoe 26.0","macOS Sequoia 15.5","macOS Sequoia 15.4","macOS Sequoia 15.3","macOS Sequoia 15.2","macOS Sequoia 15.1","macOS Sequoia 15.0"];

  const memberSince = new Date(user.created_at).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const hardwareImage = `${import.meta.env.BASE_URL}imgs/account-hardware-mac.webp`;
  const isTouchIdAccount = String(user.email || "").endsWith("@macready.local");

  return (
    <div className="py-8 animate-in">
      <button onClick={onBack} className="text-[13px] text-white/40 hover:text-white mb-8 transition-colors">← Back to main</button>

      {/* Profile Header */}
      <section className="mb-8 py-8">
        <div className="flex flex-col gap-7 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 overflow-hidden rounded-2xl bg-white/[0.055]">
              <img src={`${import.meta.env.BASE_URL}imgs/ChatGPT Image May 4, 2026, 06_01_12 AM.webp`} alt="" className="h-full w-full object-cover" />
            </div>
            <div>
              {isEditingName ? (
                <div className="flex max-w-[320px] flex-col gap-2 sm:flex-row">
                  <input
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    className="min-w-0 rounded-lg border border-white/15 bg-white/[0.06] px-3 py-1.5 text-[13px] text-white outline-none transition-colors focus:border-white/40"
                    maxLength={40}
                    autoFocus
                  />
                  <button
                    onClick={handleSaveDisplayName}
                    disabled={displayName.trim().length < 2}
                    className="rounded-lg border border-white/15 px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:border-white/35 disabled:opacity-45"
                  >
                    Save
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-[20px] font-semibold text-white tracking-tight">{user.display_name}</h2>
                  <button
                    onClick={() => {
                      setProfileMessage("");
                      setIsEditingName(true);
                    }}
                    className="rounded-lg border border-white/10 px-2 py-1 text-[11px] text-white/50 transition-colors hover:border-white/25 hover:text-white"
                  >
                    Edit
                  </button>
                </div>
              )}
              <p className="text-[12px] text-white">{isTouchIdAccount ? "Signed in with Touch ID" : user.email}</p>
              <button
                onClick={handleRemovePasskey}
                className="mt-3 rounded-lg border border-white/14 px-3 py-1.5 text-[12px] font-medium text-white/55 transition-all hover:border-red-400/35 hover:text-red-300"
              >
                Remove Touch ID
              </button>
            </div>
          </div>
          <div className="flex flex-col gap-4 pt-5 sm:items-end sm:pt-0">
            <div className="grid grid-cols-2 gap-8">
              <ProfileMetric label="Member since" value={memberSince} />
              <ProfileMetric label="Machines" value={String(hardware.length)} />
            </div>
          </div>
        </div>
        {passkeyMessage && (
          <p className="mt-5 text-[12px] text-white/65">{passkeyMessage}</p>
        )}
        {profileMessage && (
          <p className="mt-3 text-[12px] text-white/65">{profileMessage}</p>
        )}
      </section>

      {/* Hardware Profiles */}
      <section className="relative mb-4 overflow-hidden pb-5">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,0.92fr)_minmax(420px,0.78fr)] lg:items-start">
          <div>
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <h3 className="text-[15px] font-semibold text-white tracking-tight">Hardware Profiles</h3>
                <p className="text-[12px] text-white/60 mt-0.5">Add your Mac to see compatibility predictions.</p>
              </div>
              <div className="flex items-center gap-2">
                {hardware.length > 0 && (
                  <button
                    onClick={handleRemoveHardware}
                    className="px-3 py-1.5 text-[12px] font-medium rounded-lg border border-white/10 text-white/45 hover:border-red-400/30 hover:text-red-300 transition-all"
                  >
                    Remove Machine
                  </button>
                )}
                <button
                  onClick={() => setShowHwForm(!showHwForm)}
                  className="px-3 py-1.5 text-[12px] font-medium rounded-lg border border-white/14 text-white hover:border-white/32 transition-all"
                >
                  {showHwForm ? "Cancel" : "+ Add Machine"}
                </button>
              </div>
            </div>

            {/* Existing hardware profiles */}
            {hardware.length > 0 && (
              <div className="mb-2">
                {hardware.map((hw) => (
                  <div key={hw.id} className="py-4">
                    <div className="mb-3 flex items-center gap-2">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-white/40">
                      <path d="M17.057 10.45c-.015-2.484 2.03-3.677 2.118-3.73a3.782 3.782 0 0 0-2.955-1.597c-1.25-.126-2.43.74-3.064.74-.633 0-1.6-.724-2.642-.703a3.94 3.94 0 0 0-3.308 2.006c-1.393 2.417-.356 5.992 1.008 7.958.667.962 1.462 2.038 2.5 1.998 1.003-.04 1.38-.646 2.593-.646s1.55.646 2.61.625c1.08-.02 1.776-.974 2.44-1.942.766-1.119 1.083-2.203 1.101-2.261-.024-.01-2.13-.815-2.152-3.253zM14.93 4.298a3.616 3.616 0 0 0 .843-2.528 3.67 3.67 0 0 0-2.393 1.238 3.483 3.483 0 0 0-.877 2.442 3.1 3.1 0 0 0 2.427-1.152z" />
                    </svg>
                    <span className="text-[13px] text-white font-medium">{hw.chip || "Unknown Chip"}</span>
                  </div>
                    <div className="grid grid-cols-2 gap-x-8 gap-y-2 sm:grid-cols-4">
                  {hw.mac_model && (
                    <div>
                      <p className="text-[10px] text-white/35 uppercase tracking-wider">Model</p>
                      <p className="text-[12px] text-white">{hw.mac_model}</p>
                    </div>
                  )}
                  {hw.ram_gb && (
                    <div>
                      <p className="text-[10px] text-white/35 uppercase tracking-wider">Memory</p>
                      <p className="text-[12px] text-white">{hw.ram_gb} GB</p>
                    </div>
                  )}
                  {hw.gpu_cores && (
                    <div>
                      <p className="text-[10px] text-white/35 uppercase tracking-wider">GPU Cores</p>
                      <p className="text-[12px] text-white">{hw.gpu_cores}-core</p>
                    </div>
                  )}
                  {hw.macos_version && (
                    <div>
                      <p className="text-[10px] text-white/35 uppercase tracking-wider">macOS</p>
                      <p className="text-[12px] text-white">{hw.macos_version}</p>
                    </div>
                  )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {hardware.length === 0 && !showHwForm && (
              <div className="py-10 text-center">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-3 text-white/15">
              <rect x="4" y="4" width="16" height="16" rx="2" />
              <rect x="9" y="9" width="6" height="6" />
              <path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 15h3M1 9h3M1 15h3" />
            </svg>
            <p className="text-[13px] text-white">No machines added yet</p>
            <p className="text-[11px] text-white/60 mt-1">Add your Mac to unlock personalised compatibility data.</p>
              </div>
            )}

            {/* Add hardware form */}
            {showHwForm && (
              <div className="mt-3 py-5">
            <h4 className="text-[13px] font-medium text-white mb-4">Add a Machine</h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <label className={labelCls}>Chip *</label>
                <select value={chip} onChange={(e) => setChip(e.target.value)} className={inputCls}>
                  <option value="">Select chip</option>
                  {chipOptions.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Mac Model</label>
                <select value={macModel} onChange={(e) => setMacModel(e.target.value)} className={inputCls}>
                  <option value="">Select model</option>
                  {macModelOptions.map(model => <option key={model} value={model}>{model}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Memory</label>
                <select value={ram} onChange={(e) => setRam(e.target.value)} className={inputCls}>
                  <option value="">Select</option>
                  {ramOptions.map(r => <option key={r} value={r}>{r} GB</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>macOS Version</label>
                <select value={macosVer} onChange={(e) => setMacosVer(e.target.value)} className={inputCls}>
                  <option value="">Select macOS</option>
                  {macosOptions.map(version => <option key={version} value={version}>{version}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>GPU Cores</label>
                <select value={gpuCores} onChange={(e) => setGpuCores(e.target.value)} className={inputCls}>
                  <option value="">Select cores</option>
                  {gpuCoreOptions.map(cores => <option key={cores} value={cores}>{cores}-core</option>)}
                </select>
              </div>
            </div>
            <div className="flex items-center gap-3 mt-4">
              <button
                onClick={handleSaveHardware}
                disabled={!chip}
                className="px-4 py-2 text-[12px] font-medium rounded-lg bg-white text-black hover:bg-white/90 transition-colors disabled:opacity-30"
              >
                Save Machine
              </button>
              <button
                onClick={() => setShowHwForm(false)}
                className="px-4 py-2 text-[12px] text-white/40 hover:text-white transition-colors"
              >
                Cancel
              </button>
            </div>
              </div>
            )}
          </div>

          <div className="relative hidden min-h-[260px] overflow-hidden lg:block">
            <img
              src={hardwareImage}
              alt=""
              className="absolute inset-0 h-full w-full object-cover object-center opacity-70"
            />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_46%_48%,transparent_0%,rgba(0,0,0,0.12)_34%,rgba(0,0,0,0.88)_78%,rgba(0,0,0,1)_100%)]" />
            <div className="absolute inset-y-0 left-0 w-32 bg-gradient-to-r from-black to-transparent" />
            <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black to-transparent" />
          </div>
        </div>
      </section>

      {/* Sign out */}
      <div className="flex justify-center mt-2">
        <button
          onClick={handleLogout}
          className="px-6 py-2.5 text-[12px] text-white/50 hover:text-red-400 border border-[#2a2a2a] rounded-lg hover:border-red-400/30 transition-all"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

function ProfileMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] text-white/35 uppercase tracking-wider">{label}</p>
      <p className="text-[13px] text-white mt-0.5">{value}</p>
    </div>
  );
}
