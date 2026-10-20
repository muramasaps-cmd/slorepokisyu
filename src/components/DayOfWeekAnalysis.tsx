import React from 'react';
import { DailyRecord, SpecialDayRules } from '../data/types';
import { UnitMode } from './Header';
import { ConditionAnalysis } from './ConditionAnalysis';

export interface DayOfWeekAnalysisProps {
  dailyRecords: DailyRecord[];
  perspective: 'hall' | 'player';
  unit: UnitMode;
  setUnit?: (u: UnitMode) => void;
  oldEventDays?: string;
  specialDayRules?: SpecialDayRules;
}

export const DayOfWeekAnalysis: React.FC<DayOfWeekAnalysisProps> = ({
  dailyRecords,
  perspective,
  unit,
  setUnit,
  oldEventDays = '',
  specialDayRules,
}) => {
  return (
    <ConditionAnalysis
      dailyRecords={dailyRecords}
      perspective={perspective}
      unit={unit}
      setUnit={setUnit}
      oldEventDays={oldEventDays}
      specialDayRules={specialDayRules}
      initialDimension="dow"
      initialMetric="avgDiff"
      initialViewMode="heatmap"
    />
  );
};
