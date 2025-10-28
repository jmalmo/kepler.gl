// SPDX-License-Identifier: MIT
// Copyright contributors to the kepler.gl project

import React, {Component} from 'react';
import {bisectLeft} from 'd3-array';
import {requestAnimationFrame, cancelAnimationFrame} from 'global/window';
import Console from 'global/console';
import {BASE_SPEED, FPS, ANIMATION_WINDOW} from '@kepler.gl/constants';
import {Timeline} from '@kepler.gl/types';

interface AnimationControllerProps<T extends number | number[]> {
  isAnimating?: boolean;
  speed?: number;
  updateAnimation?: (x: T) => void;
  setTimelineValue: (x: T) => void;
  timeline?: Timeline;
  animationWindow?: string;
  steps?: number[] | null;
  domain: number[] | null;
  value: T;
  baseSpeed?: number;
  children?: (
    isAnimating: boolean | undefined,
    startAnimation: () => void,
    pauseAnimation: () => void,
    resetAnimation: () => void,
    timeline: Timeline | undefined,
    setTimelineValue: (x: T) => void
  ) => React.ReactElement | null;
}

class AnimationControllerType<T extends number | number[]> extends Component<
  AnimationControllerProps<T>
> {}

const MIN_RANGE_WIDTH = 1e-6;

function AnimationControllerFactory(): typeof AnimationControllerType {
  /**
   * 4 Animation Window Types
   * 1. free
   *  |->  |->
   * Current time is a fixed range, animate a moving window that calls next animation frames continuously
   * The increment id based on domain / BASE_SPEED * SPEED
   *
   * 2. incremental
   * |    |->
   * Same as free, current time is a growing range, only the max value of range increment during animation.
   * The increment is also based on domain / BASE_SPEED * SPEED
   *
   * 3. point
   * o -> o
   * Current time is a point, animate a moving point calls next animation frame continuously
   * The increment is based on domain / BASE_SPEED * SPEED
   *
   * 4. interval
   * o ~> o
   * Current time is a point. An array of sorted time steps are provided,
   * animate a moving point jumps to the next step
   */
  class AnimationController<T extends number | number[]> extends Component<
    AnimationControllerProps<T>
  > {
    static defaultProps = {
      baseSpeed: BASE_SPEED,
      speed: 1,
      steps: null,
      animationWindow: ANIMATION_WINDOW.free
    };

    state = {
      isAnimating: false
    };

    componentDidMount() {
      this._startOrPauseAnimation();
    }

    componentDidUpdate() {
      this._startOrPauseAnimation();
    }

    componentWillUnmount() {
      if (this._timer) {
        cancelAnimationFrame(this._timer);
      }
    }

    _timer = null;
    _startTime = 0;
    _rangeWidth: number | null = null;

    _startOrPauseAnimation() {
      const {isAnimating, speed = 1} = this.props;
      if (!this._timer && isAnimating && speed > 0) {
        this._startAnimation();
      } else if (this._timer && !isAnimating) {
        this._pauseAnimation();
      }
    }

    _animate = delay => {
      this._startTime = new Date().getTime();

      const loop = () => {
        const current = new Date().getTime();
        const delta = current - this._startTime;

        if (delta >= delay) {
          this._nextFrame();
          this._startTime = new Date().getTime();
        } else {
          this._timer = requestAnimationFrame(loop);
        }
      };

      this._timer = requestAnimationFrame(loop);
    };

    _resetAnimationByDomain = () => {
      const {domain, value, animationWindow, updateAnimation} = this.props;
      if (!domain) {
        return;
      }
      // interim solution while we fully migrate filter and layer controllers
      const setTimelineValue = updateAnimation || this.props.setTimelineValue;

      if (Array.isArray(value)) {
        if (animationWindow === ANIMATION_WINDOW.incremental) {
          setTimelineValue([value[0], value[0] + 1] as T);
          this._rangeWidth = 1;
        } else {
          const currentWidth = value[1] - value[0];
          const domainWidth = domain[1] - domain[0];
          const width =
            currentWidth > MIN_RANGE_WIDTH ? Math.min(currentWidth, domainWidth) : domainWidth;
          this._rangeWidth = width;
          setTimelineValue([domain[0], Math.min(domain[0] + width, domain[1])] as T);
        }
      } else {
        setTimelineValue(domain[0] as T);
        this._rangeWidth = null;
      }
    };

    _resetAnimationByTimeStep = () => {
      const {steps = null, updateAnimation} = this.props;
      if (!steps) return;
      // interim solution while we fully migrate filter and layer controllers
      const setTimelineValue = updateAnimation || this.props.setTimelineValue;

      // go to the first steps
      setTimelineValue([steps[0], 0] as T);
    };

    _resetAnimation = () => {
      if (this.props.animationWindow === ANIMATION_WINDOW.interval) {
        this._resetAnimationByTimeStep();
      } else {
        this._resetAnimationByDomain();
      }
    };

    _startAnimation = () => {
      const {speed = 1} = this.props;
      this._clearTimer();
      if (speed > 0) {
        if (this.props.animationWindow === ANIMATION_WINDOW.interval) {
          // animate by interval
          // 30*600
          const {steps} = this.props;
          if (!Array.isArray(steps) || !steps.length) {
            Console.warn('animation steps should be an array');
            return;
          }
          // when speed = 1, animation should loop through 600 frames at 60 FPS
          // calculate delay based on # steps
          const delay = (BASE_SPEED * (1000 / FPS)) / steps.length / (speed || 1);
          this._animate(delay);
        } else {
          this._timer = requestAnimationFrame(this._nextFrame);
        }
      }
      this.setState({isAnimating: true});
    };

    _clearTimer = () => {
      if (this._timer) {
        cancelAnimationFrame(this._timer);
        this._timer = null;
      }
    };

    _pauseAnimation = () => {
      this._clearTimer();
      this.setState({isAnimating: false});
    };

    _nextFrame = () => {
      this._timer = null;
      const nextValue =
        this.props.animationWindow === ANIMATION_WINDOW.interval
          ? this._nextFrameByTimeStep()
          : this._nextFrameByDomain();

      // interim solution while we fully migrate filter and layer controllers
      const setTimelineValue = this.props.updateAnimation || this.props.setTimelineValue;
      setTimelineValue(nextValue as T);
    };

    _nextFrameByDomain() {
      const {domain, value, speed = 1, baseSpeed = 600, animationWindow} = this.props;
      if (!domain) {
        return;
      }
      const delta = ((domain[1] - domain[0]) / baseSpeed) * speed;

      // loop when reaches the end
      // current time is a range
      if (Array.isArray(value)) {
        let value0: number;
        let value1: number;
        if (animationWindow === ANIMATION_WINDOW.incremental) {
          const lastFrame = value[1] + delta > domain[1];
          value0 = value[0];
          value1 = lastFrame ? value[0] + 1 : value[1] + delta;
          this._rangeWidth = value1 - value0;
        } else {
          const domainWidth = domain[1] - domain[0];
          const currentWidth = value[1] - value[0];
          if (currentWidth > MIN_RANGE_WIDTH) {
            this._rangeWidth = Math.min(currentWidth, domainWidth);
          } else if (this._rangeWidth === null) {
            this._rangeWidth = Math.max(domainWidth, 0);
          }
          const windowWidth =
            this._rangeWidth && this._rangeWidth > MIN_RANGE_WIDTH
              ? Math.min(this._rangeWidth, domainWidth)
              : Math.max(domainWidth, currentWidth);
          const maxStart = domain[1] - windowWidth;
          const proposedStart = value[0] + delta;
          const shouldLoop = proposedStart > maxStart;
          value0 = shouldLoop ? domain[0] : Math.min(Math.max(proposedStart, domain[0]), maxStart);
          value1 = value0 + windowWidth;
          if (value1 > domain[1]) {
            value1 = domain[1];
            value0 = Math.max(domain[0], value1 - windowWidth);
          }
        }
        return [value0, value1];
      }

      // current time is a point
      return Number(value) + delta > domain[1] ? domain[0] : Number(value) + delta;
    }

    _nextFrameByTimeStep() {
      const {steps = null, value} = this.props;
      if (!steps) return;
      const val = Array.isArray(value) ? value[0] : Number(value);
      const index = bisectLeft(steps, val);
      const nextIdx = index >= steps.length - 1 ? 0 : index + 1;

      // why do we need to pass an array of two objects? are we reading nextIdx at some point?
      // _nextFrameByDomain only returns one value
      return [steps[nextIdx], nextIdx];
    }

    render() {
      const {isAnimating} = this.state;
      const {children} = this.props;

      return typeof children === 'function'
        ? children(
            isAnimating,
            this._startAnimation,
            this._pauseAnimation,
            this._resetAnimation,
            this.props.timeline,
            this.props.setTimelineValue
          )
        : null;
    }
  }

  return AnimationController;
}

export default AnimationControllerFactory;
