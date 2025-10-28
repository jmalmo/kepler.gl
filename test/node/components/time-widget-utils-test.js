// SPDX-License-Identifier: MIT
// Copyright contributors to the kepler.gl project

import test from 'tape';
import moment from 'moment-timezone';

import {
  parseDurationInput,
  parseTimestampInput,
  formatDuration,
  getActiveBinWidth
} from '../../../src/components/src/filters/time-widget';
import {StateWFilters} from 'test/helpers/mock-state';

test('time-widget utils -> parseDurationInput', t => {
  t.equal(parseDurationInput('1000'), 1000, 'numeric string should return milliseconds');
  t.equal(parseDurationInput('30 s'), 30 * 1000, 'seconds string should parse correctly');
  t.equal(parseDurationInput('5min'), 5 * 60 * 1000, 'minutes string should parse correctly');
  t.equal(parseDurationInput('2 h'), 2 * 60 * 60 * 1000, 'hours string should parse correctly');
  t.equal(parseDurationInput('1 day'), 24 * 60 * 60 * 1000, 'days string should parse correctly');
  t.equal(parseDurationInput('not a duration'), null, 'invalid string should return null');
  t.end();
});

test('time-widget utils -> parseTimestampInput', t => {
  const isoString = '2016-09-23T05:00:00Z';
  const tzString = '2016-09-23 01:00:00';
  t.equal(parseTimestampInput('1474606800000'), 1474606800000, 'numeric timestamp should be parsed');
  t.equal(parseTimestampInput(isoString), moment(isoString).valueOf(), 'ISO string should parse with moment');
  t.equal(
    parseTimestampInput(tzString, 'America/New_York'),
    moment.tz(tzString, 'America/New_York').valueOf(),
    'timestamp should respect timezone when provided'
  );
  t.equal(parseTimestampInput(''), null, 'empty string should return null');
  t.end();
});

test('time-widget utils -> formatDuration', t => {
  t.equal(formatDuration(500), '500 ms', 'milliseconds should format correctly');
  t.equal(formatDuration(5 * 60 * 1000), '5 min', 'minutes should format correctly');
  t.equal(formatDuration(2 * 60 * 60 * 1000), '2 h', 'hours should format correctly');
  t.equal(formatDuration(3 * 24 * 60 * 60 * 1000), '3 d', 'days should format correctly');
  t.end();
});

test('time-widget utils -> getActiveBinWidth', t => {
  const filter = StateWFilters.visState.filters[0];
  const width = getActiveBinWidth(filter);
  t.equal(width, 60 * 60 * 1000, 'should return current histogram bin width');
  t.end();
});
