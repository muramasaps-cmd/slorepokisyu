import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import { PurposeMenu } from '../PurposeMenu';
import { parseHash } from '../../App';

describe('Prompt 46: 目的別メニュー（プルダウン）テストスイート', () => {
  const clean = (s: string) => s.replace(/<!--.*?-->/g, '');

  describe('1. 現在地の表示 (Breadcrumb Indicator)', () => {
    it('displays "店舗を分析する › 店舗の全体像（概要）" when in overview', () => {
      const html = clean(
        renderToString(
          <PurposeMenu
            activeTab="overview"
            analysisSubTab="models"
            targetScope="store"
            onNavigate={vi.fn()}
          />
        )
      );
      expect(html).toContain('現在地');
      expect(html).toContain('店舗を分析する');
      expect(html).toContain('店舗の全体像（概要）');
    });

    it('displays "店舗を分析する › 曜日・のつく日・特日・末尾の傾向" when in analysis conditions', () => {
      const html = clean(
        renderToString(
          <PurposeMenu
            activeTab="analysis"
            analysisSubTab="conditions"
            targetScope="store"
            onNavigate={vi.fn()}
          />
        )
      );
      expect(html).toContain('店舗を分析する');
      expect(html).toContain('曜日・のつく日・特日・末尾の傾向');
    });

    it('displays "店舗を分析する › 機種別の傾向と設定推定" when in analysis models', () => {
      const html = clean(
        renderToString(
          <PurposeMenu
            activeTab="analysis"
            analysisSubTab="models"
            targetScope="store"
            onNavigate={vi.fn()}
          />
        )
      );
      expect(html).toContain('店舗を分析する');
      expect(html).toContain('機種別の傾向と設定推定');
    });

    it('displays "店舗を分析する › 高出率台の特徴" when in analysis high_payout', () => {
      const html = clean(
        renderToString(
          <PurposeMenu
            activeTab="analysis"
            analysisSubTab="high_payout"
            targetScope="store"
            onNavigate={vi.fn()}
          />
        )
      );
      expect(html).toContain('店舗を分析する');
      expect(html).toContain('高出率台の特徴');
    });

    it('displays "店舗を分析する › 他の店との比較" when in compare', () => {
      const html = clean(
        renderToString(
          <PurposeMenu
            activeTab="compare"
            analysisSubTab="models"
            targetScope="store"
            onNavigate={vi.fn()}
          />
        )
      );
      expect(html).toContain('店舗を分析する');
      expect(html).toContain('他の店との比較');
    });

    it('displays "指定日の狙い台を決める › この店だけで見る" when in target scope=store', () => {
      const html = clean(
        renderToString(
          <PurposeMenu
            activeTab="target"
            analysisSubTab="models"
            targetScope="store"
            onNavigate={vi.fn()}
          />
        )
      );
      expect(html).toContain('指定日の狙い台を決める');
      expect(html).toContain('この店だけで見る');
    });

    it('displays "指定日の狙い台を決める › いつ行くか（来店日スキャン）" when in target scope=all with calendar section', () => {
      const html = clean(
        renderToString(
          <PurposeMenu
            activeTab="target"
            analysisSubTab="models"
            targetScope="all"
            activeSection="calendar"
            onNavigate={vi.fn()}
          />
        )
      );
      expect(html).toContain('指定日の狙い台を決める');
      expect(html).toContain('いつ行くか（来店日スキャン）');
    });

    it('displays "指定日の狙い台を決める › どの店に行くか（店舗ランキング）" when in target scope=all with stores section', () => {
      const html = clean(
        renderToString(
          <PurposeMenu
            activeTab="target"
            analysisSubTab="models"
            targetScope="all"
            activeSection="stores"
            onNavigate={vi.fn()}
          />
        )
      );
      expect(html).toContain('指定日の狙い台を決める');
      expect(html).toContain('どの店に行くか（店舗ランキング）');
    });

    it('displays "予測の信頼性を確認する › 機種予測の検証・台番予測の検証" when in validation', () => {
      const html = clean(
        renderToString(
          <PurposeMenu
            activeTab="validation"
            analysisSubTab="models"
            targetScope="store"
            onNavigate={vi.fn()}
          />
        )
      );
      expect(html).toContain('予測の信頼性を確認する');
      expect(html).toContain('機種予測の検証・台番予測の検証');
    });

    it('displays "予測の信頼性を確認する › 機種予測の検証" when in validation with models section', () => {
      const html = clean(
        renderToString(
          <PurposeMenu
            activeTab="validation"
            analysisSubTab="models"
            targetScope="store"
            activeSection="models"
            onNavigate={vi.fn()}
          />
        )
      );
      expect(html).toContain('予測の信頼性を確認する');
      expect(html).toContain('機種予測の検証');
    });

    it('displays "予測の信頼性を確認する › 台番予測の検証" when in validation with machines section', () => {
      const html = clean(
        renderToString(
          <PurposeMenu
            activeTab="validation"
            analysisSubTab="models"
            targetScope="store"
            activeSection="machines"
            onNavigate={vi.fn()}
          />
        )
      );
      expect(html).toContain('予測の信頼性を確認する');
      expect(html).toContain('台番予測の検証');
    });
  });

  describe('2. 入口ボタンとアクセシビリティ（ARIA属性）', () => {
    it('renders the 3 main purpose entrances and the settings entrance', () => {
      const html = clean(
        renderToString(
          <PurposeMenu
            activeTab="overview"
            analysisSubTab="models"
            targetScope="store"
            onNavigate={vi.fn()}
          />
        )
      );
      expect(html).toContain('purpose-btn-analyze');
      expect(html).toContain('店舗を分析する');
      expect(html).toContain('purpose-btn-target');
      expect(html).toContain('指定日の狙い台を決める');
      expect(html).toContain('purpose-btn-validation');
      expect(html).toContain('予測の信頼性を確認する');
      expect(html).toContain('purpose-btn-settings');
      expect(html).toContain('データ・設定');
    });

    it('has correct ARIA attributes for dropdown menu triggers', () => {
      const html = clean(
        renderToString(
          <PurposeMenu
            activeTab="overview"
            analysisSubTab="models"
            targetScope="store"
            onNavigate={vi.fn()}
          />
        )
      );
      expect(html).toContain('aria-haspopup="menu"');
      expect(html).toContain('aria-expanded="false"');
      expect(html).toContain('aria-controls="purpose-menu-analyze"');
      expect(html).toContain('aria-controls="purpose-menu-target"');
      expect(html).toContain('aria-controls="purpose-menu-validation"');
      expect(html).toContain('aria-controls="purpose-menu-settings"');
    });

    it('highlights the active entrance button according to activeTab', () => {
      const htmlOverview = clean(
        renderToString(
          <PurposeMenu
            activeTab="overview"
            analysisSubTab="models"
            targetScope="store"
            onNavigate={vi.fn()}
          />
        )
      );
      expect(htmlOverview).toContain('bg-amber-500 text-slate-950');

      const htmlTarget = clean(
        renderToString(
          <PurposeMenu
            activeTab="target"
            analysisSubTab="models"
            targetScope="store"
            onNavigate={vi.fn()}
          />
        )
      );
      expect(htmlTarget).toContain('purpose-btn-target');
    });
  });

  describe('3. 旧URL互換性 (parseHash check for Prompt 46 entries)', () => {
    it('correctly resolves slash paths like #analysis/conditions, #analysis/models, #analysis/high_payout', () => {
      const cond = parseHash('#analysis/conditions');
      expect(cond.tab).toBe('analysis');
      expect(cond.subTab).toBe('conditions');

      const models = parseHash('#analysis/models');
      expect(models.tab).toBe('analysis');
      expect(models.subTab).toBe('models');

      const payout = parseHash('#analysis/high_payout');
      expect(payout.tab).toBe('analysis');
      expect(payout.subTab).toBe('high_payout');
    });

    it('correctly resolves #target with section query params', () => {
      const calendar = parseHash('#target?scope=all&section=calendar');
      expect(calendar.tab).toBe('target');
      expect(calendar.scope).toBe('all');
      expect(calendar.section).toBe('calendar');

      const stores = parseHash('#target?scope=all&section=stores');
      expect(stores.tab).toBe('target');
      expect(stores.scope).toBe('all');
      expect(stores.section).toBe('stores');

      const machineRank = parseHash('#target?section=machines');
      expect(machineRank.tab).toBe('target');
      expect(machineRank.section).toBe('machines');
    });

    it('preserves all legacy URLs (#forecast, #cross, #models, #trends, #tables)', () => {
      expect(parseHash('#forecast').tab).toBe('target');
      expect(parseHash('#cross').tab).toBe('target');
      expect(parseHash('#models').tab).toBe('analysis');
      expect(parseHash('#trends').tab).toBe('analysis');
      expect(parseHash('#tables').tab).toBe('overview');
    });
  });

  describe('4. スマートフォン幅（375px）のレスポンシブ設計', () => {
    it('renders responsive mobile labels and bottom sheet structure markup for 375px screens', () => {
      const html = clean(
        renderToString(
          <PurposeMenu
            activeTab="target"
            analysisSubTab="models"
            targetScope="store"
            onNavigate={vi.fn()}
          />
        )
      );

      // Mobile short labels ("分析", "狙い台", "信頼性検証") are present for compact width
      expect(html).toContain('分析');
      expect(html).toContain('狙い台');
      expect(html).toContain('信頼性検証');
      expect(html).toContain('データ・設定');

      // The layout uses responsive classes (inline sm:hidden)
      expect(html).toContain('inline sm:hidden');
      expect(html).toContain('hidden sm:inline');
    });
  });
});
