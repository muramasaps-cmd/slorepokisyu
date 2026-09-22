import React from 'react';
import { Calculator, Sliders } from 'lucide-react';

interface ModelComparisonBannerProps {
  perspective?: 'hall' | 'player';
  totalDiffProfit?: number;
  totalGModelProfit?: number;
  totalGapProfit?: number;
  totalRevenue?: number;
  avgPayoutRate?: number;
  cashRatio: number;
  setCashRatio: (r: number) => void;
  profitModel?: any;
  setProfitModel?: any;
}

export const ModelComparisonBanner: React.FC<ModelComparisonBannerProps> = ({
  cashRatio,
  setCashRatio,
}) => {
  return (
    <div className="bg-white rounded-xl border border-indigo-200/80 shadow-xs overflow-hidden">
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="bg-indigo-500 text-white text-[11px] font-bold px-2 py-0.5 rounded flex items-center gap-1">
              <Calculator className="w-3 h-3" />
              G数(IN枚数)連動粗利モデル
            </span>
            <span className="text-indigo-200 text-xs font-medium">
              稼働ゲーム数・換金ギャップ・現金投資比率連動
            </span>
          </div>
          <h2 className="text-lg sm:text-xl font-bold mt-1 text-white flex items-center gap-2">
            G数（IN枚数）を用いたホール利益の算出構造
          </h2>
          <p className="text-xs text-indigo-200/90 mt-1 max-w-3xl">
            「<strong>G数稼働に伴う現金投資と換金ギャップ（46枚貸21.74円 / 52枚交換19.23円＝1枚あたり2.51円の粗利）</strong>」を算入し、高稼働・出玉還元時の実務ホール経営収支を正確に可視化します。
          </p>
        </div>

        {/* Cash ratio control */}
        <div className="bg-white/10 backdrop-blur-xs p-3 rounded-lg border border-white/15 flex flex-col gap-1.5 self-start md:self-auto min-w-[220px]">
          <div className="flex items-center justify-between text-xs text-indigo-100">
            <span className="flex items-center gap-1">
              <Sliders className="w-3.5 h-3.5 text-amber-400" />
              現金投資比率:
            </span>
            <span className="font-extrabold text-amber-300 text-sm">{cashRatio}%</span>
          </div>
          <input
            type="range"
            min="20"
            max="50"
            step="1"
            value={cashRatio}
            onChange={(e) => setCashRatio(Number(e.target.value))}
            className="w-full accent-amber-400 h-1.5 bg-slate-700 rounded-lg cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-indigo-200/80">
            <span>20% (高持ち玉)</span>
            <span className="text-amber-300">業界標準 35%</span>
            <span>50% (低持ち玉)</span>
          </div>
        </div>
      </div>
    </div>
  );
};
