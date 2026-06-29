//! 网易云 weapi 加密协议 (参考 NeteaseCloudMusicApi crypto.js) (https://www.npmjs.com/package/NeteaseCloudMusicApi)
//!
//! 流程:
//! 1. 生成随机 16 字节 secret (ASCII 字符集)
//! 2. AES-CBC PKCS7 第一次加密 (明文 = params, key = 固定 0CoJUm6Qyw8W8jud)
//! 3. AES-CBC PKCS7 第二次加密 (明文 = 第一步 base64, key = secret)
//! 4. secret 反转后, 做"裸 RSA" (m^e mod n, 公钥见下方常量) → hex → encSecKey
//! 5. POST 到 https://music.163.com/weapi/<path>

use aes::Aes128;
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use cbc::{
    cipher::{block_padding::Pkcs7, BlockEncryptMut, KeyIvInit},
    Encryptor,
};
use rand::Rng;
use rsa::BigUint;

type Aes128CbcEnc = Encryptor<Aes128>;

const PRESET_KEY: &[u8] = b"0CoJUm6Qyw8W8jud";
const IV: &[u8] = b"0102030405060708";
const PUB_KEY_MOD: &str = "00e0b509f6259df8642dbc35662901477df22677ec152b5ff68ace615bb7b725152b3ab17a876aea8a5aa76d2e417629ec4ee341f56135fccf695280104e0312ecbda92557c93870114af6c9d05c4f7f0c3685b7a46bee255932575cce10b424d813cfe4875d3e82047b97ddef52741d546b8e289dc6935b3ece0462db0a22b8e7";
const PUB_KEY_E: u64 = 0x10001;

fn aes_encrypt(plain: &[u8], key: &[u8]) -> Vec<u8> {
    let enc = Aes128CbcEnc::new(key.into(), IV.into());
    let mut buf = vec![0u8; plain.len() + 16];
    let n = enc
        .encrypt_padded_b2b_mut::<Pkcs7>(plain, &mut buf)
        .expect("aes encrypt")
        .len();
    buf.truncate(n);
    buf
}

fn rsa_no_pad(data: &[u8]) -> String {
    let n = BigUint::parse_bytes(PUB_KEY_MOD.as_bytes(), 16).expect("rsa n");
    let e = BigUint::from(PUB_KEY_E);

    // 网易云的 RSA: 把 data 右对齐 big-endian 补 0 到 128 字节, 无 PKCS padding.
    let mut buf = vec![0u8; 128 - data.len()];
    buf.extend_from_slice(data);

    let m = BigUint::from_bytes_be(&buf);
    let c = m.modpow(&e, &n);
    let c_bytes = c.to_bytes_be();
    let mut padded = if c_bytes.len() < 128 {
        let mut p = vec![0u8; 128 - c_bytes.len()];
        p.extend_from_slice(&c_bytes);
        p
    } else {
        c_bytes
    };
    if padded.len() > 128 {
        padded = padded.split_off(padded.len() - 128);
    }
    hex::encode(padded)
}

fn random_secret() -> Vec<u8> {
    let mut rng = rand::thread_rng();
    (0..16)
        .map(|_| {
            let n = rng.gen_range(0..62u8);
            match n {
                0..=9 => b'0' + n,
                10..=35 => b'a' + (n - 10),
                _ => b'A' + (n - 36),
            }
        })
        .collect()
}

/// 把 params 字符串加密成 weapi 表单两个字段: (params, encSecKey)
pub fn encrypt(params: &str) -> (String, String) {
    let secret = random_secret();

    let first = aes_encrypt(params.as_bytes(), PRESET_KEY);
    let first_b64 = B64.encode(&first);

    let second = aes_encrypt(first_b64.as_bytes(), &secret);
    let params_out = B64.encode(&second);

    let secret_reversed: Vec<u8> = secret.iter().rev().copied().collect();
    let enc_sec_key = rsa_no_pad(&secret_reversed);

    (params_out, enc_sec_key)
}
