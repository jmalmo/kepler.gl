# Playback

Follow these steps to create a playback video of an event:
1. Add a filter based on a time-related field, like timestamp. For GeoJson, property field should contain a timestamp entry.

2. The playback window will appear on the bottom of the map. The bars are distribution graphs of all data points by time. Select the desired rolling time window:

![select filters](https://d1a3f4spazzrp4.cloudfront.net/kepler.gl/documentation/h-playback-1.png "select filters")

3. Press play to start the video. Click on the speed value and select/input your desired value _1x_, _2x_, _4x_ on the top right to change the playback speed.

![change speed](https://d1a3f4spazzrp4.cloudfront.net/kepler.gl/documentation/h-playback-2.gif "select filters")

4. Choose custom y axis. You can click __Select Y Axis__ to change the default distribution graph to a timeseries of the selected column. An example use of this function is to show a distance vs. time graph of a given trip.

![custom y axis](https://d1a3f4spazzrp4.cloudfront.net/kepler.gl/documentation/h-playback-3.png "select filters")

## Zoom & precision controls

The enlarged timeline now includes tools for focusing on the exact window you need:

- Use the mouse wheel, trackpad pinch, double-click (zoom in), or <kbd>⌥</kbd>/<kbd>Alt</kbd>+double-click (zoom out) to scale around the cursor. Shift–dragging the histogram zooms to the brushed range.
- Click the calendar button (or the Start/End fields) to open date and time pickers that honor your filter format.
- Start, End, and Window Width inputs accept ISO timestamps or durations (for example `5 min`) with validation and keyboard arrow nudging. Anchor buttons control which edge stays fixed when resizing.
- Snap to bin aligns the window to the active histogram interval, and keyboard left/right arrows move the window by the current step (Shift ×10, Alt ×0.1).
- Quick buttons provide one-click zoom in/out and reset Fit to restore the full data domain.

![Timeline zoom controls](https://d1a3f4spazzrp4.cloudfront.net/kepler.gl/documentation/h-playback-zoom-precision.gif "Timeline zoom and precision controls")


[Back to table of contents](README.md)
