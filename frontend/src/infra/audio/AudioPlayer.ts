/**
 * 音频播放器 (Web Audio API + HTMLAudioElement) .
 *
 * 改进点 (相对最早期的实现) :
 * - 用 GainNode 做淡入, 告别 setInterval 的精度问题与 race
 * - 暴露 Solid signal 让 UI 直接订阅 `currentTime` / `duration` / `playing`
 */

import { createSignal } from "solid-js";

export class AudioPlayer {
    readonly audio = new Audio();
    private ctx: AudioContext | null = null;
    private source: MediaElementAudioSourceNode | null = null;
    private gainNode: GainNode | null = null;

    private _currentTime = createSignal<number>(0);
    private _duration = createSignal<number>(0);
    private _playing = createSignal<boolean>(false);
    private _volume = createSignal<number>(1);

    readonly currentTime = this._currentTime[0];
    readonly setCurrentTime = this._currentTime[1];
    readonly duration = this._duration[0];
    readonly setDuration = this._duration[1];
    readonly playing = this._playing[0];
    readonly volume = this._volume[0];

    onEnded: (() => void) | null = null;
    onError: ((err: unknown) => void) | null = null;

    constructor() {
        this.audio.crossOrigin = "anonymous";
        this.audio.preload = "auto";
        this.audio.addEventListener("timeupdate", () => this.setCurrentTime(this.audio.currentTime));
        this.audio.addEventListener("durationchange", () => this.setDuration(this.audio.duration || 0));
        this.audio.addEventListener("play", () => this._playing[1](true));
        this.audio.addEventListener("pause", () => this._playing[1](false));
        this.audio.addEventListener("ended", () => this.onEnded?.());
        this.audio.addEventListener("error", (e) => this.onError?.(e));
    }

    private ensureGraph(): void {
        if (this.ctx) return;
        try {
            const Ctor =
                window.AudioContext ||
                (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
            this.ctx = new Ctor();
            this.source = this.ctx.createMediaElementSource(this.audio);
            this.gainNode = this.ctx.createGain();
            this.gainNode.gain.value = 1;
            this.source.connect(this.gainNode);
            this.gainNode.connect(this.ctx.destination);
        } catch (err) {
            console.warn("[AudioPlayer] WebAudio 初始化失败，降级到 audio.volume：", err);
        }
    }

    async load(src: string): Promise<void> {
        this.ensureGraph();
        this.audio.src = src;
        try {
            await this.audio.play();
        } catch (err) {
            console.warn("[AudioPlayer] 播放失败，可能未与页面交互：", err);
            throw err;
        }
        this.fadeIn();
    }

    pause(): void {
        this.audio.pause();
    }

    play(): void {
        void this.audio.play();
    }

    seek(sec: number): void {
        this.audio.currentTime = sec;
    }

    stop(): void {
        this.audio.pause();
        this.audio.removeAttribute("src");
        this.audio.load();
        this.setCurrentTime(0);
    }

    setVolume(v: number): void {
        const clamped = Math.max(0, Math.min(1, v));
        this._volume[1](clamped);
        if (this.gainNode) {
            this.gainNode.gain.value = clamped;
        } else {
            this.audio.volume = clamped;
        }
    }

    private fadeIn(durationMs = 1500): void {
        const target = this._volume[0]();
        if (this.gainNode && this.ctx) {
            const now = this.ctx.currentTime;
            this.gainNode.gain.cancelScheduledValues(now);
            this.gainNode.gain.setValueAtTime(0, now);
            this.gainNode.gain.linearRampToValueAtTime(target, now + durationMs / 1000);
        } else {
            this.audio.volume = 0;
            const start = performance.now();
            const step = (n: number) => {
                const t = Math.min(1, (n - start) / durationMs);
                this.audio.volume = t * target;
                if (t < 1) requestAnimationFrame(step);
            };
            requestAnimationFrame(step);
        }
    }
}

/** 全局共享单例 (同一页面内只允许一个音频会话) . */
export const audioPlayer = new AudioPlayer();
