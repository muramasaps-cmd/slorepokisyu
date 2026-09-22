import React, { useState } from 'react';
import {
  PRESET_SPECIAL_DAY_RULES,
  getSpecialDayRuleDefinition,
  parseSpecialDayRulesFromText,
} from '../utils/specialDayRules';
import { Target, X, Check, Sparkles, HelpCircle, RotateCcw } from 'lucide-react';

interface SpecialDayRuleModalProps {
  isOpen: boolean;
  storeName: string;
  currentRuleText: string;
  onClose: () => void;
  onSave: (newRuleText: string) => void;
}

export const SpecialDayRuleModal: React.FC<SpecialDayRuleModalProps> = ({
  isOpen,
  storeName,
  currentRuleText,
  onClose,
  onSave,
}) => {
  const [inputText, setInputText] = useState(currentRuleText);

  if (!isOpen) return null;

  // Calculate preview of active days from inputText
  const previewRules = parseSpecialDayRulesFromText(inputText);
  const previewDef = getSpecialDayRuleDefinition(previewRules, inputText);

  const handleSelectPreset = (val: string) => {
    setInputText(val);
  };

  const handleApply = () => {
    if (!inputText.trim()) return;
    onSave(inputText.trim());
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl flex flex-col overflow-hidden max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-amber-500/20 text-amber-400 rounded-lg border border-amber-500/30">
              <Target className="w-5 h-5" />
            </span>
            <div>
              <h3 className="font-extrabold text-base sm:text-lg">
                特日（旧イベント日）ルールの設定
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                対象店舗: <strong className="text-white">{storeName}</strong>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1">
          {/* Current Rule Input & Preview */}
          <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200/80 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-amber-600" />
                適用中の特日ルール（自由入力可能）
              </label>
              <span className="text-[11px] text-amber-800 font-semibold">
                分析対象: {previewDef.targetDaysLabel || '未判定'}
              </span>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="例: 5のつく日, 7のつく日, 月日ゾロ目・11日・22日"
                className="flex-1 px-3 py-2 text-sm bg-white border border-amber-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-amber-500 font-bold text-slate-900"
              />
              <button
                type="button"
                onClick={() => setInputText(currentRuleText)}
                className="px-2.5 py-2 text-xs font-semibold text-slate-600 bg-white border border-amber-300 hover:bg-amber-100/50 rounded-lg transition-colors flex items-center gap-1"
                title="初期値に戻す"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                元に戻す
              </button>
            </div>

            <div className="text-[11px] text-amber-900/80 flex items-center gap-1.5 pt-1">
              <span>判定結果:</span>
              <span className="bg-white px-2 py-0.5 rounded border border-amber-300 font-bold text-amber-900">
                {previewDef.modeName} ({previewDef.targetDaysLabel})
              </span>
              <span className="text-slate-500">
                → この日付が月内サイクル・回収罠分析の対象になります
              </span>
            </div>
          </div>

          {/* Quick Preset Buttons */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-700">
                主要チェーン・定番特日プリセット（1クリックで選択）:
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {PRESET_SPECIAL_DAY_RULES.map((preset) => {
                const isSelected = inputText === preset.value;
                return (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => handleSelectPreset(preset.value)}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                      isSelected
                        ? 'border-2 border-amber-500 bg-amber-50/60 shadow-xs'
                        : 'border-slate-200 bg-slate-50/50 hover:bg-slate-100/80 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900">{preset.label}</span>
                      {isSelected && (
                        <Check className="w-4 h-4 text-amber-600 shrink-0 font-bold" />
                      )}
                    </div>
                    <span className="text-[10px] text-slate-500 mt-1 line-clamp-1">
                      {preset.description}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Explanation note */}
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-slate-600 text-[11px] flex items-start gap-2">
            <HelpCircle className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              特日ルールを変更すると、全期間の営業日データ（通常日 vs 旧イベント日）、月別特日サイクル分析（出す・回収パターン）、特日前後の回収罠分析（前日・当日・翌日）がリアルタイムに即座に再集計されます。
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-200/60 transition-colors cursor-pointer"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="px-5 py-2 text-xs font-bold text-slate-950 bg-amber-500 hover:bg-amber-600 rounded-lg transition-colors cursor-pointer shadow-xs flex items-center gap-1.5"
          >
            <Check className="w-4 h-4" />
            特日ルールを適用・保存
          </button>
        </div>
      </div>
    </div>
  );
};
