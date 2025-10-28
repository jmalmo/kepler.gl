// SPDX-License-Identifier: MIT
// Copyright contributors to the kepler.gl project

import React, {ReactElement, useMemo} from 'react';
import {scaleLinear} from 'd3-scale';
import {hcl} from 'd3-color';
import {min, max} from 'd3-array';
import styled from 'styled-components';

import {Bins} from '@kepler.gl/types';

// clipping mask constants
export const HISTOGRAM_MASK_MODE = {
  NoMask: 0,
  Mask: 1,
  MaskWithOverlay: 2
};
const HISTOGRAM_MASK_BGCOLOR = '#FFFFFF';
const HISTOGRAM_MASK_FGCOLOR = '#000000';

const histogramStyle = {
  highlightW: 0.7,
  unHighlightedW: 0.4
};

const HistogramWrapper = styled.svg`
  overflow: visible;
`;

const HistogramMaskRect = styled.rect`
  fill: ${props => props.theme.panelBackground};
`;

const HistogramBreakLine = styled.g`
  stroke: ${props => props.theme.histogramBreakLineColor};
  stroke-width: 1px;
  transform: translate(0, 0);
`;

type BarType = {
  $inRange: boolean;
  $isOverlay: boolean;
  $color?: string;
};
const BarUnmemoized = styled.rect<BarType>(
  ({theme, $inRange, $isOverlay, $color}) => `
  ${
    $isOverlay
      ? `fill: ${$color ?? theme.histogramOverlayColor};`
      : $inRange
      ? `fill: ${$color ?? theme.histogramFillInRange};`
      : `fill: ${$color ? hcl($color).darker() : theme.histogramFillOutRange};`
  }
`
);
const Bar = React.memo(BarUnmemoized);
Bar.displayName = 'Bar';

export type HistogramMaskModeType = {
  NoMask: number;
  Mask: number;
  MaskWithOverlay: number;
};

interface HistogramPlotProps {
  width: number;
  height: number;
  margin: {top: number; bottom: number; left: number; right: number};
  isRanged?: boolean;
  value: number[];
  isMasked?: number;
  brushComponent?: ReactElement;
  histogramsByGroup: Bins;
  colorsByGroup?: null | {[dataId: string]: string};
  countProp?: string;
  range?: number[];
  breakLines?: number[];
}

function HistogramPlotFactory() {
  const HistogramPlot = ({
    width,
    height,
    histogramsByGroup,
    colorsByGroup,
    isMasked = HISTOGRAM_MASK_MODE.NoMask,
    countProp = 'count',
    margin,
    isRanged,
    range,
    value,
    brushComponent,
    breakLines
  }: HistogramPlotProps) => {
    const groupKeys = useMemo(
      () =>
        Object.keys(histogramsByGroup)
          // only keep non-empty groups
          .filter(key => histogramsByGroup[key]?.length > 0),
      [histogramsByGroup]
    );

    const domain = useMemo(
      () =>
        range ?? [
          min(groupKeys, key => histogramsByGroup[key][0].x0) ?? 0,
          max(groupKeys, key => histogramsByGroup[key][histogramsByGroup[key].length - 1].x1) ?? 0
        ],
      [range, histogramsByGroup, groupKeys]
    );

    const barWidth = useMemo(() => {
      if (groupKeys.length === 0) return 0;
      // find histogramsByGroup with max number of bins
      const maxGroup = groupKeys.reduce((accu, key, _idx) => {
        if (histogramsByGroup[key].length > accu.length) {
          return histogramsByGroup[key];
        }
        return accu;
      }, histogramsByGroup[groupKeys[0]]);

      // find the bin for measuring step
      const stdBinIdx = maxGroup.length > 1 ? 1 : 0;
      const xStep = maxGroup[stdBinIdx].x1 - maxGroup[stdBinIdx].x0;
      const maxBins = (domain[1] - domain[0]) / xStep;
      if (!maxBins) return 0;
      return width / maxBins / (isMasked ? 1 : groupKeys.length);
    }, [histogramsByGroup, domain, groupKeys, width, isMasked]);

    const x = useMemo(
      () => scaleLinear().domain(domain).range([barWidth, width]),
      [domain, width, barWidth]
    );

    const y = useMemo(
      () =>
        scaleLinear()
          .domain([
            0,
            Math.max(
              Number(max(groupKeys, key => max(histogramsByGroup[key], d => d[countProp]))),
              1
            )
          ])
          .range([0, height]),
      [histogramsByGroup, groupKeys, height, countProp]
    );

    if (groupKeys.length === 0) {
      return null;
    }

    const getBarLayout = (bar: {x0: number; x1: number}) => {
      const windowStart = value[0];
      const windowEnd = value[1];
      const overlapsWindow = bar.x1 > windowStart && bar.x0 < windowEnd;
      const touchesDomainStart = windowStart <= domain[0] && bar.x0 <= domain[0] && bar.x1 > domain[0];
      const touchesDomainEnd = windowEnd >= domain[1] && bar.x1 >= domain[1] && bar.x0 < domain[1];
      const inRange = overlapsWindow || touchesDomainStart || touchesDomainEnd;

      const ratio = inRange ? histogramStyle.highlightW : histogramStyle.unHighlightedW;
      const widthPx = barWidth * ratio;
      const xPos = x(bar.x0) + (barWidth - widthPx) / 2;

      return {inRange, width: widthPx, x: xPos};
    };

    const maskedHistogram = () => {
      return (
        <HistogramWrapper
          width={width}
          height={height}
          style={{margin: `${margin.top}px ${margin.right}px ${margin.bottom}px ${margin.left}px`}}
        >
          <defs>
            <mask id="histogram-mask">
              <rect
                x="0"
                y="0"
                width={width}
                height={height + margin.bottom}
                fill={HISTOGRAM_MASK_BGCOLOR}
              />
              <g key="filtered-bins" className="histogram-bars">
                {histogramsByGroup.filteredBins.map((bar, idx, list) => {
                  const layout = getBarLayout(bar);
                  return (
                    <Bar
                      $isOverlay={false}
                      $inRange={layout.inRange}
                      $color={HISTOGRAM_MASK_FGCOLOR}
                      key={`mask-${idx}`}
                      height={y(bar[countProp])}
                      width={layout.width}
                      x={layout.x}
                      y={height - y(bar[countProp])}
                    />
                  );
                })}
              </g>
            </mask>
          </defs>
          <g transform="translate(0,0)">
            <HistogramMaskRect
              x="0"
              y="0"
              width="100%"
              height={height + margin.bottom}
              mask="url(#histogram-mask)"
            />
          </g>
          {isMasked === HISTOGRAM_MASK_MODE.MaskWithOverlay && (
            <g key="bins" transform="translate(0,0)" className="overlay-histogram-bars">
              {histogramsByGroup.bins.map((bar, idx, list) => {
                const filterBar = histogramsByGroup.filteredBins[idx];
                const maskHeight = filterBar
                  ? y(bar[countProp]) - y(filterBar[countProp])
                  : y(bar[countProp]);
                const layout = getBarLayout(bar);
                return (
                  <Bar
                    $inRange={layout.inRange}
                    $isOverlay={true}
                    key={`bar-${idx}`}
                    height={maskHeight}
                    width={layout.width}
                    x={layout.x}
                    y={height - y(bar[countProp])}
                  />
                );
              })}
            </g>
          )}
          <HistogramBreakLine>
            {(breakLines ?? []).map((pos, idx) => {
              return (
                <path key={`mask-line-${idx}`} strokeDasharray="4,4" d={`M${pos}, 0 l0 100`} />
              );
            })}
          </HistogramBreakLine>
          <g transform={`translate(${isRanged ? 0 : barWidth / 2}, 0)`}>{brushComponent}</g>
        </HistogramWrapper>
      );
    };

    return isMasked ? (
      maskedHistogram()
    ) : (
      <HistogramWrapper
        width={width}
        height={height}
        style={{margin: `${margin.top}px ${margin.right}px ${margin.bottom}px ${margin.left}px`}}
      >
        <g>
          {groupKeys.map((key, i) => (
            <g key={key} className="histogram-bars">
              {histogramsByGroup[key].map((bar, idx) => {
                const layout = getBarLayout(bar);
                const startX = layout.x + barWidth * i;
                if (startX > 0 && startX + layout.width <= width) {
                  return (
                    <Bar
                      $isOverlay={false}
                      $inRange={layout.inRange}
                      $color={colorsByGroup?.[key]}
                      key={`bar-${key}-${idx}`}
                      height={y(bar[countProp])}
                      width={layout.width}
                      x={startX}
                      rx={1}
                      ry={1}
                      y={height - y(bar[countProp])}
                    />
                  );
                }
                return null;
              })}
            </g>
          ))}
        </g>
        <g transform={`translate(${isRanged ? 0 : barWidth / 2}, 0)`}>{brushComponent}</g>
      </HistogramWrapper>
    );
  };

  const HistogramPlotWithGroups = props => {
    const groups = useMemo(
      () => (props.histogramsByGroup ? Object.keys(props.histogramsByGroup) : null),
      [props.histogramsByGroup]
    );

    if (!groups?.length) {
      return null;
    }

    return <HistogramPlot {...props} />;
  };

  return HistogramPlotWithGroups;
}
export default HistogramPlotFactory;
