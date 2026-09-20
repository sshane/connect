import { DriveVideo } from './index';
import { bufferVideo, pause, videoTime } from '../../timeline/playback';

vi.mock('../../api/backend', () => ({ api: { video: { getQcameraStreamUrl: () => 'test.m3u8' } } }));

function makePlayer(overrides = {}) {
  const media = { currentTime: 222, seeking: false, readyState: 4, paused: false, playbackRate: 1, pause: vi.fn(), play: vi.fn() };
  const props = { currentRoute: { fullname: 'test', videoStartOffset: 800 }, desiredPlaySpeed: 1, dispatch: vi.fn(), ...overrides };
  const component = new DriveVideo(props);
  component.ready = true;
  component.videoPlayer.current = {
    getInternalPlayer: () => media,
    getCurrentTime: () => media.currentTime,
    seekTo: vi.fn((time) => { media.currentTime = time; media.seeking = true; media.readyState = 1; }),
  };
  return { component, media, player: component.videoPlayer.current, props };
}

describe('video-led playback', () => {
  it('follows media time instead of correcting clock drift with seeks or rate changes', () => {
    const { component, media, player, props } = makePlayer({ offset: 1000, startTime: 0 });
    component.syncVideo();
    expect(props.dispatch).toHaveBeenCalledWith(videoTime(222800));
    expect(player.seekTo).not.toHaveBeenCalled();
    expect(media.playbackRate).toBe(1);
    expect(media.pause).not.toHaveBeenCalled();
  });

  it('loops once without pausing during transient seeking or waiting for a timer to recover', () => {
    const { component, media, player, props } = makePlayer({ loop: { startTime: 217000, duration: 5000 } });
    component.syncVideo();
    expect(player.seekTo).toHaveBeenCalledWith(216.2, 'seconds');
    component.onVideoBuffering();
    component.syncVideo();
    expect(player.seekTo).toHaveBeenCalledTimes(1);
    expect(media.pause).not.toHaveBeenCalled();
    media.seeking = false;
    media.readyState = 4;
    component.props = { ...props, isBufferingVideo: true };
    component.onVideoSeeked();
    expect(props.dispatch).toHaveBeenCalledWith(bufferVideo(false));
    expect(props.dispatch).toHaveBeenCalledWith(videoTime(217000));
    expect(media.pause).not.toHaveBeenCalled();
  });

  it('does not repeatedly seek when a requested position is still loading', () => {
    const { component, player } = makePlayer({ loop: { startTime: 1000, duration: 5000 } });
    component.syncVideo();
    for (let i = 0; i < 20; i++) {
      component.syncVideo();
    }
    expect(player.seekTo).toHaveBeenCalledTimes(1);
  });

  it('keeps a buffering native-HLS element playing so the browser can recover', () => {
    const { component, media, props } = makePlayer();
    media.readyState = 1;
    component.onVideoBuffering();
    component.syncVideo();
    expect(props.dispatch).toHaveBeenCalledWith(bufferVideo(true));
    expect(media.pause).not.toHaveBeenCalled();
    expect(media.playbackRate).toBe(1);
  });

  it('never passes playbackRate zero to native Safari when paused', () => {
    const { component } = makePlayer({ desiredPlaySpeed: 0 });
    const element = component.render().props.children[1];
    expect(element.props.playing).toBe(false);
    expect(element.props.playbackRate).toBe(1);
  });

  it('supports loops beginning at zero with a video-start offset', () => {
    const { component, media, player } = makePlayer({ loop: { startTime: 0, duration: 1000 } });
    component.syncVideo();
    expect(player.seekTo).toHaveBeenCalledWith(0, 'seconds');
    media.seeking = false;
    component.onVideoSeeked();
    expect(player.seekTo).toHaveBeenCalledTimes(1);
  });

  it('loops at media end even when the route duration extends beyond the video', () => {
    const { component, media, player } = makePlayer({ loop: { startTime: 0, duration: 900000 } });
    media.ended = true;
    component.onVideoEnded();
    expect(player.seekTo).toHaveBeenCalledWith(0, 'seconds');
    media.ended = false;
    media.seeking = false;
    component.onVideoSeeked();
    expect(media.play).toHaveBeenCalledTimes(1);
  });

  it('stops at media end when looping is disabled', () => {
    const { component, props } = makePlayer();
    component.onVideoEnded();
    expect(props.dispatch).toHaveBeenCalledWith(pause());
  });

  it('releases the media clock on unmount for the map-only view', () => {
    const { component, props } = makePlayer();
    component.componentWillUnmount();
    expect(props.dispatch).toHaveBeenCalledWith(videoTime(null));
  });
});
