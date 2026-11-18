use std::time::Duration;

use crate::mq::{EventProducer, PillyEvent};

/// 24시간 주기로 탈퇴 계정 정리(`CleanupWithdrawnUsers`) 및 의약품 동기화(`SyncPills`) 이벤트를
/// Apache Iggy 스트림으로 발행하는 백그라운드 스케줄러
pub fn spawn_cleanup_scheduler(producer: EventProducer) {
    tokio::spawn(async move {
        // 서버 기동 직후 즉시 1회 발행 후 24시간마다 반복
        let mut interval = tokio::time::interval(Duration::from_secs(24 * 60 * 60));

        loop {
            interval.tick().await;
            tracing::info!(
                "--- 24시간 주기 배치 이벤트 발행 (CleanupWithdrawnUsers, SyncPills) ---"
            );
            producer.publish(PillyEvent::CleanupWithdrawnUsers).await;
            producer
                .publish(PillyEvent::SyncPills {
                    triggered_by: "scheduler".to_string(),
                })
                .await;
        }
    });
}
