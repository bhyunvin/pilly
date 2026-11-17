use lettre::{
    AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor,
    message::header::ContentType,
    transport::smtp::authentication::Credentials,
};

use crate::config::Config;

/// 관리자가 JIT(Just-In-Time) 권한으로 사용자 채팅 로그를 최초 열람했을 때
/// 해당 사용자에게 개인정보 열람 고지 이메일을 비동기로 발송합니다.
///
/// SMTP 설정(`SMTP_HOST`)이 비어 있는 경우 경고 로그만 남기고 정상 종료합니다.
pub async fn send_jit_access_notification(
    config: &Config,
    to_email: &str,
    session_id: i32,
) -> Result<(), String> {
    if config.smtp_host.trim().is_empty() {
        tracing::info!(
            "SMTP_HOST가 설정되지 않아 JIT 열람 알림 이메일 발송을 건너뜁니다. (to={}, session_id={})",
            to_email,
            session_id
        );
        return Ok(());
    }

    let email = Message::builder()
        .from(
            config
                .smtp_from
                .parse()
                .map_err(|e| format!("발신자 이메일 파싱 실패: {e}"))?,
        )
        .to(to_email
            .parse()
            .map_err(|e| format!("수신자 이메일 파싱 실패: {e}"))?)
        .subject("[Pilly] 개인정보(AI 상담 내역) 열람 알림")
        .header(ContentType::TEXT_PLAIN)
        .body(format!(
            "안녕하세요, Pilly입니다.\n\n\
            고객님의 문의 처리 및 서비스 지원을 위해 관리자가 AI 상담 세션(#{session_id}) 내역을 열람하였습니다.\n\
            본 열람 권한은 최초 열람 시점으로부터 24시간 후 자동으로 만료됩니다.\n\n\
            감사합니다."
        ))
        .map_err(|e| format!("이메일 메시지 생성 실패: {e}"))?;

    let mut builder = AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(&config.smtp_host)
        .map_err(|e| format!("SMTP 릴레이 초기화 실패: {e}"))?
        .port(config.smtp_port);

    if !config.smtp_username.is_empty() && !config.smtp_password.is_empty() {
        builder = builder.credentials(Credentials::new(
            config.smtp_username.clone(),
            config.smtp_password.clone(),
        ));
    }

    let mailer = builder.build();
    mailer
        .send(email)
        .await
        .map_err(|e| format!("이메일 발송 실패: {e}"))?;

    tracing::info!(
        "JIT 채팅 열람 알림 이메일 발송 완료 (to={}, session_id={})",
        to_email,
        session_id
    );
    Ok(())
}
