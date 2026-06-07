use std::{sync::Arc, time::Duration};

use tokio::{sync::Semaphore, task::JoinSet};

use crate::{error::AppError, models::PortScanResult, probes::tcping, validation};

pub async fn scan_ports(
    address: String,
    ports: Vec<u16>,
    timeout: Duration,
    concurrency: usize,
    block_private_targets: bool,
) -> Result<Vec<PortScanResult>, AppError> {
    let semaphore = Arc::new(Semaphore::new(concurrency));
    let mut tasks = JoinSet::new();

    for port in ports {
        let permit_source = Arc::clone(&semaphore);
        let address = address.clone();

        tasks.spawn(async move {
            let _permit = permit_source
                .acquire_owned()
                .await
                .map_err(|_| AppError::ProbeFailed)?;
            let resolved =
                validation::resolve_target(&address, port, block_private_targets).await?;
            let probe = tcping::probe_socket_addrs(&resolved, timeout).await;

            Ok::<PortScanResult, AppError>(PortScanResult {
                port,
                open: probe.reachable,
                latency_ms: probe.latency_ms,
            })
        });
    }

    let mut results = Vec::new();
    while let Some(task_result) = tasks.join_next().await {
        let result = task_result.map_err(|_| AppError::ProbeFailed)??;
        results.push(result);
    }

    results.sort_by_key(|result| result.port);
    Ok(results)
}
