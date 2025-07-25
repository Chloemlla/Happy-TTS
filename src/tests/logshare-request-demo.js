// logshare-request-demo.js
const axios = require('axios');
const FormData = require('form-data');

const API_BASE = process.env.API_BASE || 'http://localhost:3000';
const adminPassword = process.env.TEST_ADMIN_PASSWORD || 'admin';
const testContent = 'Node.js demo log upload!114114';

async function uploadLog() {
  const form = new FormData();
  form.append('file', Buffer.from(testContent, 'utf-8'), 'demo.txt');
  form.append('adminPassword', adminPassword);

  try {
    const res = await axios.post(`${API_BASE}/api/sharelog`, form, {
      headers: form.getHeaders(),
      maxContentLength: 25600,
    });
    console.log('上传成功:', res.data);
  } catch (e) {
    if (e.response) {
      console.error('上传失败:', e.response.data);
    } else {
      console.error('请求异常:', e.message);
    }
  }
}

uploadLog(); 