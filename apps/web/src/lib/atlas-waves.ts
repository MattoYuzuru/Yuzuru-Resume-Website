export const WAVE_LIFETIME = 3200;
interface Wave { x: number; y: number; start: number; seed: number; }

/** Live clicks append; only their own expiry removes waves. Storage is reused between frames. */
export class AtlasWaves {
  private waves: Wave[] = [];
  private buffer = new Float32Array(64 * 4);
  end = 0;

  add(x: number, y: number, now: number, random = Math.random) {
    for (let index = 0; index < 3; index++) {
      const wave = {x: index ? .08 + random() * .84 : x, y: index ? .08 + random() * .84 : y,
        start: now + (index ? index * 220 + random() * 280 : 0), seed: random()};
      this.waves.push(wave); this.end = Math.max(this.end, wave.start + WAVE_LIFETIME);
    }
  }

  sample(now: number): Float32Array {
    for (let i = this.waves.length - 1; i >= 0; i--) if (now - this.waves[i]!.start >= WAVE_LIFETIME) this.waves.splice(i, 1);
    if (this.buffer.length < this.waves.length * 4) this.buffer = new Float32Array(2 ** Math.ceil(Math.log2(this.waves.length * 4)));
    this.waves.forEach((wave, index) => {
      const at = index * 4;
      this.buffer[at] = wave.x; this.buffer[at + 1] = wave.y;
      this.buffer[at + 2] = (now - wave.start) / 1000; this.buffer[at + 3] = wave.seed;
    });
    return this.buffer.subarray(0, this.waves.length * 4);
  }

  clear() { this.waves.length = 0; this.end = 0; }
}
