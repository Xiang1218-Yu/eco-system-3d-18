import { useEffect, useState } from 'react';
import { Dices } from 'lucide-react';
import { useEcosystemStore } from '@/store/useEcosystemStore';

/**
 * 随机种子控制。
 * - 输入种子后回车（或失焦）会以新种子重置实验；
 * - 同一种子重置得到一致的初始状态与演化序列；
 * - 🎲 按钮随机挑选一颗种子（属于用户操作，不消费实验随机流）。
 */
export function SeedControl() {
  const seed = useEcosystemStore((s) => s.seed);
  const resetEcosystem = useEcosystemStore((s) => s.resetEcosystem);
  const [value, setValue] = useState(String(seed));

  useEffect(() => {
    setValue(String(seed));
  }, [seed]);

  const applySeed = () => {
    const trimmed = value.trim();
    if (!trimmed) {
      setValue(String(seed));
      return;
    }
    resetEcosystem(trimmed);
  };

  const randomizeSeed = () => {
    resetEcosystem(Math.floor(Math.random() * 0xffffffff));
  };

  return (
    <div className="flex items-center gap-1 pl-2 border-l border-white/20">
      <span className="text-white/60 text-xs">种子</span>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={applySeed}
        onKeyDown={(e) => {
          if (e.key === 'Enter') applySeed();
        }}
        title="随机种子：相同种子重置后得到一致的实验结果"
        className="w-20 px-2 py-1 rounded-lg bg-white/10 text-white text-xs font-mono border border-white/20 focus:outline-none focus:border-cyan-400"
      />
      <button
        onClick={randomizeSeed}
        className="p-2 rounded-xl hover:bg-white/10 transition-colors text-white"
        title="随机一颗种子并重置"
      >
        <Dices size={18} />
      </button>
    </div>
  );
}
