import { currentOffset } from '.';
import { reducer, seek, pause, play, videoTime } from './playback';

const initial = { offset: 0, startTime: 0, desiredPlaySpeed: 1, isBufferingVideo: false };

describe('media clock', () => {
  it('does not advance or wrap the video time from the wall clock', () => {
    const state = reducer({ ...initial, loop: { startTime: 0, duration: 5000 } }, videoTime(4900));
    expect(currentOffset(state)).toBe(4900);
    expect(state.offset).toBe(4900);
    expect(currentOffset(reducer(state, play(2)))).toBe(4900);
    expect(currentOffset(reducer(state, pause()))).toBe(4900);
  });

  it('distinguishes deliberate seeks from media progress, including repeat seeks', () => {
    let state = reducer(initial, videoTime(3000));
    expect(state.seekRevision).toBeUndefined();
    state = reducer(state, seek(1000));
    expect(state.videoTime).toBeNull();
    expect(state.seekRevision).toBe(1);
    state = reducer(state, seek(1000));
    expect(state.seekRevision).toBe(2);
  });

  it('hands off to the wall clock at the last media position', () => {
    const state = reducer(reducer(initial, videoTime(3456)), videoTime(null));
    expect(state.offset).toBe(3456);
    expect(state.videoTime).toBeNull();
    expect(currentOffset(state)).toBeGreaterThanOrEqual(3456);
  });
});
