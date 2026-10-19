// @vitest-environment happy-dom

import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'vue-sonner';

import { i18n } from '@/i18n';
import type { PrivacyExecutionPlan, PrivacyExecutionResult, PrivacyScanResult } from '@/lib/models/privacy';
import { useAppStore } from '@/stores/app-store';
import { usePrivacyStore } from '@/stores/privacy-store';

import PrivacyPage from './index.vue';

const serviceMocks = vi.hoisted(() => ({
  scan: vi.fn(),
  scanWithProgress: vi.fn(),
  cancelScan: vi.fn(),
  prepare: vi.fn(),
  closeBrowsers: vi.fn(),
  refreshBrowserStatus: vi.fn(),
  execute: vi.fn(),
  executeWithProgress: vi.fn(),
  cancelExecution: vi.fn(),
}));

vi.mock('vue-sonner', () => ({ toast: { warning: vi.fn(), success: vi.fn() } }));

vi.mock('@/lib/services/privacy-service', () => ({ PrivacyService: serviceMocks }));
vi.mock('@/lib/services/application-icon-service', () => ({
  ApplicationIconService: { resolveIncrementally: vi.fn().mockResolvedValue(new Map()) },
}));
vi.mock('@/lib/services/macos-permission-service', () => ({
  MacOsPermissionService: { isMacOs: () => false, openPrivacySettings: vi.fn() },
}));

const scan: PrivacyScanResult = {
  schemaVersion: 6,
  scanId: 'scan-1',
  revision: 'revision-1',
  timeRange: 'allTime',
  scannedAtMs: 1,
  elapsedMs: 2,
  coverage: [],
  items: [
    {
      token: 'history-token',
      sourceId: 'firefox',
      sourceName: 'Firefox',
      profileId: 'firefox:default',
      profileName: 'default',
      category: 'browserActivity',
      kind: 'browsingHistory',
      sensitivity: 'activity',
      impact: 'low',
      recommendation: 'recommended',
      capability: 'ready',
      itemCount: 3,
      estimatedBytes: 0,
      selectedByDefault: true,
      requiresBrowserClose: false,
      synchronizationMayPropagate: false,
    },
  ],
};

const plan: PrivacyExecutionPlan = {
  schemaVersion: 2,
  planId: 'privacy-plan-1234567890',
  scanId: scan.scanId,
  createdAtMs: 1,
  expiresAtMs: 2,
  requiresConfirmation: true,
  requiresBrowserClose: false,
  browserCloseRequirements: [],
  items: [
    {
      token: 'history-token',
      sourceId: 'firefox',
      sourceName: 'Firefox',
      profileName: 'default',
      kind: 'browsingHistory',
      impact: 'low',
      itemCount: 3,
      estimatedBytes: 0,
      requiresBrowserClose: false,
      synchronizationMayPropagate: false,
    },
  ],
};

const result: PrivacyExecutionResult = {
  planId: plan.planId,
  affectedItemCount: 3,
  failedItemCount: 0,
  items: [
    {
      token: 'history-token',
      status: 'cleared',
      affectedItemCount: 3,
      verified: true,
      failureReason: null,
    },
  ],
  scan: null,
};

const passthroughStub = {
  template: '<div><slot name="actions" /><slot name="notice" /><slot /><slot name="footer" /></div>',
};

function mountPage() {
  return mount(PrivacyPage, {
    global: {
      plugins: [i18n],
      stubs: {
        Button: { template: '<button type="button" @click="$emit(\'click\')"><slot /></button>' },
        MdEmptyState: passthroughStub,
        MdIcon: true,
        MdOperationProgress: true,
        MdOperationWorkspace: passthroughStub,
        MdPageShell: passthroughStub,
        MdPermissionGuidance: true,
        MdPrivacyDetailDialog: true,
        MdPrivacyPlanDialog: {
          props: ['modelValue'],
          emits: ['execute'],
          template:
            '<button v-if="modelValue" class="execute-plan" type="button" @click="$emit(\'execute\')">execute</button>',
        },
        MdPrivacyResultDialog: {
          props: ['modelValue'],
          template: '<div class="privacy-result-dialog" :data-open="modelValue" />',
        },
        MdPrivacyResultList: true,
        MdResultWorkspace: passthroughStub,
        MdSelectionActionBar: {
          emits: ['action'],
          template: '<button class="prepare-cleanup" type="button" @click="$emit(\'action\')">prepare</button>',
        },
        MdSelectionMode: true,
        MdTooltip: true,
        MdSwitch: {
          props: ['modelValue'],
          emits: ['update:modelValue'],
          template:
            '<input type="checkbox" class="include-browsers-switch" :checked="modelValue" @change="$emit(\'update:modelValue\', $event.target.checked)" />',
        },
        Select: passthroughStub,
        SelectContent: passthroughStub,
        SelectItem: passthroughStub,
        SelectTrigger: passthroughStub,
        SelectValue: passthroughStub,
      },
    },
  });
}

describe('privacy page cleanup flow', () => {
  beforeEach(() => {
    vi.mocked(toast.warning).mockClear();
    vi.mocked(toast.success).mockClear();
    setActivePinia(createPinia());
    for (const mock of Object.values(serviceMocks)) mock.mockReset();
    vi.spyOn(useAppStore(), 'refreshSystemDisk').mockResolvedValue(true);
  });

  it('uses the standard large primary action for the initial scan', () => {
    const wrapper = mountPage();
    const scanButton = wrapper.get('button');

    expect(scanButton.attributes('size')).toBe('lg');
    expect(scanButton.attributes('type')).toBe('button');
    wrapper.unmount();
  });

  it('tells the user to close open browsers whose data was not read', () => {
    const store = usePrivacyStore();
    const result = structuredClone(scan);
    result.items = result.items.map(item => ({ ...item, capability: 'browserRunning' as const, itemCount: 0 }));
    store.scanResult = result;
    const wrapper = mountPage();

    expect(wrapper.get('[role="status"]').text()).toContain('Close Firefox and scan again');
    wrapper.unmount();
  });

  it('keeps browsers out of the scan until the user turns them on', async () => {
    const store = usePrivacyStore();
    const wrapper = mountPage();
    const toggle = wrapper.get<HTMLInputElement>('.include-browsers-switch');

    expect(toggle.element.checked).toBe(false);
    expect(store.includeBrowsers).toBe(false);
    await toggle.setValue(true);
    expect(store.includeBrowsers).toBe(true);
    wrapper.unmount();
  });

  it('reports an empty execution as no remaining selection without showing cleanup success', async () => {
    const store = usePrivacyStore();
    store.scanResult = structuredClone(scan);
    store.selectedTokens = ['history-token'];
    serviceMocks.prepare.mockResolvedValue(structuredClone(plan));
    serviceMocks.executeWithProgress.mockResolvedValue({
      planId: plan.planId,
      affectedItemCount: 0,
      failedItemCount: 0,
      items: [],
      scan: structuredClone(scan),
    });
    const wrapper = mountPage();

    await wrapper.get('.prepare-cleanup').trigger('click');
    await flushPromises();
    await wrapper.get('.execute-plan').trigger('click');
    await flushPromises();

    expect(toast.warning).toHaveBeenCalledWith(i18n.global.t('privacy.feedback.noRemainingSelection'));
    expect(toast.success).not.toHaveBeenCalled();
    expect(wrapper.get('.privacy-result-dialog').attributes('data-open')).toBe('false');
    expect(store.scanResult).toEqual(scan);
    expect(store.selectedTokens).toEqual(['history-token']);
    expect(serviceMocks.scanWithProgress).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('opens the result immediately after cleanup without starting another scan', async () => {
    const store = usePrivacyStore();
    store.scanResult = structuredClone(scan);
    store.selectedTokens = ['history-token'];
    serviceMocks.prepare.mockResolvedValue(structuredClone(plan));
    serviceMocks.executeWithProgress.mockResolvedValue(structuredClone(result));
    const wrapper = mountPage();

    await wrapper.get('.prepare-cleanup').trigger('click');
    await flushPromises();
    await wrapper.get('.execute-plan').trigger('click');
    await flushPromises();

    expect(serviceMocks.prepare).toHaveBeenCalledWith({ scanId: scan.scanId, tokens: ['history-token'] });
    expect(serviceMocks.executeWithProgress).toHaveBeenCalledWith(
      { planId: plan.planId, excludedSourceIds: [] },
      expect.any(Function)
    );
    expect(serviceMocks.scan).not.toHaveBeenCalled();
    expect(serviceMocks.scanWithProgress).not.toHaveBeenCalled();
    expect(wrapper.get('.privacy-result-dialog').attributes('data-open')).toBe('true');
    expect(store.scanResult?.items[0]).toMatchObject({ capability: 'empty', itemCount: 0 });
    wrapper.unmount();
  });
});
