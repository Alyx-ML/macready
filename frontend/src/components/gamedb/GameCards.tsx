import { useState } from "react";
import { getTierConfig } from "./tierConfig";
import type { Game } from "../../types/gamedb";
import { LiquidGlass } from "./LiquidGlass";

export function TierBadge({ tier, size = "sm" }: { tier: string; size?: "sm" | "md" | "lg" }) {
  const cfg = getTierConfig(tier);
  const sizeClasses = {
    sm: "px-2 py-0.5 text-[10px]",
    md: "px-2.5 py-1 text-[11px]",
    lg: "px-3 py-1.5 text-[12px]",
  };
  return (
    <span className={`inline-flex items-center justify-center font-bold uppercase tracking-wider ${cfg.solidBg} text-black border border-black/20 rounded shadow-sm ${sizeClasses[size]}`}>
      {cfg.label}
    </span>
  );
}

export function NotRatedBadge({ size = "sm" }: { size?: "sm" | "md" | "lg" }) {
  const sizeClasses = {
    sm: "px-2 py-0.5 text-[10px]",
    md: "px-2.5 py-1 text-[11px]",
    lg: "px-3 py-1.5 text-[12px]",
  };
  return (
    <span className={`inline-flex items-center justify-center font-bold uppercase tracking-wider rounded border border-white/15 bg-white/8 text-white/70 shadow-sm ${sizeClasses[size]}`}>
      Not Rated
    </span>
  );
}

export function GameCard({ game, onClick }: { game: Game; onClick: () => void }) {
  const [imgError, setImgError] = useState(false);
  const tier = game.aggregate_tier || game.latest_test?.status;
  const coverUrl = game.cover_art_url;

  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setMousePosition({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  return (
    <button
      onClick={onClick}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="group w-full relative text-left rounded-2xl bg-black/40 backdrop-blur-3xl transition-all duration-300 focus:outline-none shadow-xl overflow-hidden"
    >
      <div className="absolute inset-0 rounded-2xl border border-white/5 pointer-events-none z-40" />
      
      <div 
        className="absolute inset-0 z-50 rounded-2xl pointer-events-none transition-opacity duration-300"
        style={{
           opacity: isHovered ? 1 : 0,
           background: `radial-gradient(350px circle at ${mousePosition.x}px ${mousePosition.y}px, rgba(255,255,255,0.7), transparent 40%)`,
           WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
           WebkitMaskComposite: "xor",
           maskComposite: "exclude",
           padding: "1.5px"
        }}
      />
      
      <div className="w-full h-full relative z-10">
        <LiquidGlass
          displacementScale={12}
          blurAmount={0.06}
          saturation={115}
          aberrationIntensity={1}
          elasticity={0.2}
          cornerRadius={16}
          padding="0px"
        >
          <div className="relative w-full aspect-[460/215] bg-transparent overflow-hidden">
            {coverUrl && !imgError ? (
              <img
                src={coverUrl}
                alt={game.name}
                loading="lazy"
                onError={() => setImgError(true)}
                className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity duration-300"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center bg-gradient-to-br from-white/5 to-transparent">
                <span className="text-white/20 text-[24px] font-bold tracking-tight mb-2 uppercase">{game.name.charAt(0)}</span>
              </div>
            )}
            
            {/* Sleek Gradient Overlay for Text */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-80 group-hover:opacity-100 transition-opacity duration-300" />

            {/* Content Overlay */}
            <div className="absolute bottom-0 left-0 right-0 p-3 flex flex-col justify-end">
              <h3 className="text-[13px] font-medium text-white truncate drop-shadow-md">{game.name}</h3>
              <div className="flex items-center justify-between mt-1">
                <div className="flex items-center gap-2">
                  {game.platform && <span className="text-[10px] text-white/50">{game.platform}</span>}
                  {game.latest_test?.hardware && <span className="text-[10px] text-white/40 font-mono">· {game.latest_test.hardware}</span>}
                </div>
                {tier && (
                  <div className="scale-90 origin-bottom-right">
                    <TierBadge tier={tier} size="sm" />
                  </div>
                )}
              </div>
            </div>
          </div>
        </LiquidGlass>
      </div>
    </button>
  );
}

export function EmptyState({ onAdd }: { onAdd?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 px-4">
      <p className="text-[14px] text-white/40 mb-1">No reports yet</p>
      <p className="text-[12px] text-white/20 mb-6">Be the first to submit compatibility data.</p>
      {onAdd && (
        <button
          onClick={onAdd}
          className="px-4 py-2 text-[12px] font-medium rounded-lg border border-[#333] text-white/60 hover:text-white hover:border-white/40 transition-all"
        >
          + Submit Report
        </button>
      )}
    </div>
  );
}

export function LoadingCards() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="border border-[#2a2a2a] rounded-lg overflow-hidden bg-[#0d0d0d]">
          <div className="w-full aspect-[460/215] skeleton" />
          <div className="px-3 py-2.5 space-y-2">
            <div className="skeleton h-4 w-3/4" />
            <div className="skeleton h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}
