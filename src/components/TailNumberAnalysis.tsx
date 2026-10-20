import React from 'react';
import { DailyRecord, SpecialDayRules } from '../data/types';
import { UnitMode } from './Header';
import { ConditionAnalysis } from './ConditionAnalysis';

export interface TailNumberAnalysisProps {
  dailyRecords: DailyRecord[];
  perspective: 'hall' | 'player';
  unit: UnitMode;
  setUnit?: (u: UnitMode) => void;
  oldEventDays?: string;
  specialDayRules?: SpecialDayRules;
  onSelectDate?: (date: string) => void;
}

export const TailNumberAnalysis: React.FC<TailNumberAnalysisProps> = ({
  dailyRecords,
  perspective,
  unit,
  setUnit,
  oldEventDays = '',
  specialDayRules,
  onSelectDate,
}) => {
  return (
    <ConditionAnalysis
      dailyRecords={dailyRecords}
      perspective={perspective}
      unit={unit}
      setUnit={setUnit}
      oldEventDays={oldEventDays}
      specialDayRules={specialDayRules}
      onSelectDate={onSelectDate}
      initialDimension="tail"
      initialMetric="avgDiff"
      initialViewMode="heatmap"
    />
  );
};
