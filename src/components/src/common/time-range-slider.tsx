// SPDX-License-Identifier: MIT
// Copyright contributors to the kepler.gl project

import React, {useMemo, useCallback, useRef, useEffect} from 'react';
import throttle from 'lodash/throttle';
import styled, {IStyledComponent} from 'styled-components';

import RangeSliderFactory from './range-slider';
import TimeSliderMarkerFactory from './time-slider-marker';
import PlaybackControlsFactory from './animation-control/playback-controls';
import TimeRangeSliderTimeTitleFactory from './time-range-slider-time-title';
import {LineChart, Timeline, AnimationConfig, TimeBins, TimeFilterZoomOptions} from '@kepler.gl/types';
import {ActionHandler, setFilterPlot} from '@kepler.gl/actions';
import AnimationControlFactory from './animation-control/animation-control';
import {BaseComponentProps} from '../types';

const animationControlWidth = 176;

type TimeRangeSliderProps = {
  domain?: [number, number];
  value: [number, number];
  isEnlarged?: boolean;
  isMinified?: boolean;
  hideTimeTitle?: boolean;
  isAnimating: boolean;
  timeFormat: string;
  timezone?: string | null;
  timeBins?: TimeBins;
  plotType?: {
    [key: string]: any;
  };
  lineChart?: LineChart;
  step: number;
  isAnimatable?: boolean;
  speed: number;
  animationWindow: string;
  resetAnimation?: () => void;
  toggleAnimation: () => void;
  updateAnimationSpeed?: (val: number) => void;
  setFilterAnimationWindow?: (id: string) => void;
  setFilterPlot?: ActionHandler<typeof setFilterPlot>;
  onChange: (v: number[]) => void;
  timeline: Timeline;
  invertTrendColor?: boolean;
  animationConfig?: AnimationConfig;
  zoom?: TimeFilterZoomOptions;
  onZoom?: (factor: number, center: number) => void;
  onZoomToRange?: (range: [number, number]) => void;
  onTimelineZoom?: (factor: number, center: number) => void;
  onTimelinePan?: (delta: number) => void;
};

export type StyledSliderContainerProps = BaseComponentProps & {
  isEnlarged?: boolean;
};

const StyledSliderContainer: IStyledComponent<
  'web',
  StyledSliderContainerProps
> = styled.div<StyledSliderContainerProps>`
  align-items: flex-end;
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  padding-left: ${props => (props.isEnlarged ? 24 : 0)}px;

  .timeline-container .kg-slider {
    display: none;
  }

  .timeline-container {
    touch-action: none;
  }

  .playback-controls {
    margin-left: 22px;
  }
`;

const ANIMATION_CONTROL_STYLE = {flex: 1};

TimeRangeSliderFactory.deps = [
  PlaybackControlsFactory,
  RangeSliderFactory,
  TimeSliderMarkerFactory,
  TimeRangeSliderTimeTitleFactory,
  AnimationControlFactory
];

export function getTimeBinsForInterval(timeBins: TimeBins | undefined, interval: number) {
  if (!timeBins) return {};
  return Object.keys(timeBins).reduce((acc, dataId) => {
    acc[dataId] = timeBins[dataId][interval];
    return acc;
  }, {});
}

export default function TimeRangeSliderFactory(
  PlaybackControls: ReturnType<typeof PlaybackControlsFactory>,
  RangeSlider: ReturnType<typeof RangeSliderFactory>,
  TimeSliderMarker: ReturnType<typeof TimeSliderMarkerFactory>,
  TimeRangeSliderTimeTitle: ReturnType<typeof TimeRangeSliderTimeTitleFactory>,
  AnimationControl: ReturnType<typeof AnimationControlFactory>
) {
  const TimeRangeSlider: React.FC<TimeRangeSliderProps> = props => {
    const {
      domain,
      value,
      isEnlarged,
      isMinified,
      hideTimeTitle,
      isAnimating,
      resetAnimation,
      timeFormat,
      timezone,
      timeBins,
      plotType,
      lineChart,
      invertTrendColor,
      step,
      isAnimatable,
      speed,
      animationWindow,
      updateAnimationSpeed,
      setFilterAnimationWindow,
      toggleAnimation,
      onChange,
      setFilterPlot,
      timeline,
      onZoom,
      onZoomToRange,
      onTimelineZoom,
      onTimelinePan
    } = props;

    const throttledOnchange = useMemo(() => throttle(onChange, 20), [onChange]);

    useEffect(() => {
      return () => {
        throttledOnchange.cancel();
      };
    }, [throttledOnchange]);
    const binsForInterval = useMemo(
      () => getTimeBinsForInterval(timeBins, plotType?.interval),
      [timeBins, plotType?.interval]
    );

    const timelineRef = useRef<HTMLDivElement | null>(null);

    const throttledZoom = useMemo(() => {
      if (!onZoom) {
        return null;
      }
      return throttle((factor: number, center: number) => {
        onZoom(factor, center);
      }, 50);
    }, [onZoom]);

    useEffect(() => {
      return () => {
        throttledZoom?.cancel();
      };
    }, [throttledZoom]);

    const throttledTimelineZoom = useMemo(() => {
      if (!onTimelineZoom) {
        return null;
      }
      return throttle((factor: number, center: number) => {
        onTimelineZoom(factor, center);
      }, 50);
    }, [onTimelineZoom]);

    useEffect(() => {
      return () => {
        throttledTimelineZoom?.cancel();
      };
    }, [throttledTimelineZoom]);

    const throttledTimelinePan = useMemo(() => {
      if (!onTimelinePan) {
        return null;
      }
      return throttle((delta: number) => {
        onTimelinePan(delta);
      }, 16);
    }, [onTimelinePan]);

    useEffect(() => {
      return () => {
        throttledTimelinePan?.cancel();
      };
    }, [throttledTimelinePan]);

    useEffect(() => {
      const node = timelineRef.current;
      if (!node) {
        return undefined;
      }
      const preventBrowserZoom = (event: WheelEvent) => {
        const isPinchGesture =
          event.ctrlKey || event.metaKey || Math.abs(event.deltaZ || 0) > 0;
        if (isPinchGesture) {
          event.preventDefault();
        }
      };
      node.addEventListener('wheel', preventBrowserZoom, {passive: false});
      return () => {
        node.removeEventListener('wheel', preventBrowserZoom);
      };
    }, []);

    const computeCenter = useCallback(
      (clientX: number) => {
        const rect = timelineRef.current?.getBoundingClientRect();
        if (!domain || !rect || !rect.width) {
          return null;
        }
        const ratio = (clientX - rect.left) / rect.width;
        const clamped = Math.min(Math.max(ratio, 0), 1);
        return domain[0] + clamped * (domain[1] - domain[0]);
      },
      [domain]
    );

    const handleWheel = useCallback(
      (event: React.WheelEvent<HTMLDivElement>) => {
        if (isMinified) {
          return;
        }
        const nativeEvent = event.nativeEvent as WheelEvent;
        const center = computeCenter(event.clientX);
        if (center === null) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();

        if (event.deltaY === 0) {
          return;
        }

        const container = timelineRef.current?.closest<HTMLDivElement>('.bottom-widget--inner');
        container?.focus({preventScroll: true});
        const isPinchGesture =
          event.ctrlKey ||
          nativeEvent.ctrlKey ||
          nativeEvent.metaKey ||
          Math.abs(nativeEvent.deltaZ || 0) > 0;
        const baseStep = isPinchGesture ? 0.05 : 0.2;
        const factor = event.deltaY < 0 ? 1 + baseStep : 1 / (1 + baseStep);
        if (isPinchGesture && throttledTimelineZoom) {
          throttledTimelineZoom(factor, center);
        } else if (throttledZoom) {
          throttledZoom(factor, center);
        }
      },
      [computeCenter, throttledTimelineZoom, throttledZoom, isMinified]
    );

    const handleShiftBrush = useCallback(
      (range: [number, number]) => {
        if (!onZoomToRange) {
          return;
        }
        const [val0, val1] = range;
        const ordered: [number, number] = val0 <= val1 ? [val0, val1] : [val1, val0];
        const container = timelineRef.current?.closest<HTMLDivElement>('.bottom-widget--inner');
        container?.focus({preventScroll: true});
        onZoomToRange(ordered);
      },
      [onZoomToRange]
    );

    const handleCtrlPan = useCallback(
      (delta: number) => {
        throttledTimelinePan?.(delta);
      },
      [throttledTimelinePan]
    );

    const style = useMemo(
      () => ({
        width: isEnlarged ? `calc(100% - ${animationControlWidth}px)` : '100%'
      }),
      [isEnlarged]
    );

    return (
      <div className="time-range-slider">
        {!hideTimeTitle && isEnlarged ? (
          <div className="time-range-slider__title" style={style}>
            <TimeRangeSliderTimeTitle
              timeFormat={timeFormat}
              timezone={timezone}
              value={value}
              isEnlarged={isEnlarged}
            />
          </div>
        ) : null}
        <StyledSliderContainer className="time-range-slider__container" isEnlarged={isEnlarged}>
          {!isMinified ? (
            <div
              className="timeline-container"
              style={style}
              ref={timelineRef}
              onWheel={handleWheel}
            >
              <RangeSlider
                range={domain}
                value0={value[0]}
                value1={value[1]}
                bins={binsForInterval}
                lineChart={lineChart}
                invertTrendColor={invertTrendColor}
                plotType={plotType}
                isEnlarged={isEnlarged}
                showInput={false}
                step={step}
                onChange={throttledOnchange}
                xAxis={TimeSliderMarker}
                timezone={timezone}
                timeFormat={timeFormat}
                setFilterPlot={setFilterPlot}
                onShiftBrush={handleShiftBrush}
                onCtrlPan={handleCtrlPan}
              />
            </div>
          ) : (
            <AnimationControl
              style={ANIMATION_CONTROL_STYLE}
              isAnimatable={isAnimatable}
              isAnimating={isAnimating}
              resetAnimation={resetAnimation}
              toggleAnimation={toggleAnimation}
              updateAnimationSpeed={updateAnimationSpeed}
              setTimelineValue={throttledOnchange}
              setAnimationWindow={setFilterAnimationWindow}
              showTimeDisplay={false}
              timeline={timeline}
            />
          )}
          {isEnlarged && !isMinified ? (
            <PlaybackControls
              isAnimatable={isAnimatable}
              width={animationControlWidth}
              speed={speed}
              animationWindow={animationWindow}
              updateAnimationSpeed={updateAnimationSpeed}
              setFilterAnimationWindow={setFilterAnimationWindow}
              pauseAnimation={toggleAnimation}
              resetAnimation={resetAnimation}
              isAnimating={isAnimating}
              startAnimation={toggleAnimation}
            />
          ) : null}
        </StyledSliderContainer>
      </div>
    );
  };

  return React.memo(TimeRangeSlider);
}
