// Kindling: official YouTube player for the night and hill songs, with beat and lightning timings measured offline.

export const TRACKS = {
  thriller: {
    id: 'sO4vI8P88NM', title: 'Thriller', artist: 'Michael Jackson', intro: 17.29, beat: [41.75, 0.5068],
    hits: [[11.54, 0.63], [21.5, 0.54], [41.8, 0.55], [50.97, 0.59], [60.6, 0.57], [69.74, 0.55], [79.89, 0.53], [90.04, 0.59], [104.24, 0.54], [113.35, 0.56], [122.47, 0.55], [131.6, 0.53], [140.72, 0.54], [150.85, 0.53], [160.99, 0.56], [172.12, 0.54], [187.32, 0.53], [197.44, 0.55], [208.57, 0.54], [217.69, 0.55], [230.85, 0.52], [240.97, 0.52], [250.09, 0.52], [259.19, 0.74], [268.29, 0.55], [277.4, 0.54], [286.52, 0.69], [295.62, 0.59], [304.74, 0.6], [313.84, 0.55], [339.14, 0.55], [350.92, 0.57]],
  },
  ghostbusters: { id: 'Fe93CLbHjxQ', title: 'Ghostbusters', artist: 'Ray Parker Jr.', beat: [0, 0.5172] },
};

export class YTMusic {
  constructor(box) {
    this.box = box;
    this.titleEl = box.querySelector('.yt-title');
    this.player = null;
    this.loading = null;
    this.track = null;
    this.vol = 0.55;
    this.rate = 1;
    this.want = false;
    this.failed = false;
    this.hitIdx = 0;
    this.lastT = 0;
  }

  load() {
    if (this.loading) return this.loading;
    this.loading = new Promise((res, rej) => {
      const timer = setTimeout(() => rej(new Error('YouTube did not load')), 20000);
      const make = () => {
        this.player = new window.YT.Player(this.box.querySelector('.yt-frame'), {
          width: 356, height: 200,
          playerVars: { controls: 0, disablekb: 1, playsinline: 1, rel: 0, iv_load_policy: 3, fs: 0 },
          events: {
            onReady: () => { clearTimeout(timer); this.applyVol(); res(this); },
            onStateChange: (e) => this.onState(e.data),
            onError: () => { this.failed = true; this.want = false; this.show(false); },
          },
        });
      };
      if (window.YT && window.YT.Player) { make(); return; }
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { if (prev) prev(); make(); };
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      s.onerror = () => { clearTimeout(timer); rej(new Error('YouTube blocked')); };
      document.head.appendChild(s);
    });
    this.loading.catch(() => { this.failed = true; });
    return this.loading;
  }

  async play(name, from = 0) {
    this.want = name;
    try { await this.load(); } catch (e) { return; }
    if (this.want !== name) return;
    const t = TRACKS[name];
    if (this.track !== name) {
      this.player.loadVideoById({ videoId: t.id, startSeconds: from });
      this.track = name;
    } else {
      this.player.seekTo(from, true);
      this.player.playVideo();
    }
    this.titleEl.textContent = `${t.title} · ${t.artist}`;
    this.hitIdx = 0;
    this.lastT = from;
    this.rate = 1;
    if (this.player.setPlaybackRate) this.player.setPlaybackRate(1);
    this.applyVol();
    this.show(true);
  }

  pause() {
    this.want = false;
    if (this.player && this.player.pauseVideo) this.player.pauseVideo();
    this.show(false);
  }

  onState(s) {
    if (s === 0 && this.want) {
      this.player.seekTo(0, true);
      this.player.playVideo();
      this.hitIdx = 0;
    }
    if (s === 1 || s === 3) this.show(!!this.want);
  }

  get playing() { return !!this.player && !!this.player.getPlayerState && this.player.getPlayerState() === 1; }
  time() { return this.player && this.player.getCurrentTime ? this.player.getCurrentTime() : 0; }

  beat(name) {
    const T = TRACKS[name];
    if (!T || this.track !== name || !this.playing) return null;
    return (this.time() - T.beat[0]) / T.beat[1];
  }

  setVolume(v) { this.vol = v; this.applyVol(); }
  applyVol() { if (this.player && this.player.setVolume) this.player.setVolume(Math.round(this.vol * 100)); }

  setRate(r) {
    if (r === this.rate || !this.player || !this.player.setPlaybackRate) return;
    this.rate = r;
    this.player.setPlaybackRate(r);
  }

  transient() {
    const T = TRACKS[this.track];
    if (!T || !T.hits || !this.playing) return 0;
    const t = this.time();
    if (t < this.lastT - 1) this.hitIdx = 0;
    this.lastT = t;
    let out = 0;
    while (this.hitIdx < T.hits.length && T.hits[this.hitIdx][0] <= t) {
      const h = T.hits[this.hitIdx++];
      if (t - h[0] < 0.5) out = h[1];
    }
    return out;
  }

  show(on) {
    this.box.classList.toggle('hidden', !on);
    document.body.classList.toggle('yt-on', on);
  }
}
