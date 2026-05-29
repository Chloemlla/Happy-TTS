#!/usr/bin/env node

const fs = require('fs/promises');
const path = require('path');

const COURSES = [
  {
    folder: '01-xuanti-yukaiti',
    urls: [
      'https://fcdn.xlxus.com/t/FZ:2.vfDskl0.7M7_j0u.jpg',
      'https://fcdn.xlxus.com/t/FZ:1.vfDskkY.7QM_uqx.jpg',
      'https://fcdn.xlxus.com/t/FZ:1.vfDskkY.7QN_eFQ.jpg',
      'https://fcdn.xlxus.com/t/FZ:2.vfDskl0.7M8_sL7.jpg',
      'https://fcdn.xlxus.com/t/FZ:2.vfDskl0.7M9_w3I.jpg',
      'https://fcdn.xlxus.com/t/FZ:2.vfDskl0.7Ma_dzb.jpg',
      'https://fcdn.xlxus.com/t/FZ:1.vfDskkY.7QO_tlZ.jpg',
      'https://fcdn.xlxus.com/t/FZ:2.vfDskl0.7Mf_84x',
      'https://fcdn.xlxus.com/t/FZ:2.vfDskl0.7Mg_7JA',
      'https://fcdn.xlxus.com/t/FZ:2.vfDskl0.7Mh_92P',
      'https://fcdn.xlxus.com/t/FZ:2.vfDskl0.7Mi_8UA',
      'https://fcdn.xlxus.com/t/FZ:2.vfDskl0.7Mk_7DJ',
      'https://fcdn.xlxus.com/t/FZ:1.vfDskkY.7QT_3uk',
      'https://fcdn.xlxus.com/t/FZ:2.vfDskl0.7Mb_evU.jpg',
      'https://fcdn.xlxus.com/t/FZ:2.vfDskl0.7Mc_qeQ.jpg',
      'https://fcdn.xlxus.com/t/FZ:1.vfDskkY.7QP_sdk.jpg',
      'https://fcdn.xlxus.com/t/FZ:1.vfDskkY.7QQ_fak.jpg',
      'https://fcdn.xlxus.com/t/FZ:1.vfDskkY.7QR_svH.jpg',
      'https://fcdn.xlxus.com/t/FZ:1.vfDskkY.7QW_89I',
      'https://fcdn.xlxus.com/t/FZ:2.vfDskl0.7Ml_7bA',
      'https://fcdn.xlxus.com/t/FZ:2.vfDskl0.7Mn_wJY',
      'https://fcdn.xlxus.com/t/FZ:1.vfDskkY.7QS_vEj.jpg',
    ],
  },
  {
    folder: '02-yanjiu-fangfa-yushishi',
    urls: [
      'https://fcdn.xlxus.com/t/FZ:1.vfDskkY.7QZ_iWq.jpg',
      'https://fcdn.xlxus.com/t/FZ:2.vfDskl0.7Mo_r8l.jpg',
      'https://fcdn.xlxus.com/t/FZ:2.vfDskl0.7Mp_ecT.jpg',
      'https://fcdn.xlxus.com/t/FZ:1.vfDskkY.7R1_pX2.jpg',
      'https://fcdn.xlxus.com/t/FZ:1.vfDskkY.7R0_opR.jpg',
      'https://fcdn.xlxus.com/t/FZ:1.vfDskkY.7R2_e6t.jpg',
      'https://fcdn.xlxus.com/t/FZ:2.vfDskl0.7Mq_qFe.jpg',
      'https://fcdn.xlxus.com/t/FZ:1.vfDskkY.7R3_tT4.jpg',
      'https://fcdn.xlxus.com/t/FZ:2.vfDskl0.7Mr_djK.jpg',
      'https://fcdn.xlxus.com/t/FZ:1.vfDskkY.7R4_plR.jpg',
      'https://fcdn.xlxus.com/t/FZ:1.vfDskkY.7R5_wDT.jpg',
      'https://fcdn.xlxus.com/t/FZ:1.vfDskkY.7R6_eer.jpg',
      'https://fcdn.xlxus.com/t/FZ:2.vfDskl0.7Ms_sNk.jpg',
      'https://fcdn.xlxus.com/t/FZ:2.vfDskl0.7Mt_qtB.jpg',
      'https://fcdn.xlxus.com/t/FZ:1.vfDskkY.7R7_6r8',
      'https://fcdn.xlxus.com/t/FZ:1.vfDskkY.7R8_l1B',
      'https://fcdn.xlxus.com/t/FZ:2.vfDskl0.7Mu_b7e',
    ],
  },
  {
    folder: '03-baogao-zhuanxie-yuzhanshi-dabian',
    urls: [
      'https://fcdn.xlxus.com/t/FZ:2.vfDskl0.7My_igw.jpg',
      'https://fcdn.xlxus.com/t/FZ:1.vfDskkY.7Rb_qVs.jpg',
      'https://fcdn.xlxus.com/t/FZ:2.vfDskl0.7Mz_dnP.jpg',
      'https://fcdn.xlxus.com/t/FZ:1.vfDskkY.7Rk_88G',
      'https://fcdn.xlxus.com/t/FZ:1.vfDskkY.7Rn_b6R',
      'https://fcdn.xlxus.com/t/FZ:2.vfDskl0.7ME_935',
      'https://fcdn.xlxus.com/t/FZ:1.vfDskkY.7Ro_95P',
      'https://fcdn.xlxus.com/t/FZ:1.vfDskkY.7Rp_9IB',
      'https://fcdn.xlxus.com/t/FZ:2.vfDskl0.7MH_9S8',
      'https://fcdn.xlxus.com/t/FZ:2.vfDskl0.7MD_bAx',
      'https://fcdn.xlxus.com/t/FZ:1.vfDskkY.7Rc_dbb.jpg',
      'https://fcdn.xlxus.com/t/FZ:1.vfDskkY.7Rd_s6C.jpg',
      'https://fcdn.xlxus.com/t/FZ:1.vfDskkY.7Re_r4i.jpg',
      'https://fcdn.xlxus.com/t/FZ:1.vfDskkY.7Rf_dEM.jpg',
      'https://fcdn.xlxus.com/t/FZ:1.vfDskkY.7Rg_p4R.jpg',
      'https://fcdn.xlxus.com/t/FZ:2.vfDskl0.7MI_6Zg',
      'https://fcdn.xlxus.com/t/FZ:1.vfDskkY.7Rq_6XK',
      'https://fcdn.xlxus.com/t/FZ:2.vfDskl0.7MK_7Ys',
      'https://fcdn.xlxus.com/t/FZ:1.vfDskkY.7Rh_cHO.jpg',
      'https://fcdn.xlxus.com/t/FZ:2.vfDskl0.7ML_6Bc',
      'https://fcdn.xlxus.com/t/FZ:2.vfDskl0.7MM_7QE',
      'https://fcdn.xlxus.com/t/FZ:2.vfDskl0.7MN_uHZ',
      'https://fcdn.xlxus.com/t/FZ:1.vfDskkY.7Rr_969',
      'https://fcdn.xlxus.com/t/FZ:1.vfDskkY.7Ri_t4x.jpg',
      'https://fcdn.xlxus.com/t/FZ:1.vfDskkY.7Rj_u7U.jpg',
    ],
  },
];

const CONTENT_TYPE_EXTENSIONS = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/svg+xml': '.svg',
};

const IMAGE_EXTENSIONS = new Set(Object.values(CONTENT_TYPE_EXTENSIONS));

function getOutputRoot() {
  const arg = process.argv[2];
  return path.resolve(process.cwd(), arg || 'sqzx-course-images');
}

function sanitizeFileName(value) {
  return value
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function getUrlBaseName(url) {
  const parsed = new URL(url);
  const base = path.posix.basename(parsed.pathname) || 'image';
  const ext = path.posix.extname(base).toLowerCase();
  const urlExtension = IMAGE_EXTENSIONS.has(ext) ? ext : '';

  return {
    baseName: sanitizeFileName(urlExtension ? base.slice(0, -urlExtension.length) : base),
    urlExtension,
  };
}

function getExtension(urlExtension, contentType) {
  if (urlExtension) return urlExtension;

  const normalized = String(contentType || '').split(';')[0].trim().toLowerCase();
  return CONTENT_TYPE_EXTENSIONS[normalized] || '.bin';
}

async function downloadImage(url, targetDir, index) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 sqzx-course-image-downloader',
    },
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get('content-type');
  const { baseName, urlExtension } = getUrlBaseName(url);
  const extension = getExtension(urlExtension, contentType);
  const fileName = `${String(index + 1).padStart(2, '0')}-${baseName}${extension}`;
  const targetPath = path.join(targetDir, fileName);
  const buffer = Buffer.from(await response.arrayBuffer());

  await fs.writeFile(targetPath, buffer);

  return {
    fileName,
    bytes: buffer.length,
  };
}

async function main() {
  const outputRoot = getOutputRoot();
  let total = 0;
  const failures = [];

  await fs.mkdir(outputRoot, { recursive: true });

  for (const course of COURSES) {
    const targetDir = path.join(outputRoot, course.folder);
    await fs.mkdir(targetDir, { recursive: true });

    console.log(`\n${course.folder}`);

    for (const [index, url] of course.urls.entries()) {
      try {
        const result = await downloadImage(url, targetDir, index);
        total += 1;
        console.log(`  ok ${result.fileName} (${result.bytes} bytes)`);
      } catch (error) {
        failures.push({ course: course.folder, url, error: error.message });
        console.error(`  fail ${url}: ${error.message}`);
      }
    }
  }

  console.log(`\nDownloaded ${total} images to ${outputRoot}`);

  if (failures.length) {
    console.error(`Failed ${failures.length} downloads:`);
    for (const failure of failures) {
      console.error(`- ${failure.course}: ${failure.url} (${failure.error})`);
    }
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
