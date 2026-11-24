use std::time::Duration;

use tokio::{
    sync::watch,
    task::JoinHandle,
    time::{Instant, MissedTickBehavior},
};

use crate::mq::{EventProducer, PillyEvent};

const DAILY_INTERVAL: Duration = Duration::from_secs(24 * 60 * 60);
const INITIAL_CLEANUP_DELAY: Duration = Duration::from_secs(60);

/// 24시간 주기로 탈퇴 계정 정리(`CleanupWithdrawnUsers`) 및 의약품 동기화(`SyncPills`) 이벤트를
/// Apache Iggy 스트림으로 발행하는 백그라운드 스케줄러입니다.
/// 서버 기동 직후 공공데이터 API 폭주를 막기 위해 `SyncPills`는 첫 24시간 경과 후부터 실행합니다.
pub fn spawn_cleanup_scheduler(
    producer: EventProducer,
    mut shutdown: watch::Receiver<bool>,
) -> JoinHandle<()> {
    tokio::spawn(async move {
        let now = Instant::now();
        let mut cleanup_interval =
            tokio::time::interval_at(now + INITIAL_CLEANUP_DELAY, DAILY_INTERVAL);
        cleanup_interval.set_missed_tick_behavior(MissedTickBehavior::Delay);

        let mut sync_interval = tokio::time::interval_at(now + DAILY_INTERVAL, DAILY_INTERVAL);
        sync_interval.set_missed_tick_behavior(MissedTickBehavior::Delay);

        loop {
            if *shutdown.borrow() {
                tracing::info!("종료 신호로 인해 백그라운드 스케줄러를 종료합니다.");
                break;
            }

            tokio::select! {
                _ = cleanup_interval.tick() => {
                    tracing::info!("--- 주기적 탈퇴 계정 정리 이벤트 발행 (CleanupWithdrawnUsers) ---");
                    producer.publish(PillyEvent::CleanupWithdrawnUsers).await;
                }
                _ = sync_interval.tick() => {
                    tracing::info!("--- 24시간 주기 의약품 동기화 이벤트 발행 (SyncPills) ---");
                    producer
                        .publish(PillyEvent::SyncPills {
                            triggered_by: "scheduler".to_string(),
                        })
                        .await;
                }
                changed = shutdown.changed() => {
                    if changed.is_err() || *shutdown.borrow() {
                        tracing::info!("종료 신호 수신: 신규 스케줄 이벤트 발행을 중단합니다.");
                        break;
                    }
                }
            }
        }
    })
}
