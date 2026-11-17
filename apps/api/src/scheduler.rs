use std::time::Duration;

use sqlx::PgPool;

/// 유예 기간(30일)이 지난 탈퇴 요청 계정을 주기적으로 물리 삭제(Hard Delete)하는 백그라운드 스케줄러
pub fn spawn_cleanup_scheduler(pool: PgPool) {
    tokio::spawn(async move {
        // 서버 기동 직후 즉시 1회 실행 후 24시간마다 반복
        let mut interval = tokio::time::interval(Duration::from_secs(24 * 60 * 60));

        loop {
            interval.tick().await;
            tracing::info!("--- 30일 유예 경과 탈퇴 계정 정리 스케줄러 시작 ---");

            match sqlx::query_scalar::<_, String>(
                "DELETE FROM user_profiles \
                 WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL '30 days' \
                 RETURNING user_id",
            )
            .fetch_all(&pool)
            .await
            {
                Ok(deleted_ids) => {
                    if deleted_ids.is_empty() {
                        tracing::info!("삭제 대상 만료 계정이 없습니다.");
                    } else {
                        tracing::info!("만료된 탈퇴 계정 {}건 물리 삭제 완료", deleted_ids.len());
                    }
                }
                Err(err) => {
                    tracing::error!("탈퇴 계정 정리 스케줄러 오류: {:?}", err);
                }
            }
        }
    });
}
