(function () {
  'use strict';

  const STORAGE_KEY = 'memoryRouteClozeTasks';
  const LEGACY_KEY = 'memoryRouteClozeTask';
  const MANAGER_CODE_KEY = 'memoryRouteManagerCode';
  const FAMILY_KEY = 'memory-route';
  const config = window.MEMORY_ROUTE_CONFIG || {};
  const configured = Boolean(config.supabaseUrl && config.supabaseKey && window.supabase);
  const client = configured ? window.supabase.createClient(config.supabaseUrl, config.supabaseKey) : null;
  const isManagerPage = /(?:^|\/)manager\.html$/.test(location.pathname);
  const listeners = new Set();
  let channel = null;
  let tasks = readLocal();
  let managerCode = isManagerPage ? sessionStorage.getItem(MANAGER_CODE_KEY) || '' : '';

  if (!isManagerPage) sessionStorage.removeItem(MANAGER_CODE_KEY);

  function normalize(row) {
    return {
      id: String(row.id),
      subject: row.subject || '历史',
      title: row.title || '挖空背诵任务',
      content: row.content || '',
      answers: Array.isArray(row.answers) ? row.answers : [],
      createdAt: row.created_at || row.createdAt || new Date().toISOString(),
      updatedAt: row.updated_at || row.updatedAt || row.created_at || new Date().toISOString()
    };
  }

  function readLocal() {
    try {
      const current = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
      if (current.length) return current.map(normalize);
      const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY));
      return legacy ? [normalize(legacy)] : [];
    } catch (_) { return []; }
  }

  function writeLocal(next) {
    tasks = Array.isArray(next) ? next : [];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    if (tasks[0]) localStorage.setItem(LEGACY_KEY, JSON.stringify(tasks[0]));
    else localStorage.removeItem(LEGACY_KEY);
  }

  function notify() {
    listeners.forEach(listener => listener([...tasks]));
  }

  function setTasks(next) {
    writeLocal(next);
    notify();
  }

  function injectManagerGate() {
    if (!isManagerPage || document.querySelector('#managerGate')) return;
    const style = document.createElement('style');
    style.textContent = `
      .manager-gate{position:fixed;z-index:300;inset:0;display:grid;place-items:center;padding:18px;background:linear-gradient(145deg,rgba(16,42,67,.92),rgba(31,126,137,.92));backdrop-filter:blur(12px)}.manager-gate.hidden{display:none}
      .manager-gate-card{width:min(100%,390px);padding:27px;border-radius:26px;background:#fff;box-shadow:0 28px 80px rgba(5,26,49,.32);font-family:"Microsoft YaHei","PingFang SC",sans-serif;color:#17233b}.manager-gate-icon{width:58px;height:58px;display:grid;place-items:center;margin-bottom:15px;border-radius:18px;color:#fff;background:linear-gradient(145deg,#3478f6,#20b8a6);font-size:28px}.manager-gate-card h2{margin:0 0 8px;font-size:22px}.manager-gate-card p{margin:0 0 17px;color:#718096;font-size:13px;line-height:1.65}.manager-gate-card input{width:100%;min-height:48px;border:1px solid #dfe7f1;border-radius:14px;padding:12px 14px;font:16px "Microsoft YaHei","PingFang SC",sans-serif;outline:none}.manager-gate-card input:focus{border-color:#65a0e5;box-shadow:0 0 0 3px rgba(52,120,246,.1)}.manager-gate-card button{width:100%;min-height:48px;margin-top:12px;border:0;border-radius:14px;color:#fff;background:linear-gradient(135deg,#3478f6,#20b8a6);font:700 15px "Microsoft YaHei","PingFang SC",sans-serif;cursor:pointer}.manager-gate-card button:disabled{opacity:.6}.manager-gate-message{min-height:20px;margin:10px 0 0!important;color:#b24f49!important}
    `;
    document.head.appendChild(style);
    document.body.insertAdjacentHTML('beforeend', `
      <section class="manager-gate" id="managerGate" aria-label="管理端通行码验证">
        <div class="manager-gate-card">
          <div class="manager-gate-icon">🔐</div><h2>进入管理端</h2>
          <p>孩子端无需账号。布置、修改或删除在线任务前，请输入家庭通行码。</p>
          <input id="managerCodeInput" type="password" autocomplete="off" placeholder="请输入通行码" aria-label="家庭通行码">
          <button id="managerCodeSubmit" type="button">验证并进入</button>
          <p class="manager-gate-message" id="managerGateMessage" role="alert"></p>
        </div>
      </section>`);
    document.querySelector('#managerCodeSubmit').addEventListener('click', submitManagerCode);
    document.querySelector('#managerCodeInput').addEventListener('keydown', event => { if (event.key === 'Enter') submitManagerCode(); });
  }

  function showManagerGate(show) {
    document.querySelector('#managerGate')?.classList.toggle('hidden', !show);
    if (show) setTimeout(() => document.querySelector('#managerCodeInput')?.focus(), 0);
  }

  function setGateMessage(message) {
    const element = document.querySelector('#managerGateMessage');
    if (element) element.textContent = message || '';
  }

  async function verifyManagerCode(code) {
    if (!client) throw new Error('在线同步服务暂时不可用');
    const result = await client.rpc('memory_manager_verify', { p_code: code });
    if (result.error) throw result.error;
    return result.data === true;
  }

  async function submitManagerCode() {
    const input = document.querySelector('#managerCodeInput');
    const button = document.querySelector('#managerCodeSubmit');
    const code = input?.value || '';
    if (!code) return setGateMessage('请输入家庭通行码');
    button.disabled = true;
    button.textContent = '正在验证…';
    setGateMessage('');
    try {
      if (!await verifyManagerCode(code)) throw new Error('通行码不正确');
      managerCode = code;
      sessionStorage.setItem(MANAGER_CODE_KEY, code);
      input.value = '';
      showManagerGate(false);
    } catch (error) {
      setGateMessage(error.message || '验证失败，请稍后重试');
    } finally {
      button.disabled = false;
      button.textContent = '验证并进入';
    }
  }

  async function fetchCloud() {
    if (!client) return tasks;
    const result = await client.from('memory_tasks').select('*').eq('family_key', FAMILY_KEY).order('created_at', { ascending: false });
    if (result.error) throw result.error;
    const remote = (result.data || []).map(normalize);
    setTasks(remote);
    return remote;
  }

  async function subscribeRealtime() {
    if (!client || channel) return;
    channel = client.channel('memory-route-public')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'memory_tasks', filter: `family_key=eq.${FAMILY_KEY}` }, () => fetchCloud().catch(console.error))
      .subscribe();
  }

  async function init() {
    injectManagerGate();
    if (isManagerPage) {
      if (managerCode) {
        try {
          if (await verifyManagerCode(managerCode)) showManagerGate(false);
          else { managerCode = ''; sessionStorage.removeItem(MANAGER_CODE_KEY); showManagerGate(true); }
        } catch (_) { showManagerGate(true); }
      } else showManagerGate(true);
    }
    try {
      await fetchCloud();
      await subscribeRealtime();
    } catch (error) {
      console.error(error);
      notify();
    }
  }

  async function saveTask(task) {
    if (!isManagerPage || !managerCode) { showManagerGate(true); throw new Error('请先输入管理端通行码'); }
    const normalized = normalize(task);
    const result = await client.rpc('memory_task_upsert', {
      p_code: managerCode,
      p_id: normalized.id,
      p_subject: normalized.subject,
      p_title: normalized.title,
      p_content: normalized.content,
      p_answers: normalized.answers
    });
    if (result.error) throw result.error;
    await fetchCloud();
    return normalized;
  }

  async function deleteTask(id) {
    if (!isManagerPage || !managerCode) { showManagerGate(true); throw new Error('请先输入管理端通行码'); }
    const result = await client.rpc('memory_task_delete', { p_code: managerCode, p_id: id });
    if (result.error) throw result.error;
    await fetchCloud();
  }

  window.MemoryRouteCloud = {
    init,
    getTasks: () => [...tasks],
    saveTask,
    deleteTask,
    subscribe(listener) { listeners.add(listener); listener([...tasks]); return () => listeners.delete(listener); },
    showLogin: () => showManagerGate(true),
    isConfigured: () => configured
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
