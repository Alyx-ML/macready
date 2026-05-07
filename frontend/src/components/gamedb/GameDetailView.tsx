import { useRef, useState, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Apple, BadgeDollarSign, Cloud, Gamepad2, HeartHandshake, MessageSquareText, MonitorCheck, Pause, Play, ShieldCheck, TrendingUp, UsersRound, Volume1, Volume2, VolumeX, type LucideIcon } from "lucide-react";
import { getGame, addTest, getSteamReviews } from "../../api/gamedb";
import { NotRatedBadge, TierBadge } from "./GameCards";
import { getTierConfig, NEW_TIERS } from "./tierConfig";
import { cn } from "../../lib/utils";
import type { Test, Issue, CompatTier, AddTestRequest, AggregateRating, SteamMetadata, UserHardware } from "../../types/gamedb";

export function GameDetailView({ gameId, onBack, onAddTest, primaryHardware }: { gameId: number; onBack: () => void; onAddTest: () => void; primaryHardware?: UserHardware | null }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["gamedb", "game", gameId],
    queryFn: () => getGame(gameId),
  });

  const addTestMut = useMutation({
    mutationFn: (req: AddTestRequest) => addTest(gameId, req),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gamedb", "game", gameId] });
      qc.invalidateQueries({ queryKey: ["gamedb", "games"] });
      onAddTest();
    },
  });

  const [showTestForm, setShowTestForm] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [selectedScreenshotIndex, setSelectedScreenshotIndex] = useState(0);

  if (isLoading || !data) {
    return (
      <div className="animate-in">
        <button onClick={onBack} className="text-[13px] text-white/40 hover:text-white mb-6 transition-colors">← Back</button>
        <div className="skeleton h-48 w-full rounded-lg mb-4" />
        <div className="skeleton h-6 w-48 mb-4" />
        <div className="skeleton h-32 w-full" />
      </div>
    );
  }

  const { game, steam, tests, aggregate, hardware_matrix } = data;
  const coverUrl = steam?.header_image || steam?.capsule_image || game.cover_art_url || "";
  const heroImage = coverUrl || steam?.background || "";
  const genres = game.genre ? game.genre.split(",").map((g) => g.trim()).filter(Boolean) : steam?.genres || [];
  const uniqueGenres = Array.from(new Set(genres));
  const uniqueTags = Array.from(new Set([...uniqueGenres, ...(game.tags || [])]));
  const platformLabel = game.platform || (steam ? "Steam" : "");
  const description = steam?.description || "";
  const primaryMovie = steam?.movies?.[0];
  const primaryMovieSrc = primaryMovie?.mp4 || primaryMovie?.webm || "";
  const screenshots = steam?.screenshots?.slice(0, 4) || [];
  const primaryScreenshot = screenshots[0];
  const selectedScreenshot = screenshots[selectedScreenshotIndex] || primaryScreenshot;
  const macRequirements = steam?.mac_native ? steam?.requirements?.mac : undefined;
  const pcRequirements = steam?.requirements?.pc;
  const storeUrl = game.store_url || steam?.store_url;
  const showPlatformLabel = platformLabel && !(platformLabel.toLowerCase() === "steam" && storeUrl);
  const hasMacRequirements = Boolean(macRequirements?.minimum || macRequirements?.recommended);
  const hasPcRequirements = Boolean(pcRequirements?.minimum || pcRequirements?.recommended);
  const hasRequirements = hasMacRequirements || hasPcRequirements;
  const requirementsGridClass = hasMacRequirements && hasPcRequirements ? "xl:grid-cols-2" : "xl:grid-cols-1";
  const hasMedia = Boolean(primaryMovie || screenshots.length > 0);
  const detailFacts = [
    { label: "Mac Native", value: steam?.mac_native ? "Yes" : "No" },
    { label: "CrossOver", value: steam?.crossover_playable ? "Playable" : "Unrated" },
    { label: "Release", value: steam?.release_date || "—" },
    { label: "Developer", value: steam?.developers?.[0] || "—" },
  ];
  const compatibilityStats = [
    { label: "Reports", value: String(aggregate?.total_reports || 0) },
    { label: "Rating", value: aggregate && aggregate.total_reports > 0 ? getTierConfig(aggregate.tier).label : "Not Rated" },
    { label: "Latest macOS", value: tests[0]?.macos_version || "—" },
    { label: "Latest Hardware", value: tests[0]?.hardware || "—" },
  ];

  return (
    <div className="animate-in space-y-6 pb-10">
      <button onClick={onBack} className="text-[13px] text-white/40 hover:text-white transition-colors">← Back to list</button>

      <section className="relative overflow-hidden rounded-[22px] border border-white/6 bg-[#050505] shadow-2xl">
        <div className="absolute inset-0 bg-black">
          {heroImage && !imgError ? (
            <img src={heroImage} alt={game.name} onError={() => setImgError(true)} className="w-full h-full object-cover opacity-50" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-white/5 to-transparent">
              <span className="text-white/10 text-[96px] font-bold">{game.name.charAt(0)}</span>
            </div>
          )}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_72%_22%,rgba(255,255,255,0.12),transparent_28%),linear-gradient(90deg,rgba(0,0,0,0.96)_0%,rgba(0,0,0,0.62)_48%,rgba(0,0,0,0.82)_100%)]" />
          <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black to-transparent" />
        </div>

        <div className="relative min-h-[330px] px-5 py-6 sm:px-7 sm:py-7">
          <div className="flex h-full min-h-[280px] flex-col justify-end">
            <div className="grid items-end gap-5 lg:grid-cols-[260px_minmax(0,1fr)_auto]">
              {coverUrl && !imgError && (
                <div className="hidden overflow-hidden rounded-2xl bg-black/40 shadow-2xl sm:block">
                  <img src={coverUrl} alt="" className="w-full object-cover" />
                </div>
              )}

              <div className="min-w-0">
                <h2 className="max-w-[760px] text-[34px] font-semibold leading-tight tracking-tight text-white">{game.name}</h2>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {showPlatformLabel && <span className="text-[13px] text-white/45">{platformLabel}</span>}
                  {steam?.release_date && <span className="text-[13px] text-white/35">· {steam.release_date}</span>}
                  {storeUrl && (
                    <a href={storeUrl} target="_blank" rel="noreferrer" className="text-[13px] text-white/45 transition-colors hover:text-white">Steam ↗</a>
                  )}
                </div>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {uniqueTags.slice(0, 8).map((tag: string) => (
                    <span key={tag} className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[10px] text-white/48">{tag}</span>
                  ))}
                </div>
              </div>

              <div className="flex justify-start lg:justify-end">
                {aggregate && aggregate.total_reports > 0 ? <TierBadge tier={aggregate.tier} size="lg" /> : <NotRatedBadge size="lg" />}
              </div>
            </div>
          </div>
        </div>
      </section>

      {hasMedia && (
        <section className="border-y border-white/6 py-5">
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,0.98fr)_minmax(0,1.02fr)] xl:items-stretch">
            <div className={primaryMovie ? "self-start" : "self-start overflow-hidden rounded-lg bg-black"}>
              {primaryMovie && primaryMovieSrc ? (
                <VideoPlayer src={primaryMovieSrc} />
              ) : selectedScreenshot ? (
                <a href={selectedScreenshot.full} target="_blank" rel="noreferrer" className="block">
                  <img src={selectedScreenshot.full} alt="" className="aspect-video max-h-[320px] w-full object-cover opacity-85" />
                </a>
              ) : null}
            </div>
            {screenshots.length > 0 && (
              <div className="grid grid-cols-4 gap-2 self-start xl:grid-cols-2 xl:self-stretch">
                {screenshots.map((shot, index) => (
                  <button
                    key={shot.id}
                    type="button"
                    onClick={() => setSelectedScreenshotIndex(index)}
                    className={cn(
                      "overflow-hidden rounded-md bg-black text-left transition-opacity",
                      index === selectedScreenshotIndex ? "opacity-100" : "opacity-70 hover:opacity-90"
                    )}
                    aria-label={`Show screenshot ${index + 1}`}
                  >
                    <img src={shot.thumbnail || shot.full} alt="" className="h-full w-full object-cover opacity-70 transition-opacity hover:opacity-100" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {(description || steam) && (
        <section className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(300px,420px)] lg:items-start">
          {description && (
            <OverviewCopy description={description} />
          )}
          {steam && (
            <div className="space-y-3 lg:border-l lg:border-white/6 lg:pl-5">
              <SectionKicker>Profile</SectionKicker>
              <div className="grid grid-cols-2 gap-x-5 gap-y-3">
                {detailFacts.map((fact) => (
                  <DetailFact key={fact.label} label={fact.label} value={fact.value} />
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {steam && (
        <section className="grid grid-cols-1 gap-5 border-y border-white/6 py-4 lg:grid-cols-[minmax(210px,0.85fr)_minmax(320px,1.15fr)] lg:items-start">
          <SupportSignals categories={steam.categories || []} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <SteamMarketStrip steam={steam} />
            <SteamReviews appId={steam.steam_app_id} />
          </div>
        </section>
      )}

      {hasRequirements && (
        <section className="content-visibility-auto border-b border-white/6 pb-5">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
            <div className={cn("grid grid-cols-1 gap-5", requirementsGridClass)}>
              {(macRequirements?.minimum || macRequirements?.recommended) && (
                <RequirementBox title="Mac System Requirements" minimum={macRequirements.minimum} recommended={macRequirements.recommended} />
              )}
              {(pcRequirements?.minimum || pcRequirements?.recommended) && (
                <RequirementBox title="Windows System Requirements" minimum={pcRequirements.minimum} recommended={pcRequirements.recommended} />
              )}
            </div>
            {steam && (
              <div className="lg:border-l lg:border-white/6 lg:pl-5">
                <MacEvidence steam={steam} aggregate={aggregate} hasMacRequirements={hasMacRequirements} />
              </div>
            )}
          </div>
        </section>
      )}

      <MyMacEstimate hardware={primaryHardware} tests={tests} aggregate={aggregate} steam={steam} />

      <DetailBenchmarkSummary
        hardware={primaryHardware}
        tests={tests}
        aggregate={aggregate}
        steam={steam}
        reportCount={compatibilityStats[0].value}
      />

      {aggregate && aggregate.total_reports > 0 && (
        <section className="content-visibility-auto border-b border-white/6 pb-5">
          <SectionKicker>Compatibility Breakdown</SectionKicker>
          <div className="space-y-2">
            {Object.entries(aggregate.breakdown).map(([tier, count]) => {
              const cfg = getTierConfig(tier);
              const pct = Math.round((count / aggregate.total_reports) * 100);
              return (
                <div key={tier} className="flex items-center gap-3">
                  <span className={`text-[11px] w-20 ${cfg.color}`}>{cfg.label}</span>
                  <div className="flex-1 h-1.5 bg-[#1a1a1a] rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${cfg.bg.replace('/10', '/60')}`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-[11px] text-white/30 w-8 text-right">{count}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {hardware_matrix && hardware_matrix.length > 0 && (
        <section className="content-visibility-auto overflow-hidden border-b border-white/6 pb-5">
          <SectionKicker>Hardware Compatibility</SectionKicker>
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-white/8 text-white/30">
                <th className="py-2 text-left font-normal">Chip</th>
                <th className="py-2 text-left font-normal">Best Result</th>
                <th className="py-2 text-left font-normal">FPS</th>
                <th className="py-2 text-right font-normal">Reports</th>
              </tr>
            </thead>
            <tbody>
              {hardware_matrix.map((hw) => (
                <tr key={hw.hardware} className="border-b border-white/5 last:border-0">
                  <td className="py-2 text-white/60 font-mono">{hw.hardware}</td>
                  <td className="py-2"><TierBadge tier={hw.best_status} size="sm" /></td>
                  <td className="py-2 text-white/40 font-mono">{hw.avg_fps || "—"}</td>
                  <td className="py-2 text-white/30 text-right">{hw.report_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[13px] font-medium text-white/60">Test Reports</h3>
        <button
          onClick={() => setShowTestForm(!showTestForm)}
          className="px-3 py-1.5 text-[12px] font-medium rounded-lg border border-[#333] text-white/60 hover:text-white hover:border-white/40 transition-all"
        >
          {showTestForm ? "Cancel" : "+ Submit Report"}
        </button>
      </div>

      {showTestForm && (
        <div className="border border-[#2a2a2a] rounded-lg p-4 mb-4 bg-[#0d0d0d]">
          <AddTestForm onSubmit={(req) => addTestMut.mutate(req, { onSuccess: () => setShowTestForm(false) })} />
        </div>
      )}

      {tests.length === 0 && (
        <div className="py-8 text-center">
          <p className="text-[13px] text-white/24">No test reports recorded yet.</p>
          <p className="mt-2 text-[12px] text-white/16">Submitted reports will show method, chip, RAM, preset, resolution, FPS, and notes here.</p>
        </div>
      )}
      <div className="space-y-2">
        {tests.map((t) => (
          <TestCard key={t.id} test={t} />
        ))}
      </div>
      </section>
    </div>
  );
}

const formatTime = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
};

const CustomSlider = ({
  value,
  onChange,
  className,
}: {
  value: number;
  onChange: (value: number) => void;
  className?: string;
}) => {
  return (
    <motion.div
      className={cn(
        "relative w-full h-1 bg-white/20 rounded-full cursor-pointer",
        className
      )}
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const percentage = (x / rect.width) * 100;
        onChange(Math.min(Math.max(percentage, 0), 100));
      }}
    >
      <motion.div
        className="absolute top-0 left-0 h-full bg-white rounded-full"
        style={{ width: `${value}%` }}
        initial={{ width: 0 }}
        animate={{ width: `${value}%` }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
      />
    </motion.div>
  );
};

function Button({
  children,
  className,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  variant?: "ghost";
  size?: "icon";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-10 w-10 items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
        className
      )}
    >
      {children}
    </button>
  );
}

const VideoPlayer = ({ src }: { src: string }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [progress, setProgress] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [showControls, setShowControls] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleVolumeChange = (value: number) => {
    if (videoRef.current) {
      const newVolume = value / 100;
      videoRef.current.volume = newVolume;
      setVolume(newVolume);
      setIsMuted(newVolume === 0);
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      const progress =
        (videoRef.current.currentTime / videoRef.current.duration) * 100;
      setProgress(isFinite(progress) ? progress : 0);
      setCurrentTime(videoRef.current.currentTime);
      setDuration(videoRef.current.duration);
    }
  };

  const handleSeek = (value: number) => {
    if (videoRef.current && videoRef.current.duration) {
      const time = (value / 100) * videoRef.current.duration;
      if (isFinite(time)) {
        videoRef.current.currentTime = time;
        setProgress(value);
      }
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
      if (!isMuted) {
        setVolume(0);
      } else {
        setVolume(1);
        videoRef.current.volume = 1;
      }
    }
  };

  const setSpeed = (speed: number) => {
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
      setPlaybackSpeed(speed);
    }
  };

  return (
    <motion.div
      className="relative aspect-video w-full max-w-4xl mx-auto rounded-xl overflow-hidden bg-[#11111198] shadow-[0_0_20px_rgba(0,0,0,0.2)] backdrop-blur-sm"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => setShowControls(false)}
    >
      <video
        ref={videoRef}
        className="h-full w-full object-cover"
        onTimeUpdate={handleTimeUpdate}
        src={src}
        onClick={togglePlay}
      />

      <AnimatePresence>
        {showControls && (
          <motion.div
            className="absolute bottom-0 mx-auto max-w-xl left-0 right-0 p-4 m-2 bg-[#11111198] backdrop-blur-md rounded-2xl"
            initial={{ y: 20, opacity: 0, filter: "blur(10px)" }}
            animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
            exit={{ y: 20, opacity: 0, filter: "blur(10px)" }}
            transition={{ duration: 0.6, ease: "circInOut", type: "spring" }}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-white text-sm">
                {formatTime(currentTime)}
              </span>
              <CustomSlider
                value={progress}
                onChange={handleSeek}
                className="flex-1"
              />
              <span className="text-white text-sm">{formatTime(duration)}</span>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <motion.div
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                >
                  <Button
                    onClick={togglePlay}
                    variant="ghost"
                    size="icon"
                    className="text-white hover:bg-[#111111d1] hover:text-white"
                  >
                    {isPlaying ? (
                      <Pause className="h-5 w-5" />
                    ) : (
                      <Play className="h-5 w-5" />
                    )}
                  </Button>
                </motion.div>
                <div className="flex items-center gap-x-1">
                  <motion.div
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                  >
                    <Button
                      onClick={toggleMute}
                      variant="ghost"
                      size="icon"
                      className="text-white hover:bg-[#111111d1] hover:text-white"
                    >
                      {isMuted ? (
                        <VolumeX className="h-5 w-5" />
                      ) : volume > 0.5 ? (
                        <Volume2 className="h-5 w-5" />
                      ) : (
                        <Volume1 className="h-5 w-5" />
                      )}
                    </Button>
                  </motion.div>

                  <div className="w-24">
                    <CustomSlider
                      value={volume * 100}
                      onChange={handleVolumeChange}
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {[0.5, 1, 1.5, 2].map((speed) => (
                  <motion.div
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    key={speed}
                  >
                    <Button
                      onClick={() => setSpeed(speed)}
                      variant="ghost"
                      size="icon"
                      className={cn(
                        "text-white hover:bg-[#111111d1] hover:text-white",
                        playbackSpeed === speed && "bg-[#111111d1]"
                      )}
                    >
                      {speed}x
                    </Button>
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

function SectionKicker({ children }: { children: ReactNode }) {
  return (
    <h3 className="mb-3 text-[10px] font-medium uppercase tracking-[0.18em] text-white/44">{children}</h3>
  );
}

function DetailFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="mb-1 text-[10px] uppercase tracking-[0.16em] text-white/40">{label}</p>
      <p className="truncate text-[14px] font-medium text-white/86">{value}</p>
    </div>
  );
}

function splitOverview(value: string) {
  const trimmed = value.trim();
  const sentence = trimmed.match(/^(.+?[.!?])\s+(.+)$/);

  return {
    lead: sentence?.[1] || trimmed,
    body: sentence?.[2] || "",
  };
}

function OverviewCopy({ description }: { description: string }) {
  const { lead, body } = splitOverview(description);

  return (
    <div className="pb-2">
      <SectionKicker>Overview</SectionKicker>
      <div className="max-w-[76ch]">
        <p className="text-[15px] leading-7 text-white/84">{lead}</p>
        {body && <p className="mt-2 text-[13px] leading-7 text-white/68">{body}</p>}
      </div>
    </div>
  );
}

function hasCategory(categories: string[], pattern: RegExp) {
  return categories.some((category) => pattern.test(category));
}

function SupportSignals({ categories }: { categories: string[] }) {
  const signals: { label: string; Icon: LucideIcon; active: boolean }[] = [
    { label: "Controller support", Icon: Gamepad2, active: hasCategory(categories, /controller/i) },
    { label: "Steam Cloud", Icon: Cloud, active: hasCategory(categories, /steam cloud/i) },
    { label: "Co-op", Icon: UsersRound, active: hasCategory(categories, /co-op/i) },
    { label: "Multiplayer", Icon: ShieldCheck, active: hasCategory(categories, /multi-player|multiplayer|pvp/i) },
    { label: "Family Sharing", Icon: HeartHandshake, active: hasCategory(categories, /family sharing/i) },
  ];

  return (
    <div>
      <p className="mb-2 text-[10px] uppercase tracking-[0.16em] text-white/40">Steam Features</p>
      <div className="flex flex-wrap gap-1.5">
        {signals.map(({ label, Icon, active }) => (
          <span
            key={label}
            title={label}
            aria-label={`${label}: ${active ? "listed" : "not listed"}`}
            className={cn(
              "inline-flex h-7 w-7 items-center justify-center rounded-full border transition-colors",
              active ? "border-white/14 bg-white/[0.045] text-white/72" : "border-white/6 text-white/18"
            )}
          >
            <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
          </span>
        ))}
      </div>
    </div>
  );
}

function MacEvidence({ steam, aggregate, hasMacRequirements }: { steam: SteamMetadata; aggregate: AggregateRating; hasMacRequirements: boolean }) {
  const evidence = [
    { label: "Steam macOS flag", value: steam.platforms?.mac ? "Yes" : "No", Icon: Apple },
    { label: "Mac requirements", value: hasMacRequirements ? "Listed" : "Not listed", Icon: MonitorCheck },
    { label: "User reports", value: aggregate.total_reports > 0 ? String(aggregate.total_reports) : "None", Icon: MessageSquareText },
    { label: "CrossOver", value: steam.crossover_playable ? "Playable" : "Unrated", Icon: ShieldCheck },
    { label: "Apple Silicon", value: aggregate.total_reports > 0 && aggregate.tier === "native_arm" ? "Reported native" : "Not verified", Icon: Apple },
  ];

  return (
    <div>
      <p className="mb-2 text-[10px] uppercase tracking-[0.16em] text-white/40">Mac Support</p>
      <div className="grid grid-cols-1 gap-1.5">
        {evidence.map(({ label, value, Icon }) => (
          <div key={label} className="grid grid-cols-[22px_1fr_auto] items-center gap-2 text-[11px]">
            <Icon className="h-3.5 w-3.5 text-white/46" strokeWidth={1.75} />
            <span className="text-white/54">{label}</span>
            <span className="text-white/80">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SteamMarketStrip({ steam }: { steam: SteamMetadata }) {
  const price = steam.is_free
    ? "Free to Play"
    : steam.price_overview?.final_formatted || "";
  const discount = steam.price_overview?.discount_percent || 0;

  if (!price && !discount) return null;

  return (
    <div className="grid grid-cols-2 gap-3 border-t border-white/6 pt-3">
      {price && (
        <CompactSignal Icon={BadgeDollarSign} label="Price" value={price} />
      )}
      {discount > 0 && (
        <CompactSignal Icon={TrendingUp} label="Discount" value={`${discount}% off`} />
      )}
    </div>
  );
}

function SteamReviews({ appId }: { appId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["gamedb", "steam", "reviews", appId],
    queryFn: () => getSteamReviews(appId),
    enabled: Boolean(appId),
    staleTime: 1000 * 60 * 30,
  });

  if (isLoading) {
    return (
      <div className="border-t border-white/6 pt-3">
        <CompactSignal Icon={MessageSquareText} label="Steam Reviews" value="Loading" muted />
      </div>
    );
  }

  if (!data) return null;

  const positiveRate = data.total_reviews > 0 ? Math.round((data.total_positive / data.total_reviews) * 100) : 0;

  return (
    <div className="border-t border-white/6 pt-3">
      <CompactSignal
        Icon={MessageSquareText}
        label="Steam Reviews"
        value={data.total_reviews > 0 ? `${data.review_score_desc} · ${positiveRate}%` : data.review_score_desc}
      />
    </div>
  );
}

function CompactSignal({ Icon, label, value, muted }: { Icon: LucideIcon; label: string; value: string; muted?: boolean }) {
  return (
    <div className="grid grid-cols-[24px_1fr] gap-2">
      <Icon className={cn("mt-0.5 h-4 w-4", muted ? "text-white/20" : "text-white/40")} strokeWidth={1.75} />
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-[0.16em] text-white/40">{label}</p>
        <p className={cn("truncate text-[13px] font-medium", muted ? "text-white/42" : "text-white/82")}>{value}</p>
      </div>
    </div>
  );
}

function MyMacEstimate({ hardware, tests, aggregate, steam }: { hardware?: UserHardware | null; tests: Test[]; aggregate: AggregateRating; steam?: SteamMetadata | null }) {
  const chip = hardware?.chip || hardware?.mac_model || "No hardware profile selected";
  const chipKey = hardware?.chip?.toLowerCase() || "";
  const matchingReports = chipKey ? tests.filter((test) => test.hardware?.toLowerCase().includes(chipKey)) : [];
  const bestReport = matchingReports[0];
  const title = !hardware
    ? "Add Machine+"
    : bestReport
      ? getTierConfig(bestReport.status).label
      : steam?.mac_native
        ? "Native"
        : aggregate.total_reports > 0
          ? getTierConfig(aggregate.tier).label
          : "Needs reports";
  const detail = !hardware
    ? "Add a hardware profile in Account to estimate this game against your Mac."
    : bestReport
      ? [bestReport.play_method, bestReport.fps ? `${bestReport.fps}${/\bfps\b/i.test(bestReport.fps) ? "" : " FPS"}` : "", bestReport.graphics_preset, bestReport.resolution].filter(Boolean).join(" · ")
      : steam?.mac_native
        ? "Steam lists a native Mac build."
        : aggregate.total_reports > 0
          ? `${aggregate.total_reports} real-world report${aggregate.total_reports === 1 ? "" : "s"} available.`
          : "No real-world report for this Mac yet.";

  return (
    <section className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-white/6 pb-5">
      <div className="min-w-0">
        <SectionKicker>My Mac Estimate</SectionKicker>
        <p className="truncate text-[14px] text-white/86">{chip}{hardware?.ram_gb ? ` · ${hardware.ram_gb} GB` : ""}</p>
        <p className="mt-1 truncate text-[12px] text-white/58">{detail}</p>
      </div>
      <span className="rounded-full border border-white/10 bg-white/[0.035] px-3 py-1 text-[12px] font-medium text-white/72">{title}</span>
    </section>
  );
}

function DetailBenchmarkSummary({
  hardware,
  tests,
  aggregate,
  steam,
  reportCount,
}: {
  hardware?: UserHardware | null;
  tests: Test[];
  aggregate: AggregateRating;
  steam?: SteamMetadata | null;
  reportCount: string;
}) {
  const latest = tests[0];
  const bestStatus = latest?.status || (aggregate.total_reports > 0 ? aggregate.tier : steam?.mac_native ? "native_arm" : "");
  const method = latest?.play_method || (steam?.mac_native ? "Native" : "—");
  const fps = latest?.fps ? `${latest.fps}${/\bfps\b/i.test(latest.fps) ? "" : " FPS"}` : "—";
  const setup = [latest?.translation_layer, latest?.graphics_preset, latest?.resolution].filter(Boolean).join(" · ") || "—";
  const profile = hardware ? [hardware.chip || hardware.mac_model, hardware.ram_gb ? `${hardware.ram_gb} GB` : ""].filter(Boolean).join(" · ") : "—";

  return (
    <section className="grid grid-cols-2 gap-x-6 gap-y-4 border-b border-white/6 pb-5 sm:grid-cols-3 lg:grid-cols-6">
      <DetailFact label="Reports" value={reportCount} />
      <DetailFact label="Rating" value={bestStatus ? getTierConfig(bestStatus).label : "Not Rated"} />
      <DetailFact label="Method" value={method} />
      <DetailFact label="FPS" value={fps} />
      <DetailFact label="Setup" value={setup} />
      <DetailFact label="My Mac" value={profile} />
    </section>
  );
}

function RequirementBox({ title, minimum, recommended }: { title: string; minimum?: string; recommended?: string }) {
  const renderLines = (value: string) => value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^(minimum|recommended):?$/i.test(line));

  const compactLines = (value: string) => renderLines(value)
    .filter((line) => /^(OS|Processor|Memory|Graphics|Storage):/i.test(line))
    .slice(0, 5);

  const RequirementLines = ({ value }: { value: string }) => (
    <div className="space-y-1.5">
      {compactLines(value).map((line) => {
        const [label, ...rest] = line.split(":");
        return (
          <div key={line} className="grid grid-cols-[68px_1fr] gap-2 text-[11px] leading-5">
            <span className="text-white/42">{label}</span>
            <span className="text-white/68">{rest.join(":").trim()}</span>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="relative -top-2 min-w-0">
      <h3 className="mb-3 text-[11px] font-medium uppercase tracking-[0.16em] text-white/46">{title}</h3>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {minimum && (
          <div>
            <p className="mb-1.5 text-[10px] uppercase tracking-wider text-white/25">Minimum</p>
            <RequirementLines value={minimum} />
          </div>
        )}
        {recommended && (
          <div style={{ transform: "translateY(-6px)" }}>
            <p className="mb-1.5 text-[10px] uppercase tracking-wider text-white/25">Recommended</p>
            <RequirementLines value={recommended} />
          </div>
        )}
      </div>
    </div>
  );
}

function TestCard({ test }: { test: Test }) {
  const [expanded, setExpanded] = useState(false);
  const fpsLabel = test.fps ? (/\bfps\b/i.test(test.fps) ? test.fps : `${test.fps} FPS`) : "";
  return (
    <div className="border border-[#2a2a2a] rounded-lg bg-[#0d0d0d] overflow-hidden">
      <div className="px-3 py-2.5 flex items-center justify-between cursor-pointer hover:bg-[#111] transition-colors" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-3 min-w-0">
          <TierBadge tier={test.status} size="sm" />
          {test.user_display_name && <span className="text-[11px] text-white/30">{test.user_display_name}</span>}
          <span className="text-[11px] text-white/20">{new Date(test.tested_at).toLocaleDateString()}</span>
          {test.play_method && <span className="text-[11px] text-white/40">{test.play_method}</span>}
          <span className="text-[11px] font-mono text-white/20">{test.hardware || "—"}</span>
          <span className="text-[11px] text-white/20">{test.macos_version || "—"}</span>
          {fpsLabel && <span className="text-[11px] font-mono text-white/30">{fpsLabel}</span>}
        </div>
        <span className="text-[10px] text-white/20 ml-2">{expanded ? "▲" : "▼"}</span>
      </div>
      {expanded && (
        <div className="px-3 py-2.5 border-t border-[#1a1a1a] text-[12px] space-y-2">
          {test.notes && <p className="text-white/40 whitespace-pre-wrap">{test.notes}</p>}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-white/20">
            {test.wine_version && <span>Wine: {test.wine_version}</span>}
            {test.crossover_version && <span>CrossOver: {test.crossover_version}</span>}
            {test.gptk_version && <span>GPTK: {test.gptk_version}</span>}
            {test.translation_layer && test.translation_layer !== "None" && <span>{test.translation_layer}</span>}
            {test.graphics_preset && <span>Preset: {test.graphics_preset}</span>}
            {test.resolution && <span>Resolution: {test.resolution}</span>}
            {test.launcher && <span>Launcher: {test.launcher}</span>}
          </div>
          {test.issues && test.issues.length > 0 && (
            <div className="mt-2">
              <p className="text-[10px] font-medium text-white/20 uppercase tracking-wider mb-1">Issues</p>
              {test.issues.map((iss: Issue) => (
                <IssueRow key={iss.id} issue={iss} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function IssueRow({ issue }: { issue: Issue }) {
  return (
    <div className="flex items-start gap-2 py-1 border-l-2 border-[#2a2a2a] pl-2">
      <span className={`mt-0.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${issue.resolved ? "bg-emerald-400" : issue.severity === "critical" ? "bg-red-400" : issue.severity === "major" ? "bg-orange-400" : "bg-white/20"}`} />
      <div className="flex-1 min-w-0">
        <p className={`text-[12px] text-white/50 ${issue.resolved ? "line-through opacity-50" : ""}`}>{issue.description}</p>
        {issue.workaround && <p className="text-[11px] text-amber-400/60 mt-0.5">Fix: {issue.workaround}</p>}
        {issue.resolved_by_version && <p className="text-[11px] text-emerald-400/60 mt-0.5">Fixed in {issue.resolved_by_version}</p>}
      </div>
    </div>
  );
}

function AddTestForm({ onSubmit }: { onSubmit: (req: AddTestRequest) => void }) {
  const [status, setStatus] = useState<CompatTier>("playable");
  const [playMethod, setPlayMethod] = useState<AddTestRequest["play_method"]>("CrossOver");
  const [translationLayer, setTranslationLayer] = useState<AddTestRequest["translation_layer"]>("D3DMetal");
  const [macos, setMacos] = useState("");
  const [hardware, setHardware] = useState("");
  const [ram, setRam] = useState("");
  const [wine, setWine] = useState("");
  const [crossover, setCrossover] = useState("");
  const [gptkVer, setGptkVer] = useState("");
  const [launcher, setLauncher] = useState("");
  const [preset, setPreset] = useState("");
  const [resolution, setResolution] = useState("");
  const [fps, setFps] = useState("");
  const [notes, setNotes] = useState("");

  const inputCls = "w-full px-2.5 py-2 text-[12px] rounded-lg border border-[#333] bg-[#1a1a1a] text-white placeholder:text-white/50 focus:outline-none focus:border-white/70 transition-colors";
  const labelCls = "block text-[10px] font-medium text-white/80 mb-1 uppercase tracking-wider";

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div>
          <label className={labelCls}>Run Method</label>
          <select value={playMethod} onChange={(e) => setPlayMethod(e.target.value as AddTestRequest["play_method"])} className={inputCls}>
            {["Native", "CrossOver", "Parallels", "GPTK"].map((method) => (
              <option key={method} value={method}>{method}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>D3D Layer</label>
          <select value={translationLayer} onChange={(e) => setTranslationLayer(e.target.value as AddTestRequest["translation_layer"])} className={inputCls}>
            {["D3DMetal", "DXVK", "None"].map((layer) => (
              <option key={layer} value={layer}>{layer}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Compatibility Tier</label>
          <select value={status} onChange={(e) => setStatus(e.target.value as CompatTier)} className={inputCls}>
            {NEW_TIERS.map((t) => (
              <option key={t} value={t}>{getTierConfig(t).label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>FPS</label>
          <input value={fps} onChange={(e) => setFps(e.target.value)} placeholder="e.g. 60" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>macOS Version</label>
          <select value={macos} onChange={(e) => setMacos(e.target.value)} className={inputCls}>
            <option value="">Select</option>
            {["26.0","15.5","15.4","15.3","15.2","15.1","15.0","14.7","14.6","14.5","14.4","14.3","14.2","14.1","14.0","13.6","13.5","13.4","13.3","13.2","13.1","13.0"].map(v => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Chip</label>
          <select value={hardware} onChange={(e) => setHardware(e.target.value)} className={inputCls}>
            <option value="">Select</option>
            {["M1","M1 Pro","M1 Max","M1 Ultra","M2","M2 Pro","M2 Max","M2 Ultra","M3","M3 Pro","M3 Max","M4","M4 Pro","M4 Max","M5","M5 Pro","M5 Max"].map(h => (
              <option key={h} value={h}>{h}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>RAM</label>
          <select value={ram} onChange={(e) => setRam(e.target.value)} className={inputCls}>
            <option value="">Select</option>
            {["8 GB","16 GB","18 GB","24 GB","32 GB","36 GB","48 GB","64 GB","96 GB","128 GB","192 GB"].map(value => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Wine Version</label>
          <input value={wine} onChange={(e) => setWine(e.target.value)} placeholder="e.g. 9.0" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>CrossOver Version</label>
          <input value={crossover} onChange={(e) => setCrossover(e.target.value)} placeholder="e.g. 24.0.5" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>GPTK Version</label>
          <input value={gptkVer} onChange={(e) => setGptkVer(e.target.value)} placeholder="e.g. 2.0" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Launcher</label>
          <input value={launcher} onChange={(e) => setLauncher(e.target.value)} placeholder="e.g. Steam, Heroic" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Graphics Preset</label>
          <select value={preset} onChange={(e) => setPreset(e.target.value)} className={inputCls}>
            <option value="">Select</option>
            {["Low","Medium","High","Ultra","Custom"].map(value => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Resolution</label>
          <input value={resolution} onChange={(e) => setResolution(e.target.value)} placeholder="e.g. 1920x1080" className={inputCls} />
        </div>
      </div>
      <div>
        <label className={labelCls}>Notes</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={`${inputCls} resize-none`} placeholder="Performance notes, workarounds, issues..." />
      </div>
      <button
        onClick={() => onSubmit({
          status, play_method: playMethod, translation_layer: translationLayer,
          macos_version: macos || undefined, hardware: [hardware, ram].filter(Boolean).join(" ") || undefined,
          wine_version: wine || undefined, crossover_version: crossover || undefined,
          gptk_version: gptkVer || undefined, launcher: launcher || undefined,
          graphics_preset: preset || undefined, resolution: resolution || undefined,
          fps: fps || undefined, notes: notes || undefined,
        })}
        className="w-full mt-4 px-4 py-2.5 text-[13px] font-medium rounded-lg bg-white text-black hover:bg-white/90 transition-all"
      >
        Submit Report
      </button>
    </div>
  );
}
