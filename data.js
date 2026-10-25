// File: api/data.js
export default async function handler(req, res) {
  // Cấu hình CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  // 🔒 MASTER KEY MỚI
  const MASTER_KEY = '$2a$10$7BwVMjAawt1mOkNYyTUnwOGIlSW86BBtSCgLzkQmIyn9pSdTeu1rO'; 
  const ADMIN_PIN = '#05122010';
  const BIN_ID = '6a9aabf0f5f4af5e2969af3c';
  const API_URL = `https://api.jsonbin.io/v3/b/${BIN_ID}`;

  // Hàm hỗ trợ đọc dữ liệu từ JSONBin
  async function getKeys() {
    const r = await fetch(`${API_URL}/latest`, { headers: { 'X-Master-Key': MASTER_KEY }});
    if (!r.ok) {
        const err = await r.json();
        throw new Error('JSONBin Read Error: ' + (err.message || r.statusText));
    }
    const j = await r.json();
    return (j.record && Array.isArray(j.record.keys)) ? j.record.keys : [];
  }
  
  // Hàm hỗ trợ lưu dữ liệu lên JSONBin
  async function saveKeys(keys) {
    const r = await fetch(API_URL, { 
      method: 'PUT', 
      headers: { 'Content-Type': 'application/json', 'X-Master-Key': MASTER_KEY }, 
      body: JSON.stringify({ keys }) 
    });
    if (!r.ok) {
        const err = await r.json();
        throw new Error('JSONBin Save Error: ' + (err.message || r.statusText));
    }
    return r.json();
  }

  try {
    // Xử lý an toàn: Nếu Vercel không tự parse JSON body, ta tự parse
    let body = req.body;
    if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch (e) { body = {}; }
    }

    // --- LUỒNG KHÁCH HÀNG ---
    if (req.method === 'POST' && body.action === 'verify') {
      const { code, deviceId } = body;
      const keys = await getKeys();
      const idx = keys.findIndex(k => k.code === code);
      
      if (idx === -1) return res.status(400).json({ error: 'Key không tồn tại' });
      const key = { ...keys[idx] };

      if (key.status === 'expired' || (key.expiresAt && Date.now() >= key.expiresAt)) {
        return res.status(400).json({ error: 'Key đã hết hạn' });
      }
      if (key.boundDeviceId && key.boundDeviceId !== deviceId) {
        return res.status(400).json({ error: 'Key đã khóa trên thiết bị khác!' });
      }
      
      if (!key.activatedAt) {
        const now = Date.now();
        key.activatedAt = now;
        key.expiresAt = (key.durationMs == null) ? null : now + key.durationMs;
        key.status = 'active'; key.boundDeviceId = deviceId;
        keys[idx] = key; await saveKeys(keys);
      } else if (!key.boundDeviceId) {
        key.boundDeviceId = deviceId; keys[idx] = key; await saveKeys(keys);
      }
      return res.status(200).json({ success: true, key });
    }

    // --- LUỒNG ADMIN ---
    if (req.headers.authorization !== `Bearer ${ADMIN_PIN}`) {
      return res.status(401).json({ error: 'Sai mã PIN Admin' });
    }

    if (req.method === 'GET') {
      const keys = await getKeys();
      return res.status(200).json({ keys });
    }
    if (req.method === 'PUT') {
      if (!body.keys || !Array.isArray(body.keys)) {
          return res.status(400).json({ error: 'Dữ liệu gửi lên không hợp lệ (thiếu mảng keys)' });
      }
      await saveKeys(body.keys);
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Phương thức không được hỗ trợ' });

  } catch (error) {
    // Trả về lỗi chi tiết để dễ debug
    console.error('Server Error:', error.message);
    return res.status(500).json({ error: error.message });
  }
}
