(function () {
  'use strict';

  const STORAGE_KEY = 'memoryRouteClozeTasks';
  const LEGACY_KEY = 'memoryRouteClozeTask';
  const config = window.MEMORY_ROUTE_CONFIG || {};
  const configured = Boolean(config.supabaseUrl && config.supabaseKey && window.supabase);
  const client = configured
    ? window.supabase.createClient(config.supabaseUrl, config.supabaseKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      })
    : null;

  let tasks = readLocal();
  let session = null;
  let channel = null;
  const listeners = new Set();

  function storageKey(userId) { return userId ? `${STORAGE_KEY}:${userId}` : STORAGE_KEY; }

  function readLocal(userId) {
    try {
      const current = JSON.parse(localStorage.getItem(storageKey(userId))) || [];
      if (current.length) return current;
      if (userId) return [];
      const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY));
      return legacy ? [legacy] : [];
    } catch (_) {
      return [];
    }
  }

  function writeLocal(next) {
    tasks = Array.isArray(next) ? next : [];
    localStorage.setItem(storageKey(session?.user?.id), JSON.stringify(tasks));
    if (!session) {
      if (tasks[0]) localStorage.setItem(LEGACY_KEY, JSON.stringify(tasks[0]));
      else localStorage.removeItem(LEGACY_KEY);
    }
  }

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

  function toRow(task) {
    return {
      id: task.id,
      user_id: session.user.id,
      subject: task.subject,
      title: task.title,
      content: task.content,
      answers: task.answers || [],
      created_at: task.createdAt || new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  }

  function notify() {
    listeners.forEach(listener => listener([...tasks]));
    updateAccountUi();
  }

  function setTasks(next) {
    writeLocal(next);
    notify();
  }

  function setMessage(message, type) {
    const el = document.querySelector('#cloudAuthMessage');
    if (!el) return;
    el.textContent = message || '';
    el.dataset.type = type || '';
  }

  function injectUi() {
    if (document.querySelector('#cloudAuthGate')) return;
    const style = document.createElement('style');
    style.textContent = `
      .cloud-account{position:fixed;z-index:80;left:18px;top:18px;display:flex;align-items:center;gap:8px;padding:8px 11px;border:1px solid rgba(218,228,240,.9);border-radius:13px;background:rgba(255,255,255,.94);box-shadow:0 8px 24px rgba(31,61,96,.12);font:12px/1.2 "Microsoft YaHei","PingFang SC",sans-serif;color:#52637a;backdrop-filter:blur(9px)}
      .cloud-account button{border:0;border-radius:9px;padding:6px 8px;background:#eaf3ff;color:#2f6fae;font:inherit;cursor:pointer}.cloud-dot{width:8px;height:8px;border-radius:50%;background:#efa762}.cloud-account.online .cloud-dot{background:#28ad83}.cloud-account.offline .cloud-dot{background:#9aa8b8}
      .cloud-auth-gate{position:fixed;z-index:200;inset:0;display:grid;place-items:center;padding:18px;background:linear-gradient(145deg,rgba(16,42,67,.88),rgba(31,126,137,.88));backdrop-filter:blur(10px)}.cloud-auth-gate.hidden{display:none}
      .cloud-auth-card{width:min(100%,410px);padding:26px;border-radius:26px;background:#fff;box-shadow:0 28px 80px rgba(5,26,49,.3);font-family:"Microsoft YaHei","PingFang SC",sans-serif;color:#17233b}.cloud-auth-logo{width:54px;height:54px;display:grid;place-items:center;margin-bottom:15px;border-radius:17px;color:#fff;background:linear-gradient(145deg,#3478f6,#20b8a6);font-size:27px}.cloud-auth-card h2{margin:0 0 7px;font-size:22px}.cloud-auth-card>p{margin:0 0 18px;color:#718096;font-size:13px;line-height:1.65}.cloud-field{margin-top:12px}.cloud-field label{display:block;margin-bottom:6px;font-size:13px;font-weight:700}.cloud-field input{width:100%;border:1px solid #dfe7f1;border-radius:13px;padding:12px 13px;font:inherit;outline:none}.cloud-field input:focus{border-color:#65a0e5;box-shadow:0 0 0 3px rgba(52,120,246,.1)}.cloud-auth-actions{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:16px}.cloud-auth-actions button{border:0;border-radius:13px;padding:12px;font:700 14px "Microsoft YaHei","PingFang SC",sans-serif;cursor:pointer}.cloud-login{color:#fff;background:linear-gradient(135deg,#3478f6,#20b8a6)}.cloud-register{color:#2e6ea9;background:#eaf3ff}.cloud-auth-message{min-height:20px;margin:11px 0 0!important;color:#277d6e!important}.cloud-auth-message[data-type="error"]{color:#b24f49!important}.cloud-auth-note{margin-top:12px!important;padding:10px 12px;border-radius:12px;background:#f5f8fc;color:#718096!important;font-size:12px!important}.cloud-local{width:100%;margin-top:8px;border:0;background:transparent;color:#718096;text-decoration:underline;cursor:pointer}
      @media(max-width:650px){.cloud-account{left:10px;top:calc(env(safe-area-inset-top) + 10px);max-width:52vw}.cloud-account span:nth-child(2){white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.cloud-auth-card{padding:22px}.cloud-auth-actions{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
    document.body.insertAdjacentHTML('beforeend', `
      <div class="cloud-account offline" id="cloudAccount"><span class="cloud-dot"></span><span id="cloudAccountText">本机模式</span><button id="cloudAccountButton" type="button">登录</button></div>
      <section class="cloud-auth-gate hidden" id="cloudAuthGate" aria-label="家庭账号登录">
        <div class="cloud-auth-card">
          <div class="cloud-auth-logo">⛵</div><h2>登录家庭账号</h2>
          <p>管理手机和孩子的安卓设备使用同一账号，布置的任务会自动同步。</p>
          <div class="cloud-field"><label for="cloudEmail">邮箱</label><input id="cloudEmail" type="email" inputmode="email" autocomplete="email" placeholder="请输入常用邮箱"></div>
          <div class="cloud-field"><label for="cloudPassword">密码</label><input id="cloudPassword" type="password" minlength="6" autocomplete="current-password" placeholder="至少 6 位"></div>
          <div class="cloud-auth-actions"><button class="cloud-login" id="cloudLogin" type="button">登录并同步</button><button class="cloud-register" id="cloudRegister" type="button">注册家庭账号</button></div>
          <p class="cloud-auth-message" id="cloudAuthMessage" role="alert"></p>
          <p class="cloud-auth-note">首次登录会自动把这台设备里原有的任务迁移到云端。以后两台设备都可实时查看。</p>
          <button class="cloud-local" id="cloudLocal" type="button">暂时使用本机模式</button>
        </div>
      </section>`);

    document.querySelector('#cloudAccountButton').addEventListener('click', async () => {
      if (session) {
        await client.auth.signOut();
      } else {
        showAuth(true);
      }
    });
    document.querySelector('#cloudLocal').addEventListener('click', () => { sessionStorage.setItem('memoryRouteLocalMode','1'); showAuth(false); });
    document.querySelector('#cloudLogin').addEventListener('click', signIn);
    document.querySelector('#cloudRegister').addEventListener('click', signUp);
    document.querySelector('#cloudPassword').addEventListener('keydown', event => {
      if (event.key === 'Enter') signIn();
    });
  }

  function showAuth(show) {
    document.querySelector('#cloudAuthGate')?.classList.toggle('hidden', !show);
    if (show) setTimeout(() => document.querySelector('#cloudEmail')?.focus(), 0);
  }

  function updateAccountUi() {
    const box = document.querySelector('#cloudAccount');
    const text = document.querySelector('#cloudAccountText');
    const button = document.querySelector('#cloudAccountButton');
    if (!box || !text || !button) return;
    if (session) {
      box.className = 'cloud-account online';
      text.textContent = `${session.user.email || '家庭账号'} · 已同步`;
      button.textContent = '退出';
    } else {
      box.className = `cloud-account ${configured ? 'offline' : ''}`;
      text.textContent = configured ? '未登录 · 本机保存' : '云同步待配置';
      button.textContent = configured ? '登录' : '说明';
    }
  }

  function credentials() {
    const email = document.querySelector('#cloudEmail')?.value.trim();
    const password = document.querySelector('#cloudPassword')?.value || '';
    if (!email) throw new Error('请输入邮箱');
    if (password.length < 6) throw new Error('密码至少需要 6 位');
    return { email, password };
  }

  async function signIn() {
    if (!client) return setMessage('云同步服务尚未配置。', 'error');
    try {
      setMessage('正在登录…');
      const result = await client.auth.signInWithPassword(credentials());
      if (result.error) throw result.error;
      sessionStorage.removeItem('memoryRouteLocalMode');
      showAuth(false);
    } catch (error) {
      setMessage(error.message === 'Invalid login credentials' ? '邮箱或密码不正确' : error.message, 'error');
    }
  }

  async function signUp() {
    if (!client) return setMessage('云同步服务尚未配置。', 'error');
    try {
      setMessage('正在创建账号…');
      const result = await client.auth.signUp(credentials());
      if (result.error) throw result.error;
      sessionStorage.removeItem('memoryRouteLocalMode');
      if (result.data.session) {
        setMessage('账号已创建，正在同步…');
        showAuth(false);
      } else {
        setMessage('账号已创建，请先到邮箱完成验证后再登录。');
      }
    } catch (error) {
      setMessage(error.message, 'error');
    }
  }

  async function fetchCloud() {
    if (!session) return tasks;
    const result = await client.from('memory_tasks').select('*').order('created_at', { ascending: false });
    if (result.error) throw result.error;
    const remote = (result.data || []).map(normalize);
    if (!remote.length && tasks.length) {
      const migrated = await client.from('memory_tasks').upsert(tasks.map(toRow));
      if (migrated.error) throw migrated.error;
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(LEGACY_KEY);
      return tasks;
    }
    setTasks(remote);
    return remote;
  }

  async function subscribeRealtime() {
    if (!session) return;
    if (channel) await client.removeChannel(channel);
    channel = client.channel(`memory-route-${session.user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'memory_tasks', filter: `user_id=eq.${session.user.id}` }, () => fetchCloud().catch(console.error))
      .subscribe();
  }

  async function activate(nextSession) {
    const guestTasks = session ? [] : [...tasks];
    session = nextSession;
    setMessage('');
    updateAccountUi();
    if (!session) {
      if (channel) await client.removeChannel(channel);
      channel = null;
      tasks = readLocal();
      notify();
      if (!sessionStorage.getItem('memoryRouteLocalMode')) showAuth(true);
      return;
    }
    const accountCache = readLocal(session.user.id);
    tasks = accountCache.length ? accountCache : guestTasks;
    try {
      await fetchCloud();
      await subscribeRealtime();
      showAuth(false);
    } catch (error) {
      console.error(error);
      setMessage('云端连接失败，本机数据仍然保留。', 'error');
    }
  }

  async function init() {
    injectUi();
    updateAccountUi();
    if (!client) return notify();
    const current = await client.auth.getSession();
    if (current.error) console.error(current.error);
    await activate(current.data?.session || null);
    client.auth.onAuthStateChange((_event, nextSession) => {
      setTimeout(() => activate(nextSession), 0);
    });
  }

  async function saveTask(task) {
    const normalized = normalize(task);
    const next = [normalized, ...tasks.filter(item => item.id !== normalized.id)];
    setTasks(next);
    if (!session) return normalized;
    const result = await client.from('memory_tasks').upsert(toRow(normalized));
    if (result.error) throw result.error;
    return normalized;
  }

  async function deleteTask(id) {
    setTasks(tasks.filter(task => task.id !== id));
    if (!session) return;
    const result = await client.from('memory_tasks').delete().eq('id', id);
    if (result.error) throw result.error;
  }

  window.MemoryRouteCloud = {
    init,
    getTasks: () => [...tasks],
    saveTask,
    deleteTask,
    subscribe(listener) { listeners.add(listener); listener([...tasks]); return () => listeners.delete(listener); },
    showLogin: () => showAuth(true),
    isConfigured: () => configured
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
