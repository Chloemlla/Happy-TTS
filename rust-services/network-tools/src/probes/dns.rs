use std::time::Duration;

use hickory_resolver::{
    config::{ResolverConfig, ResolverOpts, CLOUDFLARE},
    net::runtime::TokioRuntimeProvider,
    proto::rr::{RData, RecordType},
    TokioResolver,
};
use tokio::{net::lookup_host, time};

use crate::{error::AppError, models::DnsRecord};

pub async fn resolve_records(
    address: &str,
    record_types: &[String],
    timeout: Duration,
) -> Result<Vec<DnsRecord>, AppError> {
    let mut resolver: Option<TokioResolver> = None;
    let mut records = Vec::new();

    for record_type in record_types {
        let mut values = match record_type.as_str() {
            "A" => lookup_system_ip_records(address, true, timeout).await?,
            "AAAA" => lookup_system_ip_records(address, false, timeout).await?,
            "CNAME" => {
                let resolver = resolver.get_or_insert_with(|| build_hickory_resolver(timeout));
                lookup_generic_records(resolver, address, RecordType::CNAME, timeout).await?
            }
            "MX" => {
                let resolver = resolver.get_or_insert_with(|| build_hickory_resolver(timeout));
                lookup_mx_records(resolver, address, timeout).await?
            }
            "TXT" => {
                let resolver = resolver.get_or_insert_with(|| build_hickory_resolver(timeout));
                lookup_txt_records(resolver, address, timeout).await?
            }
            _ => Vec::new(),
        };

        values.sort();
        values.dedup();
        for value in values {
            records.push(DnsRecord {
                record_type: record_type.clone(),
                value,
            });
        }
    }

    Ok(records)
}

fn build_hickory_resolver(timeout: Duration) -> TokioResolver {
    let mut opts = ResolverOpts::default();
    opts.timeout = timeout;
    opts.attempts = 1;
    opts.num_concurrent_reqs = 1;
    TokioResolver::builder_with_config(
        ResolverConfig::udp_and_tcp(&CLOUDFLARE),
        TokioRuntimeProvider::default(),
    )
    .with_options(opts)
    .build()
    .expect("failed to build hickory resolver")
}

async fn lookup_system_ip_records(
    address: &str,
    ipv4: bool,
    timeout: Duration,
) -> Result<Vec<String>, AppError> {
    let lookup = time::timeout(timeout, lookup_host((address, 0))).await;
    let Ok(Ok(response)) = lookup else {
        return Ok(Vec::new());
    };

    Ok(response
        .map(|socket_addr| socket_addr.ip())
        .filter(|ip| ip.is_ipv4() == ipv4)
        .map(|ip| ip.to_string())
        .collect())
}

async fn lookup_generic_records(
    resolver: &TokioResolver,
    address: &str,
    record_type: RecordType,
    timeout: Duration,
) -> Result<Vec<String>, AppError> {
    let lookup = time::timeout(timeout, resolver.lookup(address, record_type)).await;
    let Ok(Ok(response)) = lookup else {
        return Ok(Vec::new());
    };

    Ok(response
        .answers()
        .iter()
        .map(|record| record.data.to_string())
        .collect())
}

async fn lookup_mx_records(
    resolver: &TokioResolver,
    address: &str,
    timeout: Duration,
) -> Result<Vec<String>, AppError> {
    let lookup = time::timeout(timeout, resolver.mx_lookup(address)).await;
    let Ok(Ok(response)) = lookup else {
        return Ok(Vec::new());
    };

    Ok(response
        .answers()
        .iter()
        .filter_map(|record| match &record.data {
            RData::MX(mx) => Some(format!("{} {}", mx.preference, mx.exchange)),
            _ => None,
        })
        .collect())
}

async fn lookup_txt_records(
    resolver: &TokioResolver,
    address: &str,
    timeout: Duration,
) -> Result<Vec<String>, AppError> {
    let lookup = time::timeout(timeout, resolver.txt_lookup(address)).await;
    let Ok(Ok(response)) = lookup else {
        return Ok(Vec::new());
    };

    Ok(response
        .answers()
        .iter()
        .filter_map(|record| match &record.data {
            RData::TXT(txt) => Some(
                txt.txt_data
                    .iter()
                    .map(|part| String::from_utf8_lossy(part).to_string())
                    .collect::<Vec<_>>(),
            ),
            _ => None,
        })
        .flatten()
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn system_lookup_handles_ip_literals_without_hickory() {
        let values = lookup_system_ip_records("1.1.1.1", true, Duration::from_millis(100))
            .await
            .unwrap();

        assert_eq!(values, vec!["1.1.1.1"]);
    }
}
