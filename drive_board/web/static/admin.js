export function installExtension(context) {
  const {
    state,
    api,
    escapeHtml,
    renderSvgIcon,
    toast,
    openModal,
    syncRoute,
    showManagerView,
    refreshShellPreservingWorkspace,
    bootstrap,
  } = context;

  function syncTokenVisibilityToggle(button, input) {
    const visible = input.type === "text";
    button.innerHTML = renderSvgIcon(visible ? "eye-off" : "eye");
    button.setAttribute("aria-label", visible ? "隐藏 token" : "显示 token");
    button.title = visible ? "隐藏 token" : "显示 token";
  }

  async function openActorManager({ skipRouteSync = false, replaceRoute = false } = {}) {
    state.activeView = "extension:admin";
    state.managerMode = "extension:admin";
    state.managerContext = {};
    showManagerView();
    const payload = await api("/api/actors?include_inactive=true");
    document.getElementById("managerBody").innerHTML = `
      <div class="manager-stack">
        <section class="manager-section">
          <div class="section-head">
            <div>
              <h2>用户管理</h2>
            </div>
            <button id="createActorBtn" type="button">创建成员</button>
          </div>
        </section>
        <section class="manager-section">
          <div class="section-head">
            <div>
              <h2>现有成员</h2>
              <p>支持更新显示名称、管理员状态、启用状态和彻底删除；用户可直接设置新密码，Agent token 支持隐藏和显示查看。</p>
            </div>
          </div>
          ${payload.actors.length ? `
            <table class="manager-table">
              <thead>
                <tr>
                  <th>成员</th>
                  <th>显示名称</th>
                  <th>权限状态</th>
                  <th>凭证</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                ${payload.actors.map((actor) => `
                  <tr data-actor-id="${escapeHtml(actor.actor_id)}" data-kind="${escapeHtml(actor.kind)}">
                    <td><div class="row-meta"><strong>${escapeHtml(actor.actor_id)}</strong></div></td>
                    <td><input name="display_name" value="${escapeHtml(actor.display_name)}" /></td>
                    <td>
                      <div class="manager-inline-status actor-status-row">
                        <label class="toggle-row actor-admin-toggle">
                          <span>管理员</span>
                          <input name="is_admin" type="checkbox"${actor.is_admin ? " checked" : ""} />
                        </label>
                        <span class="status-pill${actor.is_active ? "" : " inactive"}">${actor.is_active ? "active" : "inactive"}</span>
                      </div>
                    </td>
                    <td>
                      ${actor.kind === "user"
                        ? '<input name="password" type="password" placeholder="输入新密码以更新" autocomplete="new-password" />'
                        : `
                          <div class="token-visibility-field">
                            <input
                              class="token-visibility-input"
                              name="token"
                              type="password"
                              value="${escapeHtml(actor.token || "")}"
                              data-original-token="${escapeHtml(actor.token || "")}"
                              placeholder="${escapeHtml(actor.token ? "" : "当前 token 不可恢复，可直接填入新 token")}"
                              spellcheck="false"
                              autocomplete="off"
                            />
                            <button type="button" data-action="toggle-token-visibility" class="token-visibility-toggle secondary" aria-label="显示 token" title="显示 token">${renderSvgIcon("eye")}</button>
                          </div>
                        `}
                    </td>
                    <td>
                      <div class="manager-actions actor-row-actions">
                        <button type="button" data-action="save-actor">保存</button>
                        <button type="button" data-action="toggle-actor" class="secondary">${actor.is_active ? "停用" : "启用"}</button>
                        <button type="button" data-action="delete-actor" class="danger-button">删除</button>
                      </div>
                    </td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          ` : '<div class="empty-panel">暂无成员数据。</div>'}
        </section>
      </div>
    `;

    document.getElementById("createActorBtn").addEventListener("click", () => {
      openModal(
        `
          <h2>创建成员</h2>
          <label><span>类型</span><select name="kind"><option value="user">人类用户</option><option value="agent">Agent</option></select></label>
          <label><span>账号或 Agent 名称</span><input name="name" required /></label>
          <label><span>显示名称</span><input name="display_name" required /></label>
          <label id="createPasswordField"><span>密码</span><input name="password" type="password" /></label>
          <label id="createTokenField" class="hidden"><span>Agent Token</span><input name="token" /></label>
          <label class="toggle-row"><span>管理员</span><input name="is_admin" type="checkbox" /></label>
        `,
        async (form) => {
          const kind = form.get("kind");
          const name = String(form.get("name") || "").trim();
          const body = {
            kind,
            display_name: String(form.get("display_name") || "").trim(),
            is_admin: form.get("is_admin") === "on",
          };
          if (kind === "user") {
            body.username = name;
            body.password = String(form.get("password") || "");
          } else {
            body.actor_id = name.startsWith("agent:") ? name : `agent:${name}`;
            const token = String(form.get("token") || "").trim();
            if (token) body.token = token;
          }
          const created = await api("/api/actors", { method: "POST", body });
          toast("成员已创建");
          await refreshShellPreservingWorkspace({ reloadFiles: false });
          await openActorManager({ skipRouteSync: true, replaceRoute: true });
          if (created.token) {
            openModal(`<h2>Agent Token</h2><div class="token-box">${escapeHtml(created.token)}</div>`, async () => {}, {
              confirmLabel: "关闭",
              cancelLabel: "关闭",
            });
          }
        },
        {
          confirmLabel: "创建成员",
          onReady: ({ body }) => {
            const syncFields = () => {
              const kind = body.querySelector('[name="kind"]').value;
              body.querySelector('#createPasswordField').classList.toggle('hidden', kind !== 'user');
              body.querySelector('#createTokenField').classList.toggle('hidden', kind !== 'agent');
            };
            syncFields();
            body.querySelector('[name="kind"]').addEventListener('change', syncFields);
          },
        },
      );
    });

    document.getElementById("managerBody").querySelectorAll('[data-action="toggle-token-visibility"]').forEach((button) => {
      const input = button.closest('.token-visibility-field')?.querySelector('[name="token"]');
      if (!input) return;
      syncTokenVisibilityToggle(button, input);
      button.addEventListener('click', () => {
        input.type = input.type === 'password' ? 'text' : 'password';
        syncTokenVisibilityToggle(button, input);
      });
    });

    document.getElementById("managerBody").querySelectorAll('[data-action="save-actor"]').forEach((button) => {
      button.addEventListener('click', async () => {
        const row = button.closest('tr');
        const body = {
          display_name: row.querySelector('[name="display_name"]').value.trim(),
          is_admin: row.querySelector('[name="is_admin"]').checked,
        };
        if (row.dataset.kind === 'user') {
          const nextPassword = row.querySelector('[name="password"]').value.trim();
          if (nextPassword) body.password = nextPassword;
        } else {
          const tokenField = row.querySelector('[name="token"]');
          const nextToken = tokenField.value.trim();
          if (nextToken && nextToken !== (tokenField.dataset.originalToken || '')) {
            body.token = nextToken;
          }
        }
        await api(`/api/actors/${encodeURIComponent(row.dataset.actorId)}`, { method: 'PATCH', body });
        toast('成员已更新');
        await refreshShellPreservingWorkspace({ reloadFiles: false });
        await openActorManager({ skipRouteSync: true, replaceRoute: true });
      });
    });

    document.getElementById("managerBody").querySelectorAll('[data-action="toggle-actor"]').forEach((button) => {
      button.addEventListener('click', async () => {
        const row = button.closest('tr');
        const shouldEnable = button.textContent.trim() === '启用';
        await api(`/api/actors/${encodeURIComponent(row.dataset.actorId)}`, { method: 'PATCH', body: { is_active: shouldEnable } });
        toast(shouldEnable ? '成员已启用' : '成员已停用');
        await refreshShellPreservingWorkspace({ reloadFiles: false });
        await openActorManager({ skipRouteSync: true, replaceRoute: true });
      });
    });

    document.getElementById("managerBody").querySelectorAll('[data-action="delete-actor"]').forEach((button) => {
      button.addEventListener('click', () => {
        const row = button.closest('tr');
        const actorId = row.dataset.actorId;
        openModal(
          `<h2>删除成员</h2><p>确认彻底删除 ${escapeHtml(actorId)}？其登录凭证会失效，私有空间和其中的文件也会一起删除。</p>`,
          async () => {
            await api(`/api/actors/${encodeURIComponent(actorId)}`, { method: 'DELETE' });
            toast('成员已删除');
            if (actorId === state.actor?.actor_id) {
              window.history.replaceState(null, '', '/');
              await bootstrap();
              return;
            }
            await refreshShellPreservingWorkspace({ reloadFiles: false });
            await openActorManager({ skipRouteSync: true, replaceRoute: true });
          },
          { confirmLabel: '删除', confirmVariant: 'danger' },
        );
      });
    });

    if (!skipRouteSync) {
      syncRoute({ replace: replaceRoute });
    }
  }

  return {
    parseRoute(url) {
      const segments = url.pathname.split('/').filter(Boolean);
      if (segments[0] === 'app' && segments[1] === 'admin' && segments[2] === 'actors') {
        return { view: 'extension:admin' };
      }
      return null;
    },
    buildUrl(currentState) {
      return currentState.activeView === 'extension:admin' ? '/app/admin/actors' : null;
    },
    async openRoute(route) {
      if (route.view !== 'extension:admin') {
        return false;
      }
      await openActorManager({ skipRouteSync: true });
      return true;
    },
    activeNavButtonId(currentState) {
      return currentState.activeView === 'extension:admin' ? 'adminBtn' : null;
    },
    async refreshManager(managerMode) {
      if (managerMode !== 'extension:admin') {
        return false;
      }
      await openActorManager();
      return true;
    },
  };
}