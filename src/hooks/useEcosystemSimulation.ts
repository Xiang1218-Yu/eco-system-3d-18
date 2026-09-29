import { useEffect, useRef } from 'react';
import { useEcosystemStore } from '@/store/useEcosystemStore';
import { simulateStep } from '@/utils/ecosystemSimulator';

export function useEcosystemSimulation() {
  const frameRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const isRunningRef = useRef<boolean>(true);

  const batchUpdateOrganisms = useEcosystemStore((s) => s.batchUpdateOrganisms);
  const batchRemoveOrganisms = useEcosystemStore((s) => s.batchRemoveOrganisms);
  const addOrganism = useEcosystemStore((s) => s.addOrganism);
  const incrementTime = useEcosystemStore((s) => s.incrementTime);
  const isRunning = useEcosystemStore((s) => s.isRunning);

  useEffect(() => {
    isRunningRef.current = isRunning;
  }, [isRunning]);

  useEffect(() => {
    const tick = (time: number) => {
      if (isRunningRef.current && time - lastTimeRef.current > 60) {
        lastTimeRef.current = time;

        const state = useEcosystemStore.getState();
        const { updates, toRemove, toAdd } = simulateStep(
          state.organisms,
          state.randomStreams.experiment,
        );

        if (updates.length > 0) {
          batchUpdateOrganisms(updates);
        }
        if (toRemove.length > 0) {
          batchRemoveOrganisms(toRemove);
        }
        toAdd.forEach(({ speciesId, position }) => {
          addOrganism(speciesId, position);
        });

        incrementTime();
      }

      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);

    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, [batchUpdateOrganisms, batchRemoveOrganisms, addOrganism, incrementTime]);
}
