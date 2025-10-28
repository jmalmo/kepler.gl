// SPDX-License-Identifier: MIT
// Copyright contributors to the kepler.gl project

import React, {useCallback, useMemo, useState, useEffect, useRef} from 'react';
import styled from 'styled-components';
import moment from 'moment-timezone';
import {DEFAULT_TIME_FORMAT, FILTER_VIEW_TYPES} from '@kepler.gl/constants';
import {datetimeFormatter, durationSecond, durationMinute, durationHour, durationDay} from '@kepler.gl/utils';
import {
  BottomWidgetInner,
  Button,
  ButtonGroup,
  PanelLabel,
  Input,
  StyledDatePicker,
  StyledTimePicker
} from '../common/styled-components';
import Switch from '../common/switch';
import Portaled from '../common/portaled';
import TimeRangeSliderFactory from '../common/time-range-slider';
import FloatingTimeDisplayFactory from '../common/animation-control/floating-time-display';
import {timeRangeSliderFieldsSelector} from './time-range-filter';
import {TimeWidgetProps} from './types';
import TimeWidgetTopFactory from './time-widget-top';
import {TimeRangeFilter} from '@kepler.gl/types';
import useOnClickOutside from '../hooks/use-on-click-outside';
import {Calendar, Clock} from '../common/icons';

const TimeBottomWidgetInner = styled(BottomWidgetInner)`
  padding: 6px 32px 24px 32px;
`;

const ControlsContainer = styled.div`
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: center;
`;

const ControlRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: center;
  gap: 12px;
  width: 100%;
`;

const LabeledField = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 152px;
  gap: 8px;
`;

const FieldLabel = styled(PanelLabel)`
  margin-bottom: 0;
  text-align: center;
`;

const TimestampInput = styled(Input)<{hasError?: boolean}>`
  ${props => (props.hasError ? `border-color: ${props.theme.errorColor};` : '')}
  text-align: center;
  width: 152px;
  min-width: 140px;
  padding-left: 8px;
  padding-right: 4px;
  margin: 0 auto;
`;

const ToggleGroup = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
`;

const TimelineSection = styled.div`
  margin-top: 22px;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 12px;
`;

const TimelineStatusBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  font-size: 11px;
  color: ${props => props.theme.subtextColor};
`;

const TimelineStatusRange = styled.span`
  color: ${props => props.theme.textColorHl || props.theme.textColor};
  font-weight: 500;
  white-space: nowrap;
`;

const PickerTrigger = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  gap: 0;
`;

const PickerIconButton = styled(Button)`
  min-width: 34px;
  padding: 6px;
  line-height: 0;
  svg {
    pointer-events: none;
  }
`;

const PickerPopover = styled.div`
  position: relative;
  background: ${props => props.theme.panelBackground || props.theme.sidePanelBg};
  box-shadow: ${props => props.theme.dropdownShadow || '0 12px 24px rgba(0, 0, 0, 0.2)'};
  border-radius: 8px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  z-index: 20;
  min-width: 260px;
`;

const PickerRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const PickerLabel = styled(PanelLabel)`
  margin-bottom: 0;
  text-transform: none;
`;

const PickerActions = styled.div`
  display: flex;
  justify-content: center;
  gap: 8px;
`;

const PickerIcon = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${props => props.theme.subtextColor};
`;

const DurationInput = styled(Input)<{hasError?: boolean}>`
  ${props => (props.hasError ? `border-color: ${props.theme.errorColor};` : '')}
  text-align: center;
  width: 132px;
  min-width: 120px;
  padding-left: 8px;
  padding-right: 4px;
  margin: 0 auto;
`;

const SnapField = styled(LabeledField)`
  min-width: 120px;
`;


const StyledButtonGroup = styled(ButtonGroup)`
  display: flex;
  justify-content: center;
`;

type AnchorOption = 'start' | 'center' | 'end';

type DurationUnitId = 'ms' | 's' | 'min' | 'h' | 'd';

const DURATION_UNITS: {id: DurationUnitId; label: string; ms: number}[] = [
  {id: 'ms', label: 'ms', ms: 1},
  {id: 's', label: 's', ms: durationSecond},
  {id: 'min', label: 'min', ms: durationMinute},
  {id: 'h', label: 'h', ms: durationHour},
  {id: 'd', label: 'd', ms: durationDay}
];

const PICKER_POPOVER_HEIGHT = 320;
const PICKER_VERTICAL_GAP = 8;
const TIMELINE_COMPARE_EPS = 1;
const MIN_WINDOW_WIDTH = 1;
const HOLD_START_DELAY_MS = 220;
const HOLD_REPEAT_INTERVAL_MS = 80;
const TIME_FORMAT_WITH_TIME_REGEX = /(H|h|k|LT|LTS|LLL|lll|LLLL|llll)/;

type HoldHandlers = {
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onMouseDown: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onMouseUp: () => void;
  onMouseLeave: () => void;
  onBlur: () => void;
  onTouchStart: (event: React.TouchEvent<HTMLButtonElement>) => void;
  onTouchEnd: () => void;
  onTouchCancel: () => void;
};

type HoldTimerState = {
  timeoutId: number | null;
  intervalId: number | null;
  activated: boolean;
};

function ensureFormatIncludesTime(formatString?: string | null): string {
  if (!formatString) {
    return DEFAULT_TIME_FORMAT;
  }
  if (TIME_FORMAT_WITH_TIME_REGEX.test(formatString)) {
    return formatString;
  }
  return `${formatString} HH:mm:ss`.trim();
}

function useHoldRepeater(callback: () => void): HoldHandlers {
  const timers = useRef<HoldTimerState>({
    timeoutId: null,
    intervalId: null,
    activated: false
  });

  const clearTimers = useCallback(() => {
    if (timers.current.timeoutId !== null) {
      window.clearTimeout(timers.current.timeoutId);
      timers.current.timeoutId = null;
    }
    if (timers.current.intervalId !== null) {
      window.clearInterval(timers.current.intervalId);
      timers.current.intervalId = null;
    }
  }, []);

  const startHold = useCallback(() => {
    clearTimers();
    timers.current.timeoutId = window.setTimeout(() => {
      timers.current.activated = true;
      callback();
      timers.current.intervalId = window.setInterval(callback, HOLD_REPEAT_INTERVAL_MS);
    }, HOLD_START_DELAY_MS);
  }, [callback, clearTimers]);

  const stopHold = useCallback(
    (resetActivation: boolean) => {
      clearTimers();
      if (resetActivation) {
        timers.current.activated = false;
      }
    },
    [clearTimers]
  );

  useEffect(() => {
    return () => {
      clearTimers();
      timers.current.activated = false;
    };
  }, [clearTimers]);

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      if (timers.current.activated) {
        timers.current.activated = false;
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      callback();
    },
    [callback]
  );

  const handleMouseDown = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      if (typeof event.button === 'number' && event.button !== 0) {
        return;
      }
      startHold();
    },
    [startHold]
  );

  const handleMouseUp = useCallback(() => {
    stopHold(false);
  }, [stopHold]);

  const handleMouseLeave = useCallback(() => {
    stopHold(true);
  }, [stopHold]);

  const handleBlur = useCallback(() => {
    stopHold(true);
  }, [stopHold]);

  const handleTouchStart = useCallback(
    (event: React.TouchEvent<HTMLButtonElement>) => {
      event.preventDefault();
      startHold();
    },
    [startHold]
  );

  const handleTouchEnd = useCallback(() => {
    stopHold(false);
  }, [stopHold]);

  const handleTouchCancel = useCallback(() => {
    stopHold(true);
  }, [stopHold]);

  return useMemo(
    () => ({
      onClick: handleClick,
      onMouseDown: handleMouseDown,
      onMouseUp: handleMouseUp,
      onMouseLeave: handleMouseLeave,
      onBlur: handleBlur,
      onTouchStart: handleTouchStart,
      onTouchEnd: handleTouchEnd,
      onTouchCancel: handleTouchCancel
    }),
    [
      handleBlur,
      handleClick,
      handleMouseDown,
      handleMouseLeave,
      handleMouseUp,
      handleTouchCancel,
      handleTouchEnd,
      handleTouchStart
    ]
  );
}

const rangesEqual = (a: [number, number], b: [number, number]) =>
  Math.abs(a[0] - b[0]) <= TIMELINE_COMPARE_EPS && Math.abs(a[1] - b[1]) <= TIMELINE_COMPARE_EPS;

const clampRangeToDomain = (range: [number, number], domain: [number, number]) => {
  const [min, max] = domain;
  return [Math.max(range[0], min), Math.min(range[1], max)] as [number, number];
};


TimeWidgetFactory.deps = [TimeRangeSliderFactory, FloatingTimeDisplayFactory, TimeWidgetTopFactory];

function TimeWidgetFactory(
  TimeRangeSlider: ReturnType<typeof TimeRangeSliderFactory>,
  FloatingTimeDisplay: ReturnType<typeof FloatingTimeDisplayFactory>,
  TimeWidgetTop: ReturnType<typeof TimeWidgetTopFactory>
) {
  const TimeWidget: React.FC<TimeWidgetProps> = ({
    datasets,
    filter,
    layers,
    index,
    readOnly,
    showTimeDisplay,
    setFilterAnimationTime,
    onClose,
    onToggleMinify,
    resetAnimation,
    isAnimatable,
    updateAnimationSpeed,
    toggleAnimation,
    setFilterPlot,
    setFilterAnimationWindow,
    animationConfig,
    timeline,
    setTimeFilterWindow,
    setTimeFilterWindowWidth,
    setTimeFilterSnapToBin,
    setTimeFilterStep,
    zoomTimeFilter
  }: TimeWidgetProps) => {
    const _updateAnimationSpeed = useCallback(
      speed => updateAnimationSpeed(index, speed),
      [updateAnimationSpeed, index]
    );

    const _toggleAnimation = useCallback(() => toggleAnimation(index), [toggleAnimation, index]);

    const isMinified = useMemo(() => filter.view === FILTER_VIEW_TYPES.minified, [filter]);

    const _setFilterAnimationWindow = useCallback(
      animationWindow => setFilterAnimationWindow({id: filter.id, animationWindow}),
      [setFilterAnimationWindow, filter.id]
    );

    const timeSliderOnChange = useCallback(
      value => setFilterAnimationTime(index, 'value', value),
      [setFilterAnimationTime, index]
    );

    const _setFilterPlot = useCallback(
      (newProp, valueIndex) => setFilterPlot(index, newProp, valueIndex),
      [index, setFilterPlot]
    );

    const timeRangeSlideProps = useMemo(
      () => timeRangeSliderFieldsSelector(filter, datasets, layers),
      [filter, datasets, layers]
    );

    const [filterStart, filterEnd] = filter.value;
    const [timelineDomain, setTimelineDomain] = useState<[number, number] | null>(null);
    const fullDomain = timeRangeSlideProps.domain;
    const sliderDomain = timelineDomain ?? fullDomain;

    const timelineZoomed = useMemo(() => {
      if (!timelineDomain || !Array.isArray(fullDomain)) {
        return false;
      }
      return !rangesEqual(timelineDomain, fullDomain as [number, number]);
    }, [timelineDomain, fullDomain]);

    const handleResetTimelineZoom = useCallback(() => {
      setTimelineDomain(null);
    }, [setTimelineDomain]);

    const startInputId = `${filter.id}-time-start`;
    const endInputId = `${filter.id}-time-end`;
    const widthInputId = `${filter.id}-time-width`;
    const snapToggleId = `snap-to-bin-${filter.id}`;

    const zoom = filter.zoom;
    const anchor: AnchorOption =
      zoom?.anchor === 'start' || zoom?.anchor === 'center' ? zoom.anchor : 'end';
    const snapToBin = Boolean(zoom?.snapToBin);

    const effectiveStep = useMemo(() => {
      if (typeof zoom?.stepMs === 'number' && zoom.stepMs > 0) {
        return zoom.stepMs;
      }
      if (typeof filter.step === 'number' && filter.step > 0) {
        return filter.step;
      }
      const width = filter.value[1] - filter.value[0];
      return width > 0 ? width / 100 : 1;
    }, [zoom?.stepMs, filter.step, filter.value]);

    const binWidth = useMemo(() => getActiveBinWidth(filter), [filter]);

    const computeStepMagnitude = useCallback(
      (mods: {shiftKey: boolean; altKey: boolean}) => {
        let base = effectiveStep;
        if (!Number.isFinite(base) || base <= 0) {
          const width = filter.value[1] - filter.value[0];
          base = width > 0 ? width / 100 : 1;
        }
        let multiplier = 1;
        if (mods.shiftKey) {
          multiplier *= 10;
        }
        if (mods.altKey) {
          multiplier *= 0.1;
        }
        const raw = base * multiplier;
        const adjusted = mods.altKey ? Math.floor(raw) : Math.round(raw);
        return Math.max(adjusted || Math.round(base), 1);
      },
      [effectiveStep, filter.value]
    );

    const computeTranslationStep = useCallback(
      (mods: {shiftKey: boolean; altKey: boolean}) => {
        const activeDomain = timelineDomain ?? (Array.isArray(fullDomain) ? (fullDomain as [number, number]) : null);
        const domainWidth = activeDomain ? activeDomain[1] - activeDomain[0] : filterEnd - filterStart;
        const windowWidth = filterEnd - filterStart;
        let base =
          windowWidth > MIN_WINDOW_WIDTH
            ? windowWidth * 0.1
            : domainWidth > 0
            ? domainWidth * 0.02
            : effectiveStep;
        if (!Number.isFinite(base) || base <= 0) {
          base = Math.max(domainWidth / 100, effectiveStep || 1);
        }
        if (mods.shiftKey) {
          base *= 5;
        }
        if (mods.altKey) {
          base *= 0.2;
        }
        return Math.max(Math.round(base) || Math.ceil(base) || 1, 1);
      },
      [effectiveStep, filterEnd, filterStart, fullDomain, timelineDomain]
    );

    const timeFormatter = useMemo(() => {
      const hasUserFormat = typeof filter.timeFormat === 'string';
      const baseFormat = hasUserFormat ? filter.timeFormat : filter.defaultTimeFormat;
      const formatString = ensureFormatIncludesTime(baseFormat);
      const formatter = datetimeFormatter(filter.timezone);
      return (value: number) => formatter(formatString)(value);
    }, [filter.defaultTimeFormat, filter.timeFormat, filter.timezone]);

    const timelineRangeLabel = useMemo(() => {
      if (!timelineDomain) {
        return '';
      }
      return `${timeFormatter(timelineDomain[0])} – ${timeFormatter(timelineDomain[1])}`;
    }, [timelineDomain, timeFormatter]);

    const tooltipFormatter = useCallback(
      (value: number) => {
        const momentInstance = filter.timezone
          ? moment.tz(value, filter.timezone)
          : moment(value);
        return momentInstance.toISOString();
      },
      [filter.timezone]
    );

    const [startValue, setStartValue] = useState(() => timeFormatter(filterStart));
    const [endValue, setEndValue] = useState(() => timeFormatter(filterEnd));
    const [widthValue, setWidthValue] = useState(() => formatDuration(filterEnd - filterStart));

    const resetWidthInputs = useCallback(() => {
      setWidthValue(formatDuration(filterEnd - filterStart));
    }, [filterEnd, filterStart]);

    const [startError, setStartError] = useState(false);
    const [endError, setEndError] = useState(false);
    const [widthError, setWidthError] = useState(false);

    const [isStartEditing, setIsStartEditing] = useState(false);
    const [isEndEditing, setIsEndEditing] = useState(false);
    const [isWidthEditing, setIsWidthEditing] = useState(false);

    const [startPickerOpen, setStartPickerOpen] = useState(false);
    const [endPickerOpen, setEndPickerOpen] = useState(false);
    const [startPickerDraft, setStartPickerDraft] = useState(filterStart);
    const [endPickerDraft, setEndPickerDraft] = useState(filterEnd);
    const [startPickerOffset, setStartPickerOffset] = useState<number>(42);
    const [endPickerOffset, setEndPickerOffset] = useState<number>(42);
    const [startPickerHeight, setStartPickerHeight] = useState<number>(PICKER_POPOVER_HEIGHT);
    const [endPickerHeight, setEndPickerHeight] = useState<number>(PICKER_POPOVER_HEIGHT);
    const startTriggerRef = useRef<HTMLDivElement | null>(null);
    const endTriggerRef = useRef<HTMLDivElement | null>(null);
    const startPickerIgnoreRefs = useMemo(() => [startTriggerRef], [startTriggerRef]);
    const endPickerIgnoreRefs = useMemo(() => [endTriggerRef], [endTriggerRef]);
    const unsnappedWindowRef = useRef<[number, number] | null>(null);

    const timezone = filter.timezone;
    const baseTimeFormat = filter.timeFormat || filter.defaultTimeFormat || DEFAULT_TIME_FORMAT;
    const usesAmPm = /a/i.test(baseTimeFormat);
    const timePickerFormat = usesAmPm ? 'hh:mm a' : 'HH:mm';
    const timePickerDisplayFormat = timePickerFormat;

    useEffect(() => {
      if (!isStartEditing) {
        setStartValue(timeFormatter(filterStart));
      }
      if (!isEndEditing) {
        setEndValue(timeFormatter(filterEnd));
      }
      if (!isWidthEditing) {
        resetWidthInputs();
        setWidthError(false);
      }
    }, [
      filterStart,
      filterEnd,
      timeFormatter,
      isStartEditing,
      isEndEditing,
      isWidthEditing,
      resetWidthInputs
    ]);

    useEffect(() => {
      if (!startPickerOpen) {
        setStartPickerDraft(filterStart);
      }
    }, [filterStart, startPickerOpen]);

    useEffect(() => {
      if (!endPickerOpen) {
        setEndPickerDraft(filterEnd);
      }
    }, [filterEnd, endPickerOpen]);

    useEffect(() => {
      if (!snapToBin) {
        unsnappedWindowRef.current = null;
      }
    }, [snapToBin, filterStart, filterEnd]);

    useEffect(() => {
      if (!timelineDomain) {
        return;
      }

      const lowerBound = timelineDomain[0] - TIMELINE_COMPARE_EPS;
      const upperBound = timelineDomain[1] + TIMELINE_COMPARE_EPS;

      if (filterStart >= lowerBound && filterEnd <= upperBound) {
        return;
      }

      let nextRange: [number, number] = [
        Math.min(timelineDomain[0], filterStart),
        Math.max(timelineDomain[1], filterEnd)
      ];

      if (Array.isArray(fullDomain)) {
        const domainRange = fullDomain as [number, number];
        const clamped = clampRangeToDomain(nextRange, domainRange);
        nextRange = clamped;

        if (nextRange[1] - nextRange[0] < TIMELINE_COMPARE_EPS) {
          const domainWidth = domainRange[1] - domainRange[0];
          if (domainWidth > TIMELINE_COMPARE_EPS) {
            const currentWidth = Math.max(
              timelineDomain[1] - timelineDomain[0],
              filterEnd - filterStart,
              TIMELINE_COMPARE_EPS
            );
            const targetWidth = Math.min(currentWidth, domainWidth);
            const center = Math.min(
              Math.max((filterStart + filterEnd) / 2, domainRange[0]),
              domainRange[1]
            );
            const half = targetWidth / 2;
            let start = center - half;
            let end = center + half;
            if (start < domainRange[0]) {
              start = domainRange[0];
              end = domainRange[0] + targetWidth;
            }
            if (end > domainRange[1]) {
              end = domainRange[1];
              start = domainRange[1] - targetWidth;
            }
            nextRange = [start, end];
          } else {
            nextRange = domainRange;
          }
        }
      }

      setTimelineDomain(prev => (prev && rangesEqual(prev, nextRange) ? prev : nextRange));
    }, [filterEnd, filterStart, fullDomain, timelineDomain]);

    useEffect(() => {
      if (!timelineDomain || !Array.isArray(fullDomain)) {
        return;
      }
      const domainRange = fullDomain as [number, number];
      const domainWidth = domainRange[1] - domainRange[0];
      if (!(domainWidth > TIMELINE_COMPARE_EPS)) {
        return;
      }

      let nextRange = clampRangeToDomain(timelineDomain, domainRange);
      if (nextRange[1] - nextRange[0] < TIMELINE_COMPARE_EPS) {
        const currentWidth = Math.max(
          timelineDomain[1] - timelineDomain[0],
          TIMELINE_COMPARE_EPS
        );
        const targetWidth = Math.min(currentWidth, domainWidth);
        nextRange = [domainRange[0], domainRange[0] + targetWidth];
        if (nextRange[1] > domainRange[1]) {
          nextRange = [domainRange[1] - targetWidth, domainRange[1]];
        }
      }

      setTimelineDomain(prev => (prev && rangesEqual(prev, nextRange) ? prev : nextRange));
    }, [fullDomain, timelineDomain]);

    const toMoment = useCallback(
      (timestamp: number) => (timezone ? moment.tz(timestamp, timezone) : moment(timestamp)),
      [timezone]
    );

    const applyDatePart = useCallback(
      (timestamp: number, dateValue: Date) => {
        const base = toMoment(timestamp);
        const dateMoment = timezone ? moment.tz(dateValue, timezone) : moment(dateValue);
        base.year(dateMoment.year());
        base.month(dateMoment.month());
        base.date(dateMoment.date());
        return base.valueOf();
      },
      [timezone, toMoment]
    );

    const applyTimePart = useCallback(
      (timestamp: number, timeValue: string) => {
        if (!timeValue) {
          return timestamp;
        }
        const parsed = moment(timeValue, timePickerFormat, true);
        const base = toMoment(timestamp);
        if (parsed.isValid()) {
          base.hour(parsed.hour());
          base.minute(parsed.minute());
          base.second(0);
          base.millisecond(0);
        }
        return base.valueOf();
      },
      [timePickerFormat, toMoment]
    );

    const getDateFromPickerValue = useCallback(
      (value: Date | Date[] | [Date | null, Date | null] | null): Date | null => {
        if (!value) {
          return null;
        }
        if (Array.isArray(value)) {
          const first = value[0];
          return first instanceof Date ? first : null;
        }
        return value;
      },
      []
    );

    const startPickerTimeValue = useMemo(
      () => toMoment(startPickerDraft).format(timePickerDisplayFormat),
      [startPickerDraft, timePickerDisplayFormat, toMoment]
    );

    const endPickerTimeValue = useMemo(
      () => toMoment(endPickerDraft).format(timePickerDisplayFormat),
      [endPickerDraft, timePickerDisplayFormat, toMoment]
    );

    const openStartPicker = useCallback(() => {
      setStartPickerDraft(filterStart);
      setStartPickerOpen(true);
      setEndPickerOpen(false);
    }, [filterStart]);

    const openEndPicker = useCallback(() => {
      setEndPickerDraft(filterEnd);
      setEndPickerOpen(true);
      setStartPickerOpen(false);
    }, [filterEnd]);

    const handleStartPickerCancel = useCallback(() => {
      setStartPickerOpen(false);
      setStartPickerDraft(filterStart);
      setStartValue(timeFormatter(filterStart));
      setStartError(false);
      setIsStartEditing(false);
    }, [filterStart, timeFormatter]);

    const handleEndPickerCancel = useCallback(() => {
      setEndPickerOpen(false);
      setEndPickerDraft(filterEnd);
      setEndValue(timeFormatter(filterEnd));
      setEndError(false);
      setIsEndEditing(false);
    }, [filterEnd, timeFormatter]);

    const handleStartPickerMouseDown = useCallback(
      (event: React.MouseEvent<HTMLButtonElement>) => {
        if (!startPickerOpen) {
          event.preventDefault();
          openStartPicker();
        }
      },
      [openStartPicker, startPickerOpen]
    );

    const handleEndPickerMouseDown = useCallback(
      (event: React.MouseEvent<HTMLButtonElement>) => {
        if (!endPickerOpen) {
          event.preventDefault();
          openEndPicker();
        }
      },
      [endPickerOpen, openEndPicker]
    );

    const handleStartDateChange = useCallback(
      (value: Date | Date[] | [Date | null, Date | null] | null) => {
        const nextDate = getDateFromPickerValue(value);
        if (!nextDate) {
          return;
        }
        setStartPickerDraft(prev => applyDatePart(prev, nextDate));
      },
      [applyDatePart, getDateFromPickerValue]
    );

    const handleEndDateChange = useCallback(
      (value: Date | Date[] | [Date | null, Date | null] | null) => {
        const nextDate = getDateFromPickerValue(value);
        if (!nextDate) {
          return;
        }
        setEndPickerDraft(prev => applyDatePart(prev, nextDate));
      },
      [applyDatePart, getDateFromPickerValue]
    );

    const handleStartTimeChange = useCallback(
      (value: string | null) => {
        if (!value) {
          return;
        }
        setStartPickerDraft(prev => applyTimePart(prev, value));
      },
      [applyTimePart]
    );

    const handleEndTimeChange = useCallback(
      (value: string | null) => {
        if (!value) {
          return;
        }
        setEndPickerDraft(prev => applyTimePart(prev, value));
      },
      [applyTimePart]
    );

    const updatePickerOffset = useCallback(
      (trigger: HTMLElement | null, popoverHeight: number, setter: (offset: number) => void) => {
        if (!trigger) {
          return;
        }
        const rect = trigger.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        const belowOffset = rect.height + PICKER_VERTICAL_GAP;
        const aboveOffset = -popoverHeight - PICKER_VERTICAL_GAP;
        const clearance = popoverHeight + PICKER_VERTICAL_GAP;
        const preferAbove = spaceBelow < clearance;
        const offset = preferAbove ? aboveOffset : belowOffset;
        setter(offset);
      },
      []
    );

    const measurePickerHeight = useCallback((popover: HTMLDivElement | null, fallback: number) => {
      if (!popover) {
        return fallback;
      }
      const rect = popover.getBoundingClientRect();
      return rect.height && Number.isFinite(rect.height) ? rect.height : fallback;
    }, []);

    const syncStartPickerPosition = useCallback(() => {
      const height = measurePickerHeight(startPickerRef.current, startPickerHeight);
      if (Math.abs(height - startPickerHeight) > 1) {
        setStartPickerHeight(height);
      }
      updatePickerOffset(startTriggerRef.current, height, setStartPickerOffset);
    }, [measurePickerHeight, startPickerHeight, updatePickerOffset]);

    const syncEndPickerPosition = useCallback(() => {
      const height = measurePickerHeight(endPickerRef.current, endPickerHeight);
      if (Math.abs(height - endPickerHeight) > 1) {
        setEndPickerHeight(height);
      }
      updatePickerOffset(endTriggerRef.current, height, setEndPickerOffset);
    }, [measurePickerHeight, endPickerHeight, updatePickerOffset]);

    useEffect(() => {
      if (!startPickerOpen) {
        return;
      }
      let raf = 0;
      let raf2 = 0;
      raf = window.requestAnimationFrame(() => {
        raf2 = window.requestAnimationFrame(syncStartPickerPosition);
      });
      return () => {
        window.cancelAnimationFrame(raf);
        window.cancelAnimationFrame(raf2);
      };
    }, [startPickerOpen, syncStartPickerPosition]);

    useEffect(() => {
      if (!endPickerOpen) {
        return;
      }
      let raf = 0;
      let raf2 = 0;
      raf = window.requestAnimationFrame(() => {
        raf2 = window.requestAnimationFrame(syncEndPickerPosition);
      });
      return () => {
        window.cancelAnimationFrame(raf);
        window.cancelAnimationFrame(raf2);
      };
    }, [endPickerOpen, syncEndPickerPosition]);

    useEffect(() => {
      if (!startPickerOpen) {
        return;
      }
      window.addEventListener('resize', syncStartPickerPosition);
      return () => window.removeEventListener('resize', syncStartPickerPosition);
    }, [startPickerOpen, syncStartPickerPosition]);

    useEffect(() => {
      if (!endPickerOpen) {
        return;
      }
      window.addEventListener('resize', syncEndPickerPosition);
      return () => window.removeEventListener('resize', syncEndPickerPosition);
    }, [endPickerOpen, syncEndPickerPosition]);

    const handleSetWindow = useCallback(
      (windowValue: [number, number], options?: {enforceBounds?: boolean; snap?: boolean}) =>
        setTimeFilterWindow({
          idx: index,
          window: windowValue,
          enforceBounds: options?.enforceBounds,
          snap: options?.snap ?? snapToBin
        }),
      [index, setTimeFilterWindow, snapToBin]
    );

    const handleSetWindowWidth = useCallback(
      (width: number, nextAnchor?: AnchorOption) =>
        setTimeFilterWindowWidth({
          idx: index,
          width,
          anchor: nextAnchor
        }),
      [index, setTimeFilterWindowWidth]
    );

    const handleSnapToBin = useCallback(
      (snap: boolean) => {
        if (snap) {
          unsnappedWindowRef.current = [filterStart, filterEnd];
        }
        setTimeFilterSnapToBin({idx: index, snap});
        if (snap) {
          setTimeFilterStep({idx: index, stepMs: binWidth ?? effectiveStep});
        } else {
          setTimeFilterStep({idx: index, stepMs: undefined});
          const previousWindow = unsnappedWindowRef.current;
          unsnappedWindowRef.current = null;
          if (previousWindow) {
            handleSetWindow(previousWindow, {enforceBounds: true, snap: false});
          }
        }
      },
      [
        binWidth,
        effectiveStep,
        filterEnd,
        filterStart,
        handleSetWindow,
        index,
        setTimeFilterSnapToBin,
        setTimeFilterStep
      ]
    );

    const handleZoom = useCallback(
      (factor: number, center: number) => {
        zoomTimeFilter({idx: index, factor, center});
      },
      [index, zoomTimeFilter]
    );

    const updateWindowWidthByFactor = useCallback(
      (multiplier: number) => {
        const currentWidth = Math.max(filterEnd - filterStart, 1);
        const nextWidth = currentWidth * multiplier;
        handleSetWindowWidth(nextWidth, 'center');
      },
      [filterEnd, filterStart, handleSetWindowWidth]
    );

    const handleTimelineZoom = useCallback(
      (factor: number, center: number) => {
        if (!Array.isArray(fullDomain)) {
          return;
        }
        const baseDomain = timelineDomain ?? fullDomain;
        const dataStart = fullDomain[0];
        const dataEnd = fullDomain[1];
        const baseStart = baseDomain[0];
        const baseEnd = baseDomain[1];
        const baseWidth = baseEnd - baseStart;
        if (!(baseWidth > 0)) {
          return;
        }
        const windowWidth = Math.max(filterEnd - filterStart, 0);
        const maxWidth = dataEnd - dataStart;
        let nextWidth = baseWidth / factor;
        nextWidth = Math.max(Math.min(nextWidth, maxWidth), TIMELINE_COMPARE_EPS);
        let nextStart = center - nextWidth / 2;
        let nextEnd = center + nextWidth / 2;
        if (nextStart < dataStart) {
          const diff = dataStart - nextStart;
          nextStart += diff;
          nextEnd += diff;
        }
        if (nextEnd > dataEnd) {
          const diff = nextEnd - dataEnd;
          nextStart -= diff;
          nextEnd -= diff;
        }
        nextStart = Math.max(nextStart, dataStart);
        nextEnd = Math.min(nextEnd, dataEnd);
        const nextRange: [number, number] = [nextStart, nextEnd];
        setTimelineDomain(prev => (prev && rangesEqual(prev, nextRange) ? prev : nextRange));

        const desiredWindowWidth = Math.max(
          Math.min(windowWidth, nextWidth),
          TIMELINE_COMPARE_EPS
        );
        let clampedCenter = Math.min(Math.max(center, nextStart), nextEnd);
        if (desiredWindowWidth >= nextWidth - TIMELINE_COMPARE_EPS) {
          clampedCenter = (nextStart + nextEnd) / 2;
        }
        let newStart = clampedCenter - desiredWindowWidth / 2;
        let newEnd = clampedCenter + desiredWindowWidth / 2;
        if (newStart < nextStart) {
          const diff = nextStart - newStart;
          newStart += diff;
          newEnd += diff;
        }
        if (newEnd > nextEnd) {
          const diff = newEnd - nextEnd;
          newStart -= diff;
          newEnd -= diff;
        }
        newStart = Math.max(newStart, nextStart);
        newEnd = Math.min(newEnd, nextEnd);
        if (
          Math.abs(newStart - filterStart) > TIMELINE_COMPARE_EPS ||
          Math.abs(newEnd - filterEnd) > TIMELINE_COMPARE_EPS
        ) {
          handleSetWindow([newStart, newEnd], {enforceBounds: true});
        }
      },
      [fullDomain, timelineDomain, filterEnd, filterStart, handleSetWindow]
    );

    const handleShiftZoom = useCallback(
      (range: [number, number]) => {
        const ordered: [number, number] = range[0] <= range[1] ? range : [range[1], range[0]];
        const domain = Array.isArray(fullDomain) ? (fullDomain as [number, number]) : null;
        const clamped = domain ? clampRangeToDomain(ordered, domain) : ordered;
        setTimelineDomain(prev => (prev && rangesEqual(prev, clamped) ? prev : clamped));
        handleSetWindow(clamped, {enforceBounds: true});
      },
      [fullDomain, handleSetWindow]
    );

    const handleTimelinePan = useCallback(
      (delta: number) => {
        if (!Array.isArray(fullDomain)) {
          return;
        }
        const dataStart = fullDomain[0];
        const dataEnd = fullDomain[1];
        const activeDomain = timelineDomain ?? (fullDomain as [number, number]);
        const domainWidth = activeDomain[1] - activeDomain[0];
        if (!(domainWidth > 0)) {
          return;
        }
        let nextStart = activeDomain[0] + delta;
        let nextEnd = activeDomain[1] + delta;
        if (nextStart < dataStart) {
          const diff = dataStart - nextStart;
          nextStart = dataStart;
          nextEnd += diff;
        }
        if (nextEnd > dataEnd) {
          const diff = nextEnd - dataEnd;
          nextEnd = dataEnd;
          nextStart -= diff;
        }
        nextStart = Math.max(nextStart, dataStart);
        nextEnd = Math.min(nextEnd, dataEnd);
        if (nextEnd - nextStart < TIMELINE_COMPARE_EPS) {
          return;
        }
        const nextRange: [number, number] = [nextStart, nextEnd];
        setTimelineDomain(prev => (prev && rangesEqual(prev, nextRange) ? prev : nextRange));

        let newStart = filterStart + delta;
        let newEnd = filterEnd + delta;
        if (newStart < nextStart) {
          const diff = nextStart - newStart;
          newStart += diff;
          newEnd += diff;
        }
        if (newEnd > nextEnd) {
          const diff = newEnd - nextEnd;
          newStart -= diff;
          newEnd -= diff;
        }
        if (newStart < dataStart) {
          const diff = dataStart - newStart;
          newStart += diff;
          newEnd += diff;
        }
        if (newEnd > dataEnd) {
          const diff = newEnd - dataEnd;
          newStart -= diff;
          newEnd -= diff;
        }
        handleSetWindow([newStart, newEnd], {enforceBounds: true});
      },
      [fullDomain, timelineDomain, filterStart, filterEnd, handleSetWindow]
    );

    const handleFit = useCallback(() => {
      if (Array.isArray(filter.domain)) {
        setTimelineDomain(null);
        handleSetWindow([filter.domain[0], filter.domain[1]], {enforceBounds: true});
      }
    }, [filter.domain, handleSetWindow, setTimelineDomain]);

    const handleZoomInClick = useCallback(() => {
      updateWindowWidthByFactor(1 / 1.4);
    }, [updateWindowWidthByFactor]);

    const handleZoomOutClick = useCallback(() => {
      updateWindowWidthByFactor(1.4);
    }, [updateWindowWidthByFactor]);

    const handleTimelineResetClick = useCallback(() => {
      handleResetTimelineZoom();
    }, [handleResetTimelineZoom]);

    const windowZoomInHandlers = useHoldRepeater(handleZoomInClick);
    const windowZoomOutHandlers = useHoldRepeater(handleZoomOutClick);

    const handleStartPickerApply = useCallback(() => {
      setStartPickerOpen(false);
      setStartError(false);
      setIsStartEditing(false);
      setStartValue(timeFormatter(startPickerDraft));
      handleSetWindow([startPickerDraft, filterEnd]);
    }, [filterEnd, handleSetWindow, startPickerDraft, timeFormatter]);

    const handleEndPickerApply = useCallback(() => {
      setEndPickerOpen(false);
      setEndError(false);
      setIsEndEditing(false);
      setEndValue(timeFormatter(endPickerDraft));
      handleSetWindow([filterStart, endPickerDraft]);
    }, [endPickerDraft, filterStart, handleSetWindow, timeFormatter]);

    const startPickerRef = useOnClickOutside<HTMLDivElement>(
      handleStartPickerCancel,
      !startPickerOpen,
      startPickerIgnoreRefs
    );
    const endPickerRef = useOnClickOutside<HTMLDivElement>(
      handleEndPickerCancel,
      !endPickerOpen,
      endPickerIgnoreRefs
    );

    const applyStartValue = useCallback(
      (rawValue?: string | number) => {
        const source = rawValue !== undefined ? String(rawValue) : startValue;
        const parsed = parseTimestampInput(source, filter.timezone);
        if (parsed === null) {
          setStartError(true);
          setStartValue(timeFormatter(filterStart));
          return;
        }
        setStartError(false);
        setStartValue(timeFormatter(parsed));
        handleSetWindow([parsed, filterEnd]);
      },
      [startValue, filter.timezone, filterEnd, filterStart, timeFormatter, handleSetWindow]
    );

    const applyEndValue = useCallback(
      (rawValue?: string | number) => {
        const source = rawValue !== undefined ? String(rawValue) : endValue;
        const parsed = parseTimestampInput(source, filter.timezone);
        if (parsed === null) {
          setEndError(true);
          setEndValue(timeFormatter(filterEnd));
          return;
        }
        setEndError(false);
        setEndValue(timeFormatter(parsed));
        handleSetWindow([filterStart, parsed]);
      },
      [endValue, filter.timezone, filterEnd, filterStart, timeFormatter, handleSetWindow]
    );

    const applyWidthValue = useCallback(
      (rawValue?: string | number) => {
        const source = rawValue !== undefined ? String(rawValue) : widthValue;
        const parsed = parseDurationInput(source);
        if (parsed === null || parsed <= 0) {
          setWidthError(true);
          resetWidthInputs();
          setIsWidthEditing(false);
          return;
        }
        setWidthError(false);
        setWidthValue(formatDuration(parsed));
        setIsWidthEditing(false);
        handleSetWindowWidth(parsed, anchor);
      },
      [anchor, handleSetWindowWidth, resetWidthInputs, widthValue]
    );

    const handleSnapChange = useCallback(
      (event: React.ChangeEvent<HTMLInputElement>) => {
        handleSnapToBin(event.target.checked);
      },
      [handleSnapToBin]
    );

    const handleStartInputKeyDown = useCallback(
      (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter') {
          applyStartValue();
          event.currentTarget.blur();
          return;
        }
        if (event.key === 'Escape') {
          setStartError(false);
          setStartValue(timeFormatter(filterStart));
          event.currentTarget.blur();
          return;
        }
        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
          event.preventDefault();
          event.stopPropagation();
          setStartError(false);
          const direction = event.key === 'ArrowUp' ? 1 : -1;
          const parsed = parseTimestampInput(event.currentTarget.value, filter.timezone);
          const baseValue = parsed === null ? filterStart : parsed;
          const magnitude = computeStepMagnitude(event);
          const nextStart = baseValue + direction * magnitude;
          setStartValue(timeFormatter(nextStart));
          handleSetWindow([nextStart, filterEnd]);
        }
      },
      [
        applyStartValue,
        computeStepMagnitude,
        filter.timezone,
        filterEnd,
        filterStart,
        handleSetWindow,
        timeFormatter
      ]
    );

    const handleEndInputKeyDown = useCallback(
      (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter') {
          applyEndValue();
          event.currentTarget.blur();
          return;
        }
        if (event.key === 'Escape') {
          setEndError(false);
          setEndValue(timeFormatter(filterEnd));
          event.currentTarget.blur();
          return;
        }
        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
          event.preventDefault();
          event.stopPropagation();
          setEndError(false);
          const direction = event.key === 'ArrowUp' ? 1 : -1;
          const parsed = parseTimestampInput(event.currentTarget.value, filter.timezone);
          const baseValue = parsed === null ? filterEnd : parsed;
          const magnitude = computeStepMagnitude(event);
          const nextEnd = baseValue + direction * magnitude;
          setEndValue(timeFormatter(nextEnd));
          handleSetWindow([filterStart, nextEnd]);
        }
      },
      [
        applyEndValue,
        computeStepMagnitude,
        filter.timezone,
        filterEnd,
        filterStart,
        handleSetWindow,
        timeFormatter
      ]
    );

    const handleWidthInputKeyDown = useCallback(
      (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter') {
          applyWidthValue(event.currentTarget.value);
          event.currentTarget.blur();
        } else if (event.key === 'Escape') {
          setWidthError(false);
          resetWidthInputs();
          setIsWidthEditing(false);
          event.currentTarget.blur();
        }
      },
      [applyWidthValue, resetWidthInputs]
    );

    const handleKeyDown = useCallback(
      (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.target !== event.currentTarget) {
          return;
        }
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          const direction = event.key === 'ArrowLeft' ? -1 : 1;
          const magnitude = computeTranslationStep(event);
          const delta = direction * magnitude;
          handleSetWindow([filterStart + delta, filterEnd + delta]);
          event.preventDefault();
        }
      },
      [computeTranslationStep, filterEnd, filterStart, handleSetWindow]
    );

    return (
      <TimeBottomWidgetInner
        className="bottom-widget--inner"
        tabIndex={-1}
        data-testid="time-widget-root"
        onKeyDown={handleKeyDown}
        role="group"
        aria-label="Timeline controls"
      >
        <TimeWidgetTop
          filter={filter}
          readOnly={readOnly}
          datasets={datasets}
          setFilterPlot={_setFilterPlot}
          index={index}
          onClose={onClose}
          onToggleMinify={onToggleMinify}
          isMinified={isMinified}
        />
        {!isMinified ? (
          <ControlsContainer>
            <ControlRow>
              <LabeledField>
                <FieldLabel htmlFor={startInputId} title="Beginning of the selected window">Start</FieldLabel>
                <PickerTrigger ref={startTriggerRef}>
                  <TimestampInput
                    id={startInputId}
                    value={startValue}
                    hasError={startError}
                    aria-invalid={startError}
                    data-testid="time-widget-start-input"
                    onChange={e => setStartValue(e.target.value)}
                    onFocus={() => {
                      setIsStartEditing(true);
                      openStartPicker();
                    }}
                    onClick={() => {
                      setIsStartEditing(true);
                      openStartPicker();
                    }}
                    onBlur={event => {
                      setIsStartEditing(false);
                      if (!startPickerOpen) {
                        applyStartValue(event.currentTarget.value);
                      }
                    }}
                    onKeyDown={handleStartInputKeyDown}
                    title={tooltipFormatter(filterStart)}
                  />
                  <PickerIconButton
                    small
                    type="button"
                    aria-label="Open start date picker"
                    onMouseDown={handleStartPickerMouseDown}
                    onClick={() => {
                      if (startPickerOpen) {
                        handleStartPickerCancel();
                      } else {
                        openStartPicker();
                      }
                    }}
                  >
                    <Calendar height="14px" />
                  </PickerIconButton>
                  <Portaled
                    isOpened={startPickerOpen}
                    top={startPickerOffset}
                    left={0}
                    onClose={handleStartPickerCancel}
                  >
                    <PickerPopover ref={startPickerRef}>
                      <PickerRow>
                        <PickerIcon>
                          <Calendar height="16px" />
                        </PickerIcon>
                        <PickerLabel>Date</PickerLabel>
                        <StyledDatePicker
                          value={new Date(startPickerDraft)}
                          onChange={handleStartDateChange}
                          calendarIcon={null}
                          clearIcon={null}
                          format="y-MM-dd"
                        />
                      </PickerRow>
                      <PickerRow>
                        <PickerIcon>
                          <Clock height="16px" />
                        </PickerIcon>
                        <PickerLabel>Time</PickerLabel>
                        <StyledTimePicker
                          value={startPickerTimeValue}
                          onChange={handleStartTimeChange}
                          disableClock
                          clockIcon={null}
                          clearIcon={null}
                          format={timePickerDisplayFormat}
                        />
                      </PickerRow>
                      <PickerActions>
                        <Button small secondary type="button" onClick={handleStartPickerCancel}>
                          Cancel
                        </Button>
                        <Button small type="button" onClick={handleStartPickerApply}>
                          Apply
                        </Button>
                      </PickerActions>
                    </PickerPopover>
                  </Portaled>
                </PickerTrigger>
              </LabeledField>
              <LabeledField>
                <FieldLabel htmlFor={endInputId} title="End of the selected window">End</FieldLabel>
                <PickerTrigger ref={endTriggerRef}>
                  <TimestampInput
                    id={endInputId}
                    value={endValue}
                    hasError={endError}
                    aria-invalid={endError}
                    data-testid="time-widget-end-input"
                    onChange={e => setEndValue(e.target.value)}
                    onFocus={() => {
                      setIsEndEditing(true);
                      openEndPicker();
                    }}
                    onClick={() => {
                      setIsEndEditing(true);
                      openEndPicker();
                    }}
                    onBlur={event => {
                      setIsEndEditing(false);
                      if (!endPickerOpen) {
                        applyEndValue(event.currentTarget.value);
                      }
                    }}
                    onKeyDown={handleEndInputKeyDown}
                    title={tooltipFormatter(filterEnd)}
                  />
                  <PickerIconButton
                    small
                    type="button"
                    aria-label="Open end date picker"
                    onMouseDown={handleEndPickerMouseDown}
                    onClick={() => {
                      if (endPickerOpen) {
                        handleEndPickerCancel();
                      } else {
                        openEndPicker();
                      }
                    }}
                  >
                    <Calendar height="14px" />
                  </PickerIconButton>
                  <Portaled
                    isOpened={endPickerOpen}
                    top={endPickerOffset}
                    left={0}
                    onClose={handleEndPickerCancel}
                  >
                    <PickerPopover ref={endPickerRef}>
                      <PickerRow>
                        <PickerIcon>
                          <Calendar height="16px" />
                        </PickerIcon>
                        <PickerLabel>Date</PickerLabel>
                        <StyledDatePicker
                          value={new Date(endPickerDraft)}
                          onChange={handleEndDateChange}
                          calendarIcon={null}
                          clearIcon={null}
                          format="y-MM-dd"
                        />
                      </PickerRow>
                      <PickerRow>
                        <PickerIcon>
                          <Clock height="16px" />
                        </PickerIcon>
                        <PickerLabel>Time</PickerLabel>
                        <StyledTimePicker
                          value={endPickerTimeValue}
                          onChange={handleEndTimeChange}
                          disableClock
                          clockIcon={null}
                          clearIcon={null}
                          format={timePickerDisplayFormat}
                        />
                      </PickerRow>
                      <PickerActions>
                        <Button small secondary type="button" onClick={handleEndPickerCancel}>
                          Cancel
                        </Button>
                        <Button small type="button" onClick={handleEndPickerApply}>
                          Apply
                        </Button>
                      </PickerActions>
                    </PickerPopover>
                  </Portaled>
                </PickerTrigger>
              </LabeledField>
              <LabeledField>
                <FieldLabel
                  htmlFor={widthInputId}
                  title="Change the window duration. Window Selection controls adjust how the span is applied."
                >
                  Window Width
                </FieldLabel>
                <DurationInput
                  id={widthInputId}
                  hasError={widthError}
                  aria-invalid={widthError}
                  data-testid="time-widget-width-input"
                  value={widthValue}
                  onChange={event => {
                    setWidthValue(event.target.value);
                    setIsWidthEditing(true);
                  }}
                  onFocus={() => setIsWidthEditing(true)}
                  onBlur={event => {
                    setIsWidthEditing(false);
                    applyWidthValue(event.currentTarget.value);
                  }}
                  onKeyDown={handleWidthInputKeyDown}
                  title="Change the window duration"
                />
              </LabeledField>
              <LabeledField>
                <FieldLabel title="Fine-tune the window selection width">Window Selection</FieldLabel>
                <StyledButtonGroup>
                  <Button
                    small
                    type="button"
                    data-testid="time-widget-zoom-in"
                    aria-label="Narrow window selection"
                    title="Narrow the window selection"
                    {...windowZoomInHandlers}
                  >
                    +
                  </Button>
                  <Button
                    small
                    type="button"
                    data-testid="time-widget-zoom-out"
                    aria-label="Widen window selection"
                    title="Widen the window selection"
                    {...windowZoomOutHandlers}
                  >
                    -
                  </Button>
                  <Button
                    small
                    type="button"
                    onClick={handleFit}
                    data-testid="time-widget-fit"
                    aria-label="Fit window to data"
                    title="Fit the window selection to the data range"
                  >
                    Fit
                  </Button>
                </StyledButtonGroup>
              </LabeledField>
              <SnapField>
                <FieldLabel title="Align window edges to histogram bin size">Snap to bin</FieldLabel>
                <ToggleGroup>
                  <Switch
                    id={snapToggleId}
                    checked={snapToBin}
                    onChange={handleSnapChange}
                    data-testid="time-widget-snap-toggle"
                    aria-label="Snap window to histogram bin boundaries"
                  />
                </ToggleGroup>
              </SnapField>
            </ControlRow>
          </ControlsContainer>
        ) : null}
        <TimelineSection>
          {timelineZoomed && timelineRangeLabel ? (
            <TimelineStatusBar>
              <span>Showing</span>
              <TimelineStatusRange>{timelineRangeLabel}</TimelineStatusRange>
              <Button
                small
                type="button"
                onClick={handleTimelineResetClick}
                aria-label="Reset timeline selection"
                data-testid="time-widget-timeline-reset"
              >
                Reset
              </Button>
            </TimelineStatusBar>
          ) : null}
          <TimeRangeSlider
            {...timeRangeSlideProps}
            domain={sliderDomain}
            onChange={timeSliderOnChange}
            toggleAnimation={_toggleAnimation}
            updateAnimationSpeed={_updateAnimationSpeed}
            setFilterAnimationWindow={_setFilterAnimationWindow}
            hideTimeTitle={showTimeDisplay}
            resetAnimation={resetAnimation}
            isAnimatable={isAnimatable}
            setFilterPlot={_setFilterPlot}
            animationConfig={animationConfig}
            isMinified={isMinified}
            timeline={timeline}
            onZoom={handleZoom}
            onZoomToRange={handleShiftZoom}
            onTimelineZoom={handleTimelineZoom}
            onTimelinePan={handleTimelinePan}
          />
        </TimelineSection>
        {showTimeDisplay ? (
          <FloatingTimeDisplay
            currentTime={filter.value}
            defaultTimeFormat={filter.defaultTimeFormat}
            timeFormat={filter.timeFormat}
            timezone={filter.timezone}
          />
        ) : null}
      </TimeBottomWidgetInner>
    );
  };

  return React.memo(TimeWidget);
}


export function formatNumber(value: number): string {
  if (Number.isNaN(value) || !Number.isFinite(value)) {
    return '0';
  }
  if (Number.isInteger(value)) {
    return value.toString();
  }
  const abs = Math.abs(value);
  const precision = abs < 1 ? 3 : abs < 10 ? 2 : 1;
  const formatted = value.toFixed(precision);
  return formatted.replace(/\.0+$/, '').replace(/(\.[0-9]*[1-9])0+$/, '$1');
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms)) {
    return '';
  }
  const abs = Math.abs(ms);
  if (abs >= durationDay) {
    return `${formatNumber(ms / durationDay)} d`;
  }
  if (abs >= durationHour) {
    return `${formatNumber(ms / durationHour)} h`;
  }
  if (abs >= durationMinute) {
    return `${formatNumber(ms / durationMinute)} min`;
  }
  if (abs >= durationSecond) {
    return `${formatNumber(ms / durationSecond)} s`;
  }
  return `${Math.round(ms)} ms`;
}

export function selectDurationUnit(ms: number): {value: number; unit: DurationUnitId} {
  for (let i = DURATION_UNITS.length - 1; i >= 0; i--) {
    const unit = DURATION_UNITS[i];
    if (ms % unit.ms === 0) {
      return {value: Math.round(ms / unit.ms), unit: unit.id};
    }
  }
  return {value: ms, unit: 'ms'};
}

export function convertDurationToMs(amount: number, unit: DurationUnitId): number {
  const unitMeta = DURATION_UNITS.find(u => u.id === unit) ?? DURATION_UNITS[0];
  return amount * unitMeta.ms;
}

export function parseDurationInput(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }
  if (!Number.isNaN(Number(trimmed))) {
    return Number(trimmed);
  }
  const match = trimmed.toLowerCase().match(/^(-?\d*\.?\d+)\s*([a-z]+)$/);
  if (!match) {
    return null;
  }
  const value = Number(match[1]);
  const unit = match[2];
  const unitMap: Record<string, number> = {
    ms: 1,
    millisecond: 1,
    milliseconds: 1,
    s: durationSecond,
    sec: durationSecond,
    secs: durationSecond,
    second: durationSecond,
    seconds: durationSecond,
    m: durationMinute,
    min: durationMinute,
    mins: durationMinute,
    minute: durationMinute,
    minutes: durationMinute,
    h: durationHour,
    hr: durationHour,
    hour: durationHour,
    hours: durationHour,
    d: durationDay,
    day: durationDay,
    days: durationDay
  };
  const multiplier = unitMap[unit];
  if (!multiplier) {
    return null;
  }
  return value * multiplier;
}

export function parseTimestampInput(value: string, timezone?: string | null): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (!Number.isNaN(Number(trimmed))) {
    return Number(trimmed);
  }
  if (timezone) {
    const zoned = moment.tz(trimmed, timezone);
    if (zoned.isValid()) {
      return zoned.valueOf();
    }
  }
  const parsed = moment(trimmed);
  return parsed.isValid() ? parsed.valueOf() : null;
}

export function getActiveBinWidth(filter: TimeRangeFilter): number | null {
  const interval = filter.plotType?.interval;
  if (!interval || !filter.timeBins) {
    return null;
  }
  for (const dataId of filter.dataId || []) {
    const binsForDataset = filter.timeBins?.[dataId];
    const bins = binsForDataset?.[interval]; 
    if (Array.isArray(bins) && bins.length) {
      const sample = bins.find(
        bin =>
          bin &&
          Number.isFinite(bin.x0) &&
          Number.isFinite(bin.x1) &&
          bin.x1 !== bin.x0
      );
      if (sample) {
        const width = sample.x1 - sample.x0;
        if (Number.isFinite(width) && width > 0) {
          return width;
        }
      }
    }
  }
  return null;
}

export default TimeWidgetFactory;
