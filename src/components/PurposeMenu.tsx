import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  BarChart3,
  Target,
  ShieldCheck,
  Database,
  ChevronDown,
  ChevronRight,
  X,
  Check,
  Building2,
  Calendar,
  Layers,
  Cpu,
  TrendingUp,
  Sparkles,
  Flame,
  FileSpreadsheet,
  UploadCloud,
  HardDriveDownload,
  SlidersHorizontal,
  LucideIcon,
  CheckCircle2,
  HelpCircle,
} from 'lucide-react';
import { ActiveTab, AnalysisSubTab, TargetScope } from '../App';

export interface PurposeMenuItem {
  id: string;
  title: string;
  desc: string;
  icon?: LucideIcon;
  badge?: string;
  hash?: string;
  isActive: boolean;
  onSelect: () => void;
}

export interface PurposeMenuGroup {
  id: 'analyze' | 'target' | 'validation' | 'settings';
  label: string;
  icon: LucideIcon;
  shortLabel?: string;
  isIconOnly?: boolean;
  items: PurposeMenuItem[];
  isActive: boolean;
}

export interface PurposeMenuProps {
  activeTab: ActiveTab;
  analysisSubTab: AnalysisSubTab;
  targetScope: TargetScope;
  activeSection?: string;
  isHome?: boolean;
  skipHome?: boolean;
  onNavigate: (
    tab: ActiveTab,
    options?: {
      subTab?: AnalysisSubTab;
      scope?: TargetScope;
      section?: string;
      isHome?: boolean;
    }
  ) => void;
  onOpenStoreManager?: (initialTab?: 'import' | 'list' | 'backup') => void;
  onOpenModelSpecs?: () => void;
}

export const PurposeMenu: React.FC<PurposeMenuProps> = ({
  activeTab,
  analysisSubTab,
  targetScope,
  activeSection,
  isHome = false,
  skipHome = false,
  onNavigate,
  onOpenStoreManager,
  onOpenModelSpecs,
}) => {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);

  // Refs for managing keyboard focus
  const triggerRefs = useRef<{ [key: string]: HTMLButtonElement | null }>({});
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpenMenuId(null);
      }
    };
    if (openMenuId) {
      document.addEventListener('mousedown', handleOutsideClick);
      return () => document.removeEventListener('mousedown', handleOutsideClick);
    }
  }, [openMenuId]);

  // Handle ESC globally when menu is open
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && openMenuId) {
        const currentTrigger = triggerRefs.current[openMenuId];
        setOpenMenuId(null);
        currentTrigger?.focus();
      }
    };
    if (openMenuId) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [openMenuId]);

  // Determine current active breadcrumb text
  const currentBreadcrumb = React.useMemo(() => {
    if (isHome) {
      if (activeTab === 'target') {
        return {
          parent: '指定日の狙い台を決める',
          item: '何を知りたいか選ぶ（ホーム）',
        };
      }
      return {
        parent: '店舗を分析する',
        item: '何を知りたいか選ぶ（ホーム）',
      };
    }
    if (activeTab === 'overview') {
      return {
        parent: '店舗を分析する',
        item: '店舗の全体像（概要）',
      };
    }
    if (activeTab === 'analysis') {
      if (analysisSubTab === 'conditions') {
        return {
          parent: '店舗を分析する',
          item: '曜日・のつく日・特日・末尾の傾向',
        };
      }
      if (analysisSubTab === 'high_payout') {
        return {
          parent: '店舗を分析する',
          item: '高出率台の特徴',
        };
      }
      return {
        parent: '店舗を分析する',
        item: '機種別の傾向と設定推定',
      };
    }
    if (activeTab === 'compare') {
      return {
        parent: '店舗を分析する',
        item: '他の店との比較',
      };
    }
    if (activeTab === 'target') {
      if (targetScope === 'store') {
        return {
          parent: '指定日の狙い台を決める',
          item: 'この店だけで見る',
        };
      }
      if (activeSection === 'calendar') {
        return {
          parent: '指定日の狙い台を決める',
          item: 'いつ行くか（来店日スキャン）',
        };
      }
      if (activeSection === 'stores') {
        return {
          parent: '指定日の狙い台を決める',
          item: 'どの店に行くか（店舗ランキング）',
        };
      }
      if (activeSection === 'models') {
        return {
          parent: '指定日の狙い台を決める',
          item: 'どの機種を狙うか',
        };
      }
      if (activeSection === 'machines') {
        return {
          parent: '指定日の狙い台を決める',
          item: 'どの台を狙うか',
        };
      }
      if (activeSection === 'checklist' || activeSection === 'target-checklist') {
        return {
          parent: '指定日の狙い台を決める',
          item: '当日のチェックリスト',
        };
      }
      return {
        parent: '指定日の狙い台を決める',
        item: '店舗横断で狙う（全店）',
      };
    }
    if (activeTab === 'validation') {
      if (activeSection === 'models') {
        return {
          parent: '予測の信頼性を確認する',
          item: '機種予測の検証',
        };
      }
      if (activeSection === 'machines') {
        return {
          parent: '予測の信頼性を確認する',
          item: '台番予測の検証',
        };
      }
      return {
        parent: '予測の信頼性を確認する',
        item: '機種予測の検証・台番予測の検証',
      };
    }
    return {
      parent: '店舗を分析する',
      item: '店舗の全体像（概要）',
    };
  }, [activeTab, analysisSubTab, targetScope, activeSection]);

  // Construct the 3 purpose menus + 1 "データ・設定" menu
  const menuGroups: PurposeMenuGroup[] = [
    // 1. 店舗を分析する
    {
      id: 'analyze',
      label: '店舗を分析する',
      shortLabel: '分析',
      icon: BarChart3,
      isActive:
        activeTab === 'overview' ||
        activeTab === 'analysis' ||
        activeTab === 'compare',
      items: [
        {
          id: 'overview',
          title: '店舗の全体像（概要）',
          desc: 'KPI・月別推移・総合ヒートマップでホールの全体傾向を把握',
          icon: BarChart3,
          hash: '#overview',
          isActive: activeTab === 'overview',
          onSelect: () => {
            onNavigate('overview');
            setOpenMenuId(null);
          },
        },
        {
          id: 'conditions',
          title: '曜日・のつく日・特日・末尾の傾向',
          desc: '曜日・のつく日・特日・末尾ごとの出玉の強さ',
          icon: Calendar,
          hash: '#analysis/conditions',
          isActive: activeTab === 'analysis' && analysisSubTab === 'conditions',
          onSelect: () => {
            onNavigate('analysis', { subTab: 'conditions' });
            setOpenMenuId(null);
          },
        },
        {
          id: 'models',
          title: '機種別の傾向と設定推定',
          desc: '機種ごとの出玉傾向と機械割・設定推定分布',
          icon: Cpu,
          hash: '#analysis/models',
          isActive: activeTab === 'analysis' && analysisSubTab === 'models',
          onSelect: () => {
            onNavigate('analysis', { subTab: 'models' });
            setOpenMenuId(null);
          },
        },
        {
          id: 'high_payout',
          title: '高出率台の特徴',
          desc: '高出率台が投入されやすい曜日や日付パターンの特徴',
          icon: Flame,
          hash: '#analysis/high_payout',
          isActive: activeTab === 'analysis' && analysisSubTab === 'high_payout',
          onSelect: () => {
            onNavigate('analysis', { subTab: 'high_payout' });
            setOpenMenuId(null);
          },
        },
        {
          id: 'compare',
          title: '他の店との比較',
          desc: '登録されている複数ホールの出玉実績を横断比較',
          icon: Building2,
          hash: '#compare',
          isActive: activeTab === 'compare',
          onSelect: () => {
            onNavigate('compare');
            setOpenMenuId(null);
          },
        },
      ],
    },

    // 2. 指定日の狙い台を決める
    {
      id: 'target',
      label: '指定日の狙い台を決める',
      shortLabel: '狙い台',
      icon: Target,
      isActive: activeTab === 'target',
      items: [
        {
          id: 'when',
          title: 'いつ行くか',
          desc: '全店舗をスキャンして期待値の高い来店候補日を発見（全店）',
          icon: Calendar,
          hash: '#target?scope=all&section=calendar',
          isActive:
            activeTab === 'target' &&
            targetScope === 'all' &&
            activeSection === 'calendar',
          onSelect: () => {
            onNavigate('target', {
              scope: 'all',
              section: 'target-calendar-scan',
            });
            setOpenMenuId(null);
          },
        },
        {
          id: 'which_store',
          title: 'どの店に行くか',
          desc: '指定日に還元期待値の高い店舗をランキング（全店）',
          icon: Building2,
          hash: '#target?scope=all&section=stores',
          isActive:
            activeTab === 'target' &&
            targetScope === 'all' &&
            activeSection === 'stores',
          onSelect: () => {
            onNavigate('target', {
              scope: 'all',
              section: 'target-store-ranking',
            });
            setOpenMenuId(null);
          },
        },
        {
          id: 'which_model',
          title: 'どの機種を狙うか',
          desc: '過去実績・特日相性・周期性に基づくおすすめ機種ランキング',
          icon: Cpu,
          hash: '#target?section=models',
          isActive: activeTab === 'target' && activeSection === 'models',
          onSelect: () => {
            onNavigate('target', {
              section: 'target-model-ranking',
            });
            setOpenMenuId(null);
          },
        },
        {
          id: 'which_machine',
          title: 'どの台を狙うか',
          desc: '据え置き・上げ狙い・末尾を考慮したおすすめ台番ランキング',
          icon: Layers,
          hash: '#target?section=machines',
          isActive: activeTab === 'target' && activeSection === 'machines',
          onSelect: () => {
            onNavigate('target', {
              section: 'target-machine-ranking',
            });
            setOpenMenuId(null);
          },
        },
        {
          id: 'checklist',
          title: '当日のチェックリスト',
          desc: '来店中の狙い台確保状況チェック・繰り上がり管理',
          icon: CheckCircle2,
          hash: '#target?section=checklist',
          isActive:
            activeTab === 'target' &&
            (activeSection === 'checklist' || activeSection === 'target-checklist'),
          onSelect: () => {
            onNavigate('target', {
              section: 'target-checklist',
            });
            setOpenMenuId(null);
          },
        },
        {
          id: 'store_only',
          title: 'この店だけで見る',
          desc: '現在選択中の店舗に絞って狙い台・機種を分析（単一店）',
          icon: Target,
          hash: '#target?scope=store',
          isActive: activeTab === 'target' && targetScope === 'store',
          onSelect: () => {
            onNavigate('target', { scope: 'store' });
            setOpenMenuId(null);
          },
        },
      ],
    },

    // 3. 予測の信頼性を確認する
    {
      id: 'validation',
      label: '予測の信頼性を確認する',
      shortLabel: '信頼性検証',
      icon: ShieldCheck,
      isActive: activeTab === 'validation',
      items: [
        {
          id: 'val_all',
          title: '機種予測の検証・台番予測の検証',
          desc: '過去データを用いたバックテスト実績と予測精度の総合検証',
          icon: ShieldCheck,
          hash: '#validation',
          isActive: activeTab === 'validation' && !activeSection,
          onSelect: () => {
            onNavigate('validation');
            setOpenMenuId(null);
          },
        },
        {
          id: 'val_model',
          title: '機種予測の検証',
          desc: '未来データ漏洩を排除したウォークフォワード的中率・回収率',
          icon: Cpu,
          hash: '#validation?section=models',
          isActive: activeTab === 'validation' && activeSection === 'models',
          onSelect: () => {
            onNavigate('validation', { section: 'validation-models' });
            setOpenMenuId(null);
          },
        },
        {
          id: 'val_machine',
          title: '台番予測の検証',
          desc: '台番単位の狙い台予測における統計的優位性・リフト検証',
          icon: Layers,
          hash: '#validation?section=machines',
          isActive: activeTab === 'validation' && activeSection === 'machines',
          onSelect: () => {
            onNavigate('validation', { section: 'validation-machines' });
            setOpenMenuId(null);
          },
        },
      ],
    },

    // 4. ヘッダーのアイコン「データ・設定」
    {
      id: 'settings',
      label: 'データ・設定',
      shortLabel: '設定',
      icon: Database,
      isIconOnly: false,
      isActive: false,
      items: [
        {
          id: 'store_switch',
          title: '店舗の切替',
          desc: '登録済み店舗の選択と切り替え一覧を表示',
          icon: Building2,
          isActive: false,
          onSelect: () => {
            setOpenMenuId(null);
            onOpenStoreManager?.('list');
          },
        },
        {
          id: 'data_import',
          title: 'データの取り込み',
          desc: 'スロレポHTMLまたは台データCSVの新規インポート',
          icon: UploadCloud,
          isActive: false,
          onSelect: () => {
            setOpenMenuId(null);
            onOpenStoreManager?.('import');
          },
        },
        {
          id: 'data_backup',
          title: 'バックアップ・復元',
          desc: '全店舗データのJSONバックアップ書き出しとインポート復元',
          icon: HardDriveDownload,
          isActive: false,
          onSelect: () => {
            setOpenMenuId(null);
            onOpenStoreManager?.('backup');
          },
        },
        {
          id: 'model_specs',
          title: '機種の仕様テーブル',
          desc: 'Aタイプ等の機械割スペックの登録・編集・JSONインポート',
          icon: SlidersHorizontal,
          hash: '#analysis/models#specs',
          isActive: false,
          onSelect: () => {
            setOpenMenuId(null);
            if (onOpenModelSpecs) {
              onOpenModelSpecs();
            } else {
              onNavigate('analysis', { subTab: 'models', section: 'setting-specs-section' });
            }
          },
        },
      ],
    },
  ];

  // Focus item inside menu with keyboard navigation
  const handleKeyDownMenu = useCallback(
    (e: React.KeyboardEvent, items: PurposeMenuItem[]) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedIndex((prev) => (prev + 1) % items.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedIndex((prev) => (prev - 1 + items.length) % items.length);
      } else if (e.key === 'Home') {
        e.preventDefault();
        setFocusedIndex(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        setFocusedIndex(items.length - 1);
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < items.length) {
          items[focusedIndex].onSelect();
        }
      } else if (e.key === 'Escape' || e.key === 'Tab') {
        if (e.key === 'Escape') {
          e.preventDefault();
        }
        const currentTrigger = openMenuId ? triggerRefs.current[openMenuId] : null;
        setOpenMenuId(null);
        currentTrigger?.focus();
      }
    },
    [focusedIndex, openMenuId]
  );

  // Sync focus to current element
  useEffect(() => {
    if (focusedIndex >= 0 && itemRefs.current[focusedIndex]) {
      itemRefs.current[focusedIndex]?.focus();
    }
  }, [focusedIndex]);

  const activeGroup = menuGroups.find((g) => g.id === openMenuId);

  return (
    <div ref={containerRef} className="w-full space-y-2">
      {/* Top Purpose Menus Row */}
      <div className="flex flex-wrap items-center justify-between gap-1.5 sm:gap-2">
        {/* The 3 Main Purpose Navigation Dropdowns */}
        <div className="flex flex-1 items-center gap-1 sm:gap-2 min-w-0 flex-wrap">
          {menuGroups.slice(0, 3).map((group) => {
            const Icon = group.icon;
            const isOpen = openMenuId === group.id;
            return (
              <div key={group.id} className="relative">
                <button
                  ref={(el) => {
                    triggerRefs.current[group.id] = el;
                  }}
                  id={`purpose-btn-${group.id}`}
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={isOpen}
                  aria-controls={`purpose-menu-${group.id}`}
                  onClick={() => {
                    if (isOpen) {
                      setOpenMenuId(null);
                    } else {
                      setOpenMenuId(group.id);
                      setFocusedIndex(-1);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setOpenMenuId(group.id);
                      setFocusedIndex(0);
                    }
                  }}
                  className={`flex items-center gap-1.5 py-1.5 px-2.5 sm:px-3 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap select-none border ${
                    group.isActive
                      ? 'bg-amber-500 text-slate-950 border-amber-500 shadow-2xs font-black'
                      : isOpen
                      ? 'bg-slate-800 text-white border-slate-700 shadow-2xs'
                      : 'bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 border-slate-200'
                  }`}
                  title={`${group.label}のメニューを開く`}
                >
                  <Icon
                    className={`w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 ${
                      group.isActive ? 'text-slate-950' : 'text-amber-500'
                    }`}
                  />
                  <span className="hidden sm:inline">{group.label}</span>
                  <span className="inline sm:hidden">{group.shortLabel || group.label}</span>
                  <ChevronDown
                    className={`w-3 h-3 transition-transform duration-200 ${
                      isOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {/* Desktop Dropdown Popover */}
                {isOpen && (
                  <div
                    id={`purpose-menu-${group.id}`}
                    role="menu"
                    aria-labelledby={`purpose-btn-${group.id}`}
                    onKeyDown={(e) => handleKeyDownMenu(e, group.items)}
                    className="hidden sm:block absolute left-0 mt-1.5 w-80 max-w-[90vw] bg-white rounded-xl shadow-xl border border-slate-200/90 py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100"
                  >
                    <div className="px-3 py-1.5 border-b border-slate-100 mb-1 flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-500">
                        {group.label}
                      </span>
                      <span className="text-[10px] text-slate-400">Escで閉じる</span>
                    </div>
                    <div className="space-y-0.5 px-1">
                      {group.items.map((item, idx) => {
                        const ItemIcon = item.icon || group.icon;
                        return (
                          <button
                            key={item.id}
                            ref={(el) => {
                              itemRefs.current[idx] = el;
                            }}
                            role="menuitem"
                            tabIndex={focusedIndex === idx ? 0 : -1}
                            onClick={item.onSelect}
                            className={`w-full text-left px-2.5 py-2 rounded-lg transition-colors flex items-start gap-2.5 cursor-pointer ${
                              item.isActive
                                ? 'bg-amber-50 border border-amber-300 text-amber-950 font-bold'
                                : 'hover:bg-slate-50 text-slate-700 hover:text-slate-900 border border-transparent'
                            }`}
                          >
                            <span
                              className={`p-1 rounded-md shrink-0 mt-0.5 ${
                                item.isActive
                                  ? 'bg-amber-400 text-slate-950'
                                  : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              <ItemIcon className="w-3.5 h-3.5" />
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-1">
                                <span className="text-xs font-bold truncate">
                                  {item.title}
                                </span>
                                {item.isActive && (
                                  <span className="text-2xs bg-amber-500 text-slate-950 px-1.5 py-0.2 rounded font-black shrink-0">
                                    現在地
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-slate-500 line-clamp-2 mt-0.5 font-normal leading-tight">
                                {item.desc}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* 4. ヘッダーのアイコン「データ・設定」 */}
        {(() => {
          const settingsGroup = menuGroups[3];
          const SettingsIcon = settingsGroup.icon;
          const isSettingsOpen = openMenuId === 'settings';
          return (
            <div className="relative shrink-0">
              <button
                ref={(el) => {
                  triggerRefs.current['settings'] = el;
                }}
                id="purpose-btn-settings"
                type="button"
                aria-haspopup="menu"
                aria-expanded={isSettingsOpen}
                aria-controls="purpose-menu-settings"
                onClick={() => {
                  if (isSettingsOpen) {
                    setOpenMenuId(null);
                  } else {
                    setOpenMenuId('settings');
                    setFocusedIndex(-1);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setOpenMenuId('settings');
                    setFocusedIndex(0);
                  }
                }}
                className={`flex items-center gap-1.5 py-1.5 px-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap select-none border ${
                  isSettingsOpen
                    ? 'bg-slate-900 text-white border-slate-800 shadow-2xs'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-700 hover:text-slate-900 border-slate-200'
                }`}
                title="データ・設定（店舗切替・データ取込・バックアップ・機種仕様）"
              >
                <SettingsIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-500 shrink-0" />
                <span className="text-xs font-bold">データ・設定</span>
                <ChevronDown
                  className={`w-3 h-3 text-slate-400 transition-transform duration-200 ${
                    isSettingsOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {/* Desktop Settings Dropdown Popover */}
              {isSettingsOpen && (
                <div
                  id="purpose-menu-settings"
                  role="menu"
                  aria-labelledby="purpose-btn-settings"
                  onKeyDown={(e) => handleKeyDownMenu(e, settingsGroup.items)}
                  className="hidden sm:block absolute right-0 mt-1.5 w-80 max-w-[90vw] bg-white rounded-xl shadow-xl border border-slate-200/90 py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100"
                >
                  <div className="px-3 py-1.5 border-b border-slate-100 mb-1 flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-500">
                      データ・設定
                    </span>
                    <span className="text-[10px] text-slate-400">Escで閉じる</span>
                  </div>
                  <div className="space-y-0.5 px-1">
                    {settingsGroup.items.map((item, idx) => {
                      const ItemIcon = item.icon || Database;
                      return (
                        <button
                          key={item.id}
                          ref={(el) => {
                            itemRefs.current[idx] = el;
                          }}
                          role="menuitem"
                          tabIndex={focusedIndex === idx ? 0 : -1}
                          onClick={item.onSelect}
                          className="w-full text-left px-2.5 py-2 rounded-lg transition-colors flex items-start gap-2.5 cursor-pointer hover:bg-slate-50 text-slate-700 hover:text-slate-900 border border-transparent"
                        >
                          <span className="p-1 rounded-md shrink-0 mt-0.5 bg-slate-100 text-slate-600">
                            <ItemIcon className="w-3.5 h-3.5" />
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-xs font-bold truncate">
                                {item.title}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 line-clamp-2 mt-0.5 font-normal leading-tight">
                              {item.desc}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* Mobile Bottom Sheet Modal (for <= 640px / 375px screens) */}
      {activeGroup && (
        <div
          className="sm:hidden fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex flex-col justify-end animate-in fade-in duration-150"
          onClick={() => setOpenMenuId(null)}
          role="dialog"
          aria-modal="true"
          aria-label={activeGroup.label}
        >
          <div
            className="bg-white rounded-t-2xl shadow-2xl border-t border-slate-200 max-h-[85vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-200"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => handleKeyDownMenu(e, activeGroup.items)}
          >
            {/* Sheet Handle & Header */}
            <div className="pt-2.5 pb-2 px-4 border-b border-slate-100 flex flex-col items-center relative">
              <div className="w-10 h-1 bg-slate-300 rounded-full mb-2" />
              <div className="w-full flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="p-1 rounded bg-amber-500/10 text-amber-500">
                    <activeGroup.icon className="w-4 h-4" />
                  </span>
                  <span className="text-sm font-black text-slate-900">
                    {activeGroup.label}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setOpenMenuId(null)}
                  className="p-1 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
                  aria-label="閉じる"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Sheet Items List */}
            <div
              role="menu"
              className="p-3 overflow-y-auto space-y-1.5 focus:outline-hidden"
            >
              {activeGroup.items.map((item, idx) => {
                const ItemIcon = item.icon || activeGroup.icon;
                return (
                  <button
                    key={item.id}
                    ref={(el) => {
                      itemRefs.current[idx] = el;
                    }}
                    role="menuitem"
                    tabIndex={0}
                    onClick={item.onSelect}
                    className={`w-full text-left p-3 rounded-xl transition-all flex items-start gap-3 cursor-pointer ${
                      item.isActive
                        ? 'bg-amber-50 border border-amber-300 text-amber-950 font-bold'
                        : 'bg-slate-50/80 hover:bg-slate-100 text-slate-700 border border-slate-200/70'
                    }`}
                  >
                    <span
                      className={`p-1.5 rounded-lg shrink-0 mt-0.5 ${
                        item.isActive
                          ? 'bg-amber-500 text-slate-950'
                          : 'bg-white border border-slate-200 text-slate-600'
                      }`}
                    >
                      <ItemIcon className="w-4 h-4" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-bold">{item.title}</span>
                        {item.isActive ? (
                          <span className="text-[10px] bg-amber-500 text-slate-950 px-1.5 py-0.2 rounded font-black shrink-0 flex items-center gap-0.5">
                            <Check className="w-2.5 h-2.5" />
                            <span>選択中</span>
                          </span>
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5 font-normal leading-relaxed">
                        {item.desc}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Requirement 3: Breadcrumb Indicator (現在地) */}
      <nav
        aria-label="現在地"
        className="flex items-center gap-1.5 text-xs text-slate-500 bg-slate-50/90 border border-slate-200/80 px-2.5 py-1 rounded-lg flex-wrap select-none"
      >
        <span className="text-[11px] text-slate-400 font-bold hidden sm:inline">現在地:</span>
        <span className="font-bold text-slate-700 bg-white border border-slate-200 px-1.5 py-0.5 rounded text-[11px]">
          {currentBreadcrumb.parent}
        </span>
        <span className="text-slate-400 font-bold select-none">›</span>
        <span className="font-black text-amber-900 bg-amber-100/90 border border-amber-300 px-2 py-0.5 rounded text-[11px] flex items-center gap-1 shadow-2xs">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
          <span>{currentBreadcrumb.item}</span>
        </span>
      </nav>
    </div>
  );
};
