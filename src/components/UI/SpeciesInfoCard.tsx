import { GlassCard } from '@/components/common/GlassCard';
import { useEcosystemStore } from '@/store/useEcosystemStore';
import { getSpeciesById, TROPHIC_LEVEL_COLORS, TROPHIC_LEVEL_LABELS } from '@/data/species';
import { X, Trash2 } from 'lucide-react';

export function SpeciesInfoCard() {
  const selectedOrganismId = useEcosystemStore((s) => s.selectedOrganismId);
  const organisms = useEcosystemStore((s) => s.organisms);
  const setSelectedOrganism = useEcosystemStore((s) => s.setSelectedOrganism);
  const removeOrganism = useEcosystemStore((s) => s.removeOrganism);

  const organism = organisms.find((o) => o.id === selectedOrganismId);
  const species = organism ? getSpeciesById(organism.speciesId) : null;

  if (!organism || !species) return null;

  const energyPercent = (organism.energy / (species.energyValue * 1.5)) * 100;
  const agePercent = (organism.age / species.lifespan) * 100;

  const getStateLabel = (state: string) => {
    const labels: Record<string, string> = {
      idle: '休息中',
      wandering: '漫游中',
      hunting: '捕猎中',
      fleeing: '逃跑中',
      eating: '进食中',
      reproducing: '繁殖中',
    };
    return labels[state] || state;
  };

  return (
    <div className="absolute top-20 right-4 z-40 animate-in fade-in slide-in-from-right-4 duration-300">
      <GlassCard className="p-5 w-72">
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center gap-3">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center text-4xl"
              style={{
                background: `radial-gradient(circle at 30% 30%, ${species.color}80, ${species.color}30)`,
                boxShadow: `0 0 20px ${species.color}40`,
              }}
            >
              {species.emoji}
            </div>
            <div>
              <h3 className="text-white font-bold text-xl">{species.name}</h3>
              <div
                className="text-xs px-2 py-0.5 rounded-full inline-block mt-1"
                style={{
                  backgroundColor: TROPHIC_LEVEL_COLORS[species.trophicLevel] + '40',
                  color: TROPHIC_LEVEL_COLORS[species.trophicLevel],
                }}
              >
                {TROPHIC_LEVEL_LABELS[species.trophicLevel]}
              </div>
            </div>
          </div>
          <button
            onClick={() => setSelectedOrganism(null)}
            className="text-white/50 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <p className="text-white/70 text-sm mb-4 leading-relaxed">{species.description}</p>

        <div className="space-y-3 mb-4">
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-white/60">能量值</span>
              <span className="text-yellow-400 font-medium">{Math.round(organism.energy)} / {species.energyValue}</span>
            </div>
            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-yellow-400 transition-all"
                style={{
                  width: `${energyPercent}%`,
                  boxShadow: '0 0 8px #facc15',
                }}
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-white/60">寿命</span>
              <span className="text-cyan-400 font-medium">{Math.round(organism.age)} / {species.lifespan}</span>
            </div>
            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-cyan-400 transition-all"
                style={{
                  width: `${agePercent}%`,
                  boxShadow: '0 0 8px #22d3ee',
                }}
              />
            </div>
          </div>

          <div className="flex justify-between items-center pt-1">
            <span className="text-white/60 text-xs">当前状态</span>
            <span className="text-white font-medium text-sm">{getStateLabel(organism.state)}</span>
          </div>
        </div>

        <div className="border-t border-white/10 pt-4 space-y-2">
          {species.diet.length > 0 && (
            <div>
              <div className="text-white/60 text-xs mb-1">食物</div>
              <div className="flex flex-wrap gap-1">
                {species.diet.map((id) => {
                  const prey = getSpeciesById(id);
                  if (!prey) return null;
                  return (
                    <span
                      key={id}
                      className="text-xs px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: prey.color + '40', color: 'white' }}
                    >
                      {prey.emoji} {prey.name}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {species.predators.length > 0 && (
            <div>
              <div className="text-white/60 text-xs mb-1">天敌</div>
              <div className="flex flex-wrap gap-1">
                {species.predators.map((id) => {
                  const pred = getSpeciesById(id);
                  if (!pred) return null;
                  return (
                    <span
                      key={id}
                      className="text-xs px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: pred.color + '40', color: 'white' }}
                    >
                      {pred.emoji} {pred.name}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <button
          onClick={() => {
            removeOrganism(organism.id);
            setSelectedOrganism(null);
          }}
          className="mt-4 w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors text-sm font-medium"
        >
          <Trash2 size={16} />
          移除此生物
        </button>
      </GlassCard>
    </div>
  );
}
