use std::{
    future::Future,
    fs::OpenOptions,
    path::PathBuf,
    sync::atomic::{AtomicU32, Ordering},
    time::Duration,
};

use memmap2::{MmapMut, MmapOptions};
use serde::Deserialize;
use serde_json::{json, Value};
use thiserror::Error;
use tokio::time::sleep;

const IPC_MAGIC: u32 = 0x4350_4953;
const IPC_VERSION: u32 = 1;
const HEADER_BYTES: usize = 64;
const OFFSET_MAGIC: usize = 0;
const OFFSET_VERSION: usize = 4;
const OFFSET_STATE: usize = 8;
const OFFSET_REQUEST_ID: usize = 12;
const OFFSET_REQUEST_LEN: usize = 16;
const OFFSET_RESPONSE_LEN: usize = 20;
const OFFSET_REQUEST_CAPACITY: usize = 24;
const OFFSET_RESPONSE_CAPACITY: usize = 28;
const STATE_IDLE: u32 = 0;
const STATE_REQUEST_READY: u32 = 1;
const STATE_RESPONSE_READY: u32 = 2;
const STATE_PROCESSING: u32 = 3;
const MIN_CHANNEL_BYTES: usize = 1024 * 1024;

#[derive(Debug, Error)]
pub enum IpcRuntimeError {
    #[error("IPC channel size must be at least {MIN_CHANNEL_BYTES} bytes")]
    ChannelTooSmall,
    #[error("failed to open IPC file: {0}")]
    Io(#[from] std::io::Error),
}

#[derive(Clone, Debug)]
pub struct IpcServerOptions {
    pub service_name: &'static str,
    pub path: PathBuf,
    pub size_bytes: usize,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IpcRequest {
    pub method: String,
    pub path: String,
    pub token: String,
    pub body: Value,
}

pub async fn serve<F, Fut>(options: IpcServerOptions, handler: F) -> Result<(), IpcRuntimeError>
where
    F: Fn(IpcRequest) -> Fut + Send + Sync,
    Fut: Future<Output = Value> + Send,
{
    if options.size_bytes < MIN_CHANNEL_BYTES {
        return Err(IpcRuntimeError::ChannelTooSmall);
    }

    if let Some(parent) = options.path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    let file = OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .open(&options.path)?;
    file.set_len(options.size_bytes as u64)?;

    let mut mmap = unsafe { MmapOptions::new().len(options.size_bytes).map_mut(&file)? };
    initialize_header(&mut mmap, options.size_bytes);

    tracing::info!(
        service = options.service_name,
        path = %options.path.display(),
        size_bytes = options.size_bytes,
        "Rust shared-memory IPC listening"
    );

    let mut idle_spins = 0usize;
    loop {
        let current_state = load_state(&mmap);
        if current_state == STATE_REQUEST_READY
            && compare_exchange_state(&mmap, STATE_REQUEST_READY, STATE_PROCESSING)
        {
            idle_spins = 0;
            let response = process_request(&mmap, &handler).await;
            if let Err(error) = write_response(&mut mmap, response) {
                tracing::error!(
                    service = options.service_name,
                    error = %error,
                    "failed to write IPC response"
                );
                let _ = write_response(
                    &mut mmap,
                    json!({ "success": false, "error": "failed to write IPC response" }),
                );
            }
            continue;
        }

        if current_state != STATE_PROCESSING {
            idle_spins += 1;
        }

        if idle_spins < 64 {
            std::hint::spin_loop();
        } else {
            idle_spins = 0;
            sleep(Duration::from_millis(1)).await;
        }
    }
}

async fn process_request<F, Fut>(mmap: &MmapMut, handler: &F) -> Value
where
    F: Fn(IpcRequest) -> Fut + Send + Sync,
    Fut: Future<Output = Value> + Send,
{
    let request_capacity = read_u32(mmap, OFFSET_REQUEST_CAPACITY) as usize;
    let request_len = read_u32(mmap, OFFSET_REQUEST_LEN) as usize;
    if request_len == 0 || request_len > request_capacity {
        return json!({ "success": false, "error": "invalid IPC request length" });
    }

    let request_offset = HEADER_BYTES;
    let request_bytes = mmap[request_offset..request_offset + request_len].to_vec();
    match serde_json::from_slice::<IpcRequest>(&request_bytes) {
        Ok(request) => handler(request).await,
        Err(error) => json!({
            "success": false,
            "error": format!("invalid IPC request JSON: {error}")
        }),
    }
}

fn write_response(mmap: &mut MmapMut, response: Value) -> Result<(), serde_json::Error> {
    let request_capacity = read_u32(mmap, OFFSET_REQUEST_CAPACITY) as usize;
    let response_capacity = read_u32(mmap, OFFSET_RESPONSE_CAPACITY) as usize;
    let mut response_bytes = serde_json::to_vec(&response)?;
    if response_bytes.len() > response_capacity {
        response_bytes = serde_json::to_vec(&json!({
            "success": false,
            "error": format!("IPC response exceeds {response_capacity} bytes")
        }))?;
    }

    let response_offset = HEADER_BYTES + request_capacity;
    let response_len = response_bytes.len().min(response_capacity);
    mmap[response_offset..response_offset + response_len].copy_from_slice(&response_bytes[..response_len]);
    write_u32(mmap, OFFSET_RESPONSE_LEN, response_len as u32);
    write_u32(mmap, OFFSET_REQUEST_LEN, 0);
    store_state(mmap, STATE_RESPONSE_READY);
    Ok(())
}

fn initialize_header(mmap: &mut MmapMut, size_bytes: usize) {
    let payload_bytes = size_bytes - HEADER_BYTES;
    let request_capacity = payload_bytes / 2;
    let response_capacity = payload_bytes - request_capacity;

    write_u32(mmap, OFFSET_MAGIC, IPC_MAGIC);
    write_u32(mmap, OFFSET_VERSION, IPC_VERSION);
    write_u32(mmap, OFFSET_REQUEST_ID, 0);
    write_u32(mmap, OFFSET_REQUEST_LEN, 0);
    write_u32(mmap, OFFSET_RESPONSE_LEN, 0);
    write_u32(mmap, OFFSET_REQUEST_CAPACITY, request_capacity as u32);
    write_u32(mmap, OFFSET_RESPONSE_CAPACITY, response_capacity as u32);
    store_state(mmap, STATE_IDLE);
}

fn read_u32(mmap: &MmapMut, offset: usize) -> u32 {
    let mut bytes = [0u8; 4];
    bytes.copy_from_slice(&mmap[offset..offset + 4]);
    u32::from_le_bytes(bytes)
}

fn write_u32(mmap: &mut MmapMut, offset: usize, value: u32) {
    mmap[offset..offset + 4].copy_from_slice(&value.to_le_bytes());
}

fn load_state(mmap: &MmapMut) -> u32 {
    state_cell(mmap).load(Ordering::Acquire)
}

fn store_state(mmap: &MmapMut, state: u32) {
    state_cell(mmap).store(state, Ordering::Release);
}

fn compare_exchange_state(mmap: &MmapMut, current: u32, next: u32) -> bool {
    state_cell(mmap)
        .compare_exchange(current, next, Ordering::AcqRel, Ordering::Acquire)
        .is_ok()
}

fn state_cell(mmap: &MmapMut) -> &AtomicU32 {
    unsafe { &*(mmap.as_ptr().add(OFFSET_STATE) as *const AtomicU32) }
}
