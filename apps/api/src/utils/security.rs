use aes_gcm::{
    Aes256Gcm, Nonce,
    aead::{Aead, KeyInit},
};
use rand::RngCore;

use crate::error::AppError;

/// 복호화에 실패한 레코드를 UI/API에 안전하게 노출하기 위한 대체 안내 문구
pub const DECRYPT_FAILURE_PLACEHOLDER: &str = "[복호화할 수 없는 메시지입니다]";

const ENCRYPTION_KEY_LEN: usize = 32;
const GCM_IV_LEN: usize = 12;
const GCM_AUTH_TAG_LEN: usize = 16;

/// 64자리 Hex 인코딩된 AES-256-GCM 암호화 키(32바이트)를 검증하고 바이트 배열로 반환합니다.
pub fn validate_encryption_key(key_hex: &str) -> Result<[u8; ENCRYPTION_KEY_LEN], AppError> {
    if key_hex.is_empty() {
        return Err(AppError::Internal(anyhow::anyhow!(
            "ENCRYPTION_KEY 환경변수가 설정되지 않았습니다."
        )));
    }

    let key_bytes = hex::decode(key_hex).map_err(|err| {
        AppError::Internal(anyhow::anyhow!("ENCRYPTION_KEY hex 디코딩 실패: {err}"))
    })?;

    key_bytes.try_into().map_err(|_| {
        AppError::Internal(anyhow::anyhow!(
            "ENCRYPTION_KEY는 32바이트(64 hex chars)여야 합니다."
        ))
    })
}

/// AES-256-GCM 알고리즘으로 텍스트를 암호화합니다. (Fail-Closed: 키 오류·암호화 실패 시 Err 반환)
/// 기존 Node.js `IV:AuthTag:EncryptedText` (모두 hex 인코딩) 포맷과 100% 호환됩니다.
pub fn encrypt(text: &str, key_hex: &str) -> Result<String, AppError> {
    let key_bytes = validate_encryption_key(key_hex)?;
    if text.is_empty() {
        return Ok(String::new());
    }

    let cipher = Aes256Gcm::new_from_slice(&key_bytes)
        .map_err(|err| AppError::Internal(anyhow::anyhow!("암호화 키 초기화 실패: {err}")))?;

    let mut iv = [0u8; GCM_IV_LEN];
    rand::thread_rng().fill_bytes(&mut iv);
    let nonce = Nonce::from(iv);

    let mut ciphertext_with_tag = cipher
        .encrypt(&nonce, text.as_bytes())
        .map_err(|err| AppError::Internal(anyhow::anyhow!("AES-256-GCM 암호화 실패: {err}")))?;

    // aes-gcm은 암호문 뒤에 16바이트 AuthTag를 붙여서 반환함
    let tag_split_idx = ciphertext_with_tag.len().saturating_sub(GCM_AUTH_TAG_LEN);
    let auth_tag = ciphertext_with_tag.split_off(tag_split_idx);

    Ok(format!(
        "{}:{}:{}",
        hex::encode(iv),
        hex::encode(auth_tag),
        hex::encode(ciphertext_with_tag)
    ))
}

fn try_decrypt(text: &str, key_hex: &str) -> Result<String, String> {
    let key_bytes = validate_encryption_key(key_hex)
        .map_err(|_| "ENCRYPTION_KEY가 유효하지 않습니다.".to_string())?;

    let parts: Vec<&str> = text.split(':').collect();
    if parts.len() != 3 {
        return Err("암호문 포맷이 올바르지 않습니다.".to_string());
    }

    let (iv, auth_tag, ciphertext) = (
        hex::decode(parts[0]).map_err(|_| "IV hex 디코딩에 실패했습니다.".to_string())?,
        hex::decode(parts[1]).map_err(|_| "AuthTag hex 디코딩에 실패했습니다.".to_string())?,
        hex::decode(parts[2]).map_err(|_| "Ciphertext hex 디코딩에 실패했습니다.".to_string())?,
    );

    let iv_arr: [u8; GCM_IV_LEN] = iv
        .try_into()
        .map_err(|_| format!("IV 길이가 {GCM_IV_LEN}바이트가 아닙니다."))?;

    let cipher = Aes256Gcm::new_from_slice(&key_bytes)
        .map_err(|_| "AES-256-GCM 키 초기화 오류".to_string())?;

    let nonce = Nonce::from(iv_arr);
    let mut payload = ciphertext;
    payload.extend_from_slice(&auth_tag);

    let plaintext = cipher
        .decrypt(&nonce, payload.as_ref())
        .map_err(|err| format!("AES-256-GCM 복호화 오류: {err:?}"))?;

    String::from_utf8(plaintext).map_err(|err| format!("UTF-8 디코딩 오류: {err:?}"))
}

/// AES-256-GCM 암호화된 문자열(`IV:AuthTag:EncryptedText`)을 복호화합니다.
/// 손상된 레코드 1건으로 목록 조회가 실패하지 않도록 실패 시 에러 로그만 기록하고 대체 안내 문구를 반환합니다.
pub fn decrypt(text: &str, key_hex: &str) -> String {
    if text.is_empty() {
        return String::new();
    }

    match try_decrypt(text, key_hex) {
        Ok(plaintext) => plaintext,
        Err(reason) => {
            tracing::error!("복호화 실패: {reason}");
            DECRYPT_FAILURE_PLACEHOLDER.to_string()
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
        let encrypted = encrypt(plain, TEST_KEY).expect("유효한 키로 암호화 성공");
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
        let encrypted = encrypt(plain, TEST_KEY).expect("암호화 성공");

        // 잘못된 키로 복호화 시 평문/암호문 노출 대신 안전한 안내 문구 반환
        let wrong_decrypted = decrypt(&encrypted, WRONG_KEY);
        assert_ne!(wrong_decrypted, plain);
        assert_ne!(wrong_decrypted, encrypted);
        assert_eq!(wrong_decrypted, DECRYPT_FAILURE_PLACEHOLDER);

        // 변조된 암호문 복호화 시 안전한 안내 문구 반환
        let mut parts: Vec<String> = encrypted.split(':').map(String::from).collect();
        parts[2] = "0000".to_string();
        let tampered = parts.join(":");
        assert_eq!(decrypt(&tampered, TEST_KEY), DECRYPT_FAILURE_PLACEHOLDER);
    }

    #[test]
    fn test_encrypt_fail_closed_on_invalid_keys() {
        assert!(validate_encryption_key("").is_err());
        assert!(validate_encryption_key("not-hex").is_err());
        assert!(validate_encryption_key("012345").is_err());

        assert!(encrypt("민감한 메시지", "").is_err());
        assert!(encrypt("민감한 메시지", "zzzz").is_err());
        assert!(encrypt("민감한 메시지", "0123456789abcdef").is_err());
        assert!(encrypt("", "").is_err());
    }
}
