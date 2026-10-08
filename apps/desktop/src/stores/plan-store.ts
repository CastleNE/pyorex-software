import { create } from 'zustand';
import { callRpc } from '../lib/rpc';

/**
 * Edition of PyOreX the engine is enforcing (`app.plan`, services/analytics/analysis/licensing/plans.py). The engine is
 * the authority — it refuses what the plan does not include — the interface only reflects it so the user sees why.
 */
export type PlanId = 'demo' | 'geochem' | 'full' | 'academic';
export interface Plan { plan: PlanId; label: string; modules: string[]; features: string[]; max_rows: number | null }

interface PlanState {
  plan: Plan | null;
  load: () => Promise<void>;
}

export const usePlanStore = create<PlanState>((set) => ({
  plan: null,
  load: async () => {
    try { set({ plan: await callRpc<Plan>('app.plan') }); } catch { /* engine not reachable yet: the status bar already says so */ }
  },
}));

/** While the plan is unknown nothing is locked in the interface (the engine still enforces it). */
export const hasModule = (plan: Plan | null, module: string) => !plan || plan.modules.includes(module);
export const hasFeature = (plan: Plan | null, feature: string) => !plan || plan.features.includes(feature);
export const usePlanAllows = (kind: 'module' | 'feature', name: string) => usePlanStore(s => (kind === 'module' ? hasModule(s.plan, name) : hasFeature(s.plan, name)));
