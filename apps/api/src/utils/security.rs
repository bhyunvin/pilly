use aes_gcm::{
    Aes256Gcm, Nonce,
    aead::{Aead, KeyInit},
};
use rand::RngCore;

/// AES-256-GCM 알고리즘으로 텍스트를 암호화합니다.
/// 기존 Node.js `IV:AuthTag:EncryptedText` (모두 hex 인코딩) 포맷과 100% 호환됩니다.
pub fn encrypt(text: &str, key_hex: &str) -> String {
    if text.is_empty() || key_hex.is_empty() {
        return text.to_string();
    }

    let Ok(key_bytes) = hex::decode(key_hex) else {
        tracing::error!("ENCRYPTION_KEY hex 디코딩 실패");
        return text.to_string();
    };
    if key_bytes.len() != 32 {
        tracing::error!("ENCRYPTION_KEY는 32바이트(64 hex chars)여야 합니다.");
        return text.to_string();
    }

    let Ok(cipher) = Aes256Gcm::new_from_slice(&key_bytes) else {
        return text.to_string();
    };

    let mut iv = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut iv);
    let nonce = Nonce::from_slice(&iv);

    match cipher.encrypt(nonce, text.as_bytes()) {
        Ok(mut ciphertext_with_tag) => {
            // aes-gcm은 암호문 뒤에 16바이트 AuthTag를 붙여서 반환함
            let tag_split_idx = ciphertext_with_tag.len().saturating_sub(16);
            let auth_tag = ciphertext_with_tag.split_off(tag_split_idx);
            format!(
                "{}:{}:{}",
                hex::encode(iv),
                hex::encode(auth_tag),
                hex::encode(ciphertext_with_tag)
            )
        }
        Err(err) => {
            tracing::error!("암호화 실패: {:?}", err);
            text.to_string()
        }
    }
}

/// AES-256-GCM 암호화된 문자열(`IV:AuthTag:EncryptedText`)을 복호화합니다.
pub fn decrypt(text: &str, key_hex: &str) -> String {
    if text.is_empty() || key_hex.is_empty() {
        return text.to_string();
    }

    let parts: Vec<&str> = text.split(':').collect();
    if parts.len() != 3 {
        return text.to_string();
    }

    let (Ok(iv), Ok(auth_tag), Ok(ciphertext), Ok(key_bytes)) = (
        hex::decode(parts[0]),
        hex::decode(parts[1]),
        hex::decode(parts[2]),
        hex::decode(key_hex),
    ) else {
        return text.to_string();
    };

    if iv.len() != 12 || key_bytes.len() != 32 {
        return text.to_string();
    }

    let Ok(cipher) = Aes256Gcm::new_from_slice(&key_bytes) else {
        return text.to_string();
    };

    let nonce = Nonce::from_slice(&iv);
    let mut payload = ciphertext;
    payload.extend_from_slice(&auth_tag);

    match cipher.decrypt(nonce, payload.as_ref()) {
        Ok(plaintext) => String::from_utf8(plaintext).unwrap_or_else(|_| text.to_string()),
        Err(err) => {
            tracing::error!("복호화 실패: {:?}", err);
            text.to_string()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const TEST_KEY: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    const WRONG_KEY: &str = "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";

    #[test]
    fn test_encrypt_decrypt_roundtrip_korean_and_ascii() {
        let plain = "타이레놀정500mg 복용법 문의: 하루 3회 식후 30분!";
        let encrypted = encrypt(plain, TEST_KEY);
        assert_ne!(encrypted, plain);

        // Node.js 호환 포맷: IV(24 hex):AuthTag(32 hex):Ciphertext(hex)
        let parts: Vec<&str> = encrypted.split(':').collect();
        assert_eq!(parts.len(), 3);
        assert_eq!(parts[0].len(), 24);
        assert_eq!(parts[1].len(), 32);

        let decrypted = decrypt(&encrypted, TEST_KEY);
        assert_eq!(decrypted, plain);
    }

    #[test]
    fn test_decrypt_fails_with_wrong_key_or_tampered_ciphertext() {
        let plain = "민감한 건강 상담 내역";
        let encrypted = encrypt(plain, TEST_KEY);

        // 잘못된 키로 복호화 시 평문이 복원되지 않음
        let wrong_decrypted = decrypt(&encrypted, WRONG_KEY);
        assert_ne!(wrong_decrypted, plain);
        assert_eq!(wrong_decrypted, encrypted);

        // 변조된 암호문 복호화 시 평문이 복원되지 않음
        let mut parts: Vec<String> = encrypted.split(':').map(String::from).collect();
        parts[2] = "0000".to_string();
        let tampered = parts.join(":");
        assert_eq!(decrypt(&tampered, TEST_KEY), tampered);
    }
}
