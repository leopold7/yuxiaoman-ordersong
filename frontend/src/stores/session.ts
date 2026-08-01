import { createSignal } from "solid-js";
import type { LoginState, UserBrief } from "@/types";
import { loadJSON, saveJSON, removeKey } from "@/infra/storage/kv";
import { decryptText, encryptText } from "@/infra/storage/crypto";
import { mirrorToServer } from "@/infra/storage/shared";

const K_USER_BLACK = "v3.userBlackList";
const K_SONG_BLACK = "v3.songBlackList";
const K_USER_HISTORY = "v3.userHistory";
const K_SONG_HISTORY = "v3.songHistory";

const K_WY_COOKIE = "v3.wy.cookie";
const K_QQ_COOKIE = "v3.qq.cookie";
const K_BILI_COOKIE = "v3.bili.cookie";
const K_BILI_USER = "v3.bili.user"; // { mid, uname, avatar } JSON

// 抓取 Cookie 时的时间戳 (毫秒), 用于展示「已登录 N 天」。旧版无此键则不显示。
const K_WY_LOGIN_AT = "v3.wy.loginAt";
const K_QQ_LOGIN_AT = "v3.qq.loginAt";

const [adminUid, setAdminUid] = createSignal<string | number>(0);

const [login, setLogin] = createSignal<LoginState>({
    netease: { logged: false },
    qq: { logged: false }
});

const hasPersistedLogin =
    typeof localStorage !== "undefined" &&
    (!!localStorage.getItem(K_WY_COOKIE)
        || !!localStorage.getItem(K_QQ_COOKIE)
        || !!localStorage.getItem(K_BILI_COOKIE));
const [restoring, setRestoring] = createSignal<boolean>(hasPersistedLogin);

/** B 站登录用户信息 */
export interface BiliUser { mid?: number; uname?: string; avatar?: string }
const [biliUser, setBiliUser] = createSignal<BiliUser | null>(loadJSON<BiliUser | null>(K_BILI_USER, null));
export function persistBiliUser(u: BiliUser | null) {
    setBiliUser(u);
    if (u) saveJSON(K_BILI_USER, u);
    else removeKey(K_BILI_USER);
}

const [userBlackList, setUserBlackList] = createSignal<UserBrief[]>(loadJSON(K_USER_BLACK, []));
const [songBlackList, setSongBlackList] = createSignal<{ sid: string | number; sname: string }[]>(loadJSON(K_SONG_BLACK, []));
const [userHistory, setUserHistory] = createSignal<UserBrief[]>(loadJSON(K_USER_HISTORY, []));
const [songHistory, setSongHistory] = createSignal<{ sid: string | number; sname: string }[]>(loadJSON(K_SONG_HISTORY, []));

export async function saveWyCookie(cookie: string) {
    if (!cookie) {
        removeKey(K_WY_COOKIE);
        removeKey(K_WY_LOGIN_AT);
        return;
    }
    const enc = await encryptText(cookie);
    const ts = String(Date.now());
    localStorage.setItem(K_WY_COOKIE, enc);
    localStorage.setItem(K_WY_LOGIN_AT, ts);
    mirrorToServer(K_WY_COOKIE, enc);
    mirrorToServer(K_WY_LOGIN_AT, ts);
}

export async function loadWyCookie(): Promise<string> {
    const raw = localStorage.getItem(K_WY_COOKIE);
    if (!raw) return "";
    return decryptText(raw);
}

/** 抓取网易云 Cookie 的时间戳 (毫秒), 无则返回 null */
export function loadWyLoginAt(): number | null {
    const raw = localStorage.getItem(K_WY_LOGIN_AT);
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : null;
}

export async function saveQqCookie(cookie: string) {
    if (!cookie) {
        removeKey(K_QQ_COOKIE);
        removeKey(K_QQ_LOGIN_AT);
        return;
    }
    const enc = await encryptText(cookie);
    const ts = String(Date.now());
    localStorage.setItem(K_QQ_COOKIE, enc);
    localStorage.setItem(K_QQ_LOGIN_AT, ts);
    mirrorToServer(K_QQ_COOKIE, enc);
    mirrorToServer(K_QQ_LOGIN_AT, ts);
}

export async function loadQqCookie(): Promise<string> {
    const raw = localStorage.getItem(K_QQ_COOKIE);
    if (!raw) return "";
    return decryptText(raw);
}

/** 抓取 QQ 音乐 Cookie 的时间戳 (毫秒), 无则返回 null */
export function loadQqLoginAt(): number | null {
    const raw = localStorage.getItem(K_QQ_LOGIN_AT);
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : null;
}

export async function saveBiliCookie(cookie: string) {
    if (!cookie) {
        removeKey(K_BILI_COOKIE);
        return;
    }
    const enc = await encryptText(cookie);
    localStorage.setItem(K_BILI_COOKIE, enc);
    mirrorToServer(K_BILI_COOKIE, enc);
}

export async function loadBiliCookie(): Promise<string> {
    const raw = localStorage.getItem(K_BILI_COOKIE);
    if (!raw) return "";
    return decryptText(raw);
}

function persist<T>(setter: (v: T) => void, key: string) {
    return (next: T) => {
        setter(next);
        saveJSON(key, next);
    };
}

export const session = {
    adminUid, setAdminUid,
    login, setLogin,
    restoring, setRestoring,
    biliUser, setBiliUser: persistBiliUser,

    userBlackList,
    addUserBlack(u: UserBrief) {
        setUserBlackList((arr) => {
            if (arr.find((x) => x.uid === u.uid)) return arr;
            const next = [...arr, u].slice(-200);
            saveJSON(K_USER_BLACK, next);
            return next;
        });
    },
    removeUserBlack(uid: string | number) {
        setUserBlackList((arr) => {
            const next = arr.filter((x) => x.uid !== uid);
            saveJSON(K_USER_BLACK, next);
            return next;
        });
    },

    songBlackList,
    addSongBlack(s: { sid: string | number; sname: string }) {
        setSongBlackList((arr) => {
            if (arr.find((x) => x.sid === s.sid)) return arr;
            const next = [...arr, s].slice(-500);
            saveJSON(K_SONG_BLACK, next);
            return next;
        });
    },
    removeSongBlack(sid: string | number) {
        setSongBlackList((arr) => {
            const next = arr.filter((x) => x.sid !== sid);
            saveJSON(K_SONG_BLACK, next);
            return next;
        });
    },

    userHistory,
    addUserHistory(u: UserBrief) {
        setUserHistory((arr) => {
            if (arr.find((x) => x.uid === u.uid)) return arr;
            const next = [...arr, u].slice(-200);
            saveJSON(K_USER_HISTORY, next);
            return next;
        });
    },

    songHistory,
    addSongHistory(s: { sid: string | number; sname: string }) {
        setSongHistory((arr) => {
            if (arr.find((x) => x.sid === s.sid)) return arr;
            const next = [...arr, s].slice(-500);
            saveJSON(K_SONG_HISTORY, next);
            return next;
        });
    },

    setUserBlackList: persist(setUserBlackList, K_USER_BLACK),
    setSongBlackList: persist(setSongBlackList, K_SONG_BLACK),
    setUserHistory: persist(setUserHistory, K_USER_HISTORY),
    setSongHistory: persist(setSongHistory, K_SONG_HISTORY)
};

export function reloadSessionFromStorage() {
    setUserBlackList(loadJSON(K_USER_BLACK, []));
    setSongBlackList(loadJSON(K_SONG_BLACK, []));
    setUserHistory(loadJSON(K_USER_HISTORY, []));
    setSongHistory(loadJSON(K_SONG_HISTORY, []));
    setBiliUser(loadJSON<BiliUser | null>(K_BILI_USER, null));
}
