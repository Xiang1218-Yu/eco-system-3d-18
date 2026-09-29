import { useEffect, useState } from 'react';
import { GlassCard } from '@/components/common/GlassCard';
import { useEcosystemStore } from '@/store/useEcosystemStore';
import { Play, Pause, RotateCcw, Eye, EyeOff, Sparkles, Dices } from 'lucide-react';
import { uiRng } from '@/utils/random';

export function ControlButtons() {
  const isRunning = useEcosystemStore((s) => s.isRunning);
  const toggleSimulation = useEcosystemStore((s) => s.toggleSimulation);
  const resetEcosystem = useEcosystemStore((s) => s.resetEcosystem);
  const showLabels = useEcosystemStore((s) => s.showLabels);
  const toggleLabels = useEcosystemStore((s) => s.toggleLabels);
  const selectedSpeciesId = useEcosystemStore((s) => s.selectedSpeciesId);
  const seed = useEcosystemStore((s) => s.seed);
  const setSeed = useEcosystemStore((s) => s.setSeed);

  // 输入框本地状态：只在提交（回车/失焦）时才真正重置实验，
  // 避免输入过程中反复清缸。
  const [seedInput, setSeedInput] = useState(String(seed));

  useEffect(() => {
    setSeedInput(String(seed));
  }, [seed]);

  const commitSeed = () => {
    const parsed = Number.parseInt(seedInput, 10);
    if (Number.isFinite(parsed) && parsed >= 0) {
      setSeed(parsed);
    } else {
      setSeedInput(String(seed));
    }
  };

  const randomizeSeed = () => {
    // 摇种子属于用户驱动的界面随机，刻意不使用实验随机流。
    setSeed(Math.floor(uiRng.next() * 0xffffffff) >>> 0);
  };

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40">
      <GlassCard className="px-4 py-2 flex items-center gap-2">
        <div className="flex items-center gap-2 pr-3 border-r border-white/20">
          <Sparkles size={18} className="text-cyan-400" />
          <span className="text-white font-bold text-lg tracking-wide">
            3D 虚拟生态缸
          </span>
        </div>

        {selectedSpeciesId && (
          <div className="px-3 py-1 rounded-full bg-cyan-500/30 text-cyan-300 text-sm animate-pulse">
            👆 点击缸内任意位置放置物种
          </div>
        )}

        <div className="flex items-center gap-1.5 pl-2 border-l border-white/20">
          <span className="text-cyan-200/70 text-xs font-medium select-none">种子</span>
          <input
            type="number"
            min={0}
            max={4294967295}
            value={seedInput}
            onChange={(e) => setSeedInput(e.target.value)}
            onBlur={commitSeed}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
            title="设置随机种子并重置（回车或失焦生效）；相同种子产生一致的实验序列"
            className="w-24 px-2 py-1 rounded-lg bg-white/10 text-white text-xs font-mono outline-none focus:bg-white/20 focus:ring-1 focus:ring-cyan-400/60 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          <button
            onClick={randomizeSeed}
            className="p-2 rounded-xl hover:bg-white/10 transition-colors text-white"
            title="随机一个新种子并重置"
          >
            <Dices size={18} />
          </button>
        </div>

        <div className="flex items-center gap-1 pl-2 border-l border-white/20">
          <button
            onClick={toggleSimulation}
            className="p-2 rounded-xl hover:bg-white/10 transition-colors text-white"
            title={isRunning ? '暂停模拟' : '开始模拟'}
          >
            {isRunning ? <Pause size={18} /> : <Play size={18} />}
          </button>

          <button
            onClick={toggleLabels}
            className="p-2 rounded-xl hover:bg-white/10 transition-colors text-white"
            title={showLabels ? '隐藏标签' : '显示标签'}
          >
            {showLabels ? <Eye size={18} /> : <EyeOff size={18} />}
          </button>

          <button
            onClick={resetEcosystem}
            className="p-2 rounded-xl hover:bg-white/10 transition-colors text-white"
            title="用当前种子重置生态缸（可复现实验）"
          >
            <RotateCcw size={18} />
          </button>
        </div>
      </GlassCard>
    </div>
  );
}
