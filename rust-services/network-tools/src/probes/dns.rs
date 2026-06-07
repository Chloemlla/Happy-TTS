use std::time::Duration;

use hickory_resolver::{
    config::{ResolverConfig, ResolverOpts},
    proto::rr::RecordType,
    TokioAsyncResolver,
};
use tokio::time;

use crate::{error::AppError, models::DnsRecord};

pub async fn resolve_records(
    address: &str,
    record_types: &[String],
    timeout: Duration,
) -> Result<Vec<DnsRecord>, AppError> {
    let resolver = TokioAsyncResolver::tokio(ResolverConfig::default(), ResolverOpts::default());
    let mut records = Vec::new();

    for record_type in record_types {
        let mut values = match record_type.as_str() {
            "A" => lookup_ip_records(&resolver, address, true, timeout).await?,
            "AAAA" => lookup_ip_records(&resolver, address, false, timeout).await?,
            "CNAME" => lookup_generic_records(&resolver, address, RecordType::CNAME, timeout).await?,
            "MX" => lookup_mx_records(&resolver, address, timeout).await?,
            "TXT" => lookup_txt_records(&resolver, address, timeout).await?,
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

async fn lookup_ip_records(
    resolver: &TokioAsyncResolver,
    address: &str,
    ipv4: bool,
    timeout: Duration,
) -> Result<Vec<String>, AppError> {
    let lookup = time::timeout(timeout, resolver.lookup_ip(address)).await;
    let Ok(Ok(response)) = lookup else {
        return Ok(Vec::new());
    };

    Ok(response
        .iter()
        .filter(|ip| ip.is_ipv4() == ipv4)
        .map(|ip| ip.to_string())
        .collect())
}

async fn lookup_generic_records(
    resolver: &TokioAsyncResolver,
    address: &str,
    record_type: RecordType,
    timeout: Duration,
) -> Result<Vec<String>, AppError> {
    let lookup = time::timeout(timeout, resolver.lookup(address, record_type)).await;
    let Ok(Ok(response)) = lookup else {
        return Ok(Vec::new());
    };

    Ok(response.iter().map(|record| record.to_string()).collect())
}

async fn lookup_mx_records(
    resolver: &TokioAsyncResolver,
    address: &str,
    timeout: Duration,
) -> Result<Vec<String>, AppError> {
    let lookup = time::timeout(timeout, resolver.mx_lookup(address)).await;
    let Ok(Ok(response)) = lookup else {
        return Ok(Vec::new());
    };

    Ok(response
        .iter()
        .map(|record| format!("{} {}", record.preference(), record.exchange()))
        .collect())
}

async fn lookup_txt_records(
    resolver: &TokioAsyncResolver,
    address: &str,
    timeout: Duration,
) -> Result<Vec<String>, AppError> {
    let lookup = time::timeout(timeout, resolver.txt_lookup(address)).await;
    let Ok(Ok(response)) = lookup else {
        return Ok(Vec::new());
    };

    Ok(response
        .iter()
        .flat_map(|record| {
            record
                .txt_data()
                .iter()
                .map(|part| String::from_utf8_lossy(part).to_string())
                .collect::<Vec<_>>()
        })
        .collect())
}
