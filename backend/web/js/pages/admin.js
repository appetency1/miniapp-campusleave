/* ============================================================
   pages/admin.js —— 管理端 4 个页面（账号 / 班级 / 辅导员绑定 / 系统配置）

   为什么四页放一个文件：它们共用同一套"表格 + 抽屉表单"骨架，
   拆成四个文件会有四份重复的 field/drawer/refresh 代码。
   路由器上仍是四个独立路由（#/admin/users 等），互不影响。

   数据来源：window.STORE.admin（由 api.loadAdminStore 一次拉齐）。
   写操作成功后统一调 ADMIN.api.refresh() 再重绘当前页——不做局部改内存，
   避免"界面显示改了、后端其实失败"。
   ============================================================ */
(function () {
  var ADMIN = window.ADMIN;
  var ui = ADMIN.ui;
  var el = ui.el;
  var api = ADMIN.api;

  /* ================= 通用：字段与抽屉表单 ================= */

  function field(label, input, hint) {
    return el('div', { class: 'field' }, [
      el('label', { class: 'field-label', text: label }),
      input,
      hint ? el('div', { class: 'field-hint', text: hint }) : null
    ]);
  }

  function textInput(placeholder, value, type) {
    return el('input', {
      class: 'input',
      attrs: {
        type: type || 'text',
        placeholder: placeholder || '',
        value: value == null ? '' : value,
        autocomplete: 'off'
      }
    });
  }

  function selectInput(options, value) {
    var s = el('select', { class: 'input' });
    options.forEach(function (o) {
      var opt = el('option', { attrs: { value: String(o.value) }, text: o.label });
      if (String(o.value) === String(value)) opt.selected = true;
      s.appendChild(opt);
    });
    return s;
  }

  /**
   * 打开一个抽屉表单。
   * @param {string} title
   * @param {Array}  fields  [{key, label, type, options, placeholder, hint, value}]
   * @param {string} submitText
   * @param {Function} onSubmit (values) => Promise
   */
  function openForm(title, fields, submitText, onSubmit) {
    var inputs = {};
    var nodes = fields.map(function (f) {
      var input;
      if (f.type === 'select') input = selectInput(f.options, f.value);
      else input = textInput(f.placeholder, f.value, f.type === 'password' ? 'password' : 'text');
      input.id = 'f-' + f.key;
      inputs[f.key] = input;
      return field(f.label, input, f.hint);
    });

    var err = el('div', { class: 'form-err' });
    var submit = el('button', { class: 'btn btn--primary', attrs: { type: 'submit' }, text: submitText });
    var cancel = el('button', { class: 'btn btn--secondary', attrs: { type: 'button' }, text: '取消' });

    var form = el('form', { class: 'drawer-form' }, [
      el('div', { class: 'drawer-title', text: title })
    ].concat(nodes).concat([
      err,
      el('div', { class: 'drawer-actions' }, [cancel, submit])
    ]));

    var d = ui.drawer(form);
    cancel.addEventListener('click', d.close);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var values = {};
      fields.forEach(function (f) { values[f.key] = (inputs[f.key].value || '').trim(); });
      submit.disabled = true;
      submit.textContent = '提交中…';
      Promise.resolve(onSubmit(values)).then(function () {
        d.close();
      }).catch(function (ex) {
        submit.disabled = false;
        submit.textContent = submitText;
        err.textContent = (ex && ex.message) || '操作失败';
      });
    });

    setTimeout(function () { if (fields.length) inputs[fields[0].key].focus(); }, 60);
  }

  /** 写操作统一出口：成功后刷新 STORE 并重绘当前页 */
  function act(promise, okText) {
    return promise.then(function () {
      return api.refresh();
    }).then(function () {
      if (okText) toast(okText);
      ADMIN.shell.rerender();
    });
  }

  function toast(text) {
    var t = el('div', { class: 'toast', text: text });
    document.body.appendChild(t);
    setTimeout(function () { t.classList.add('is-out'); }, 1600);
    setTimeout(function () { t.remove(); }, 2100);
  }

  /** 页头右侧的动作按钮 */
  function headBtn(text, onClick) {
    return el('button', { class: 'btn btn--primary btn--sm', attrs: { type: 'button' }, text: text, onClick: onClick });
  }

  /* ================= 1. 账号 ================= */

  ADMIN.pages.adminUsers = function (page) {
    page.className = 'page page--scroll';
    var all = (STORE.admin && STORE.admin.users) || [];
    var state = { role: '', kw: '' };

    page.appendChild(ui.pageHead({
      title: '账号',
      right: [
        el('div', { class: 'page-meta', text: '共 ' + all.length + ' 个' }),
        headBtn('新建账号', function () { openCreateUser(); })
      ]
    }));

    var bar = el('div', { class: 'tbl-toolbar' });
    var seg = el('div', { class: 'seg' });
    [
      { key: '', label: '全部' },
      { key: 'STUDENT', label: '学生' },
      { key: 'TEACHER', label: '教师' },
      { key: 'ADMIN', label: '管理员' }
    ].forEach(function (f) {
      seg.appendChild(el('button', {
        class: 'seg-item' + (f.key === state.role ? ' is-on' : ''),
        attrs: { type: 'button' },
        dataset: { key: f.key },
        text: f.label,
        onClick: function (e) {
          state.role = f.key;
          Array.prototype.forEach.call(seg.children, function (n) {
            n.classList.toggle('is-on', n.dataset.key === f.key);
          });
          paint();
        }
      }));
    });
    bar.appendChild(seg);
    bar.appendChild(el('input', {
      class: 'input input--search',
      attrs: { type: 'search', placeholder: '搜索账号 / 姓名', autocomplete: 'off' },
      onInput: function (e) { state.kw = e.target.value.trim(); paint(); }
    }));
    page.appendChild(bar);

    var box = el('div', { class: 'tbl-wrap' });
    page.appendChild(box);

    function paint() {
      var rows = all.filter(function (u) {
        if (state.role && u.role !== state.role) return false;
        if (!state.kw) return true;
        return (u.username || '').indexOf(state.kw) >= 0 || (u.realName || '').indexOf(state.kw) >= 0;
      });
      box.innerHTML = '';
      if (!rows.length) {
        box.appendChild(ui.empty({ title: '没有匹配的账号。', note: '换个关键词，或切换角色筛选。' }));
        return;
      }
      box.appendChild(ui.table({
        rowKey: 'id',
        cols: [
          { label: '账号', width: 140, render: function (u) { return el('span', { class: 'mono', text: u.username }); } },
          { label: '姓名', width: 100, key: 'realName' },
          { label: '角色', width: 90, render: function (u) { return roleLabel(u.role); } },
          {
            label: '归属', width: 220, render: function (u) {
              if (u.role === 'STUDENT') return (u.studentNo || '—') + ' · ' + (u.className || '未分班');
              if (u.role === 'TEACHER') return (u.teacherNo || '—') + ' · ' + (u.department || '—');
              return '—';
            }
          },
          {
            label: '手机', width: 130, render: function (u) {
              return el('span', { class: 'mono', text: u.phone || '—' });
            }
          },
          {
            label: '状态', width: 80, render: function (u) {
              return el('span', { class: 'tag ' + (u.status === 'ACTIVE' ? 'tag--ok' : 'tag--quiet'), text: u.status === 'ACTIVE' ? '正常' : '已停用' });
            }
          },
          {
            label: '操作', width: 170, align: 'right', render: function (u) {
              var wrap = el('div', { class: 'row-acts' });
              wrap.appendChild(el('button', {
                class: 'link-btn', attrs: { type: 'button' }, text: '重置密码',
                onClick: function (e) {
                  e.stopPropagation();
                  openResetPwd(u);
                }
              }));
              wrap.appendChild(el('button', {
                class: 'link-btn ' + (u.status === 'ACTIVE' ? 'link-btn--danger' : ''),
                attrs: { type: 'button' },
                text: u.status === 'ACTIVE' ? '停用' : '启用',
                onClick: function (e) {
                  e.stopPropagation();
                  toggleUser(u);
                }
              }));
              return wrap;
            }
          }
        ],
        rows: rows
      }));
    }

    function roleLabel(r) {
      return r === 'STUDENT' ? '学生' : r === 'TEACHER' ? '教师' : '管理员';
    }

    function toggleUser(u) {
      var next = u.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
      act(api.put('/admin/users/' + u.id + '/status', { status: next }),
        next === 'ACTIVE' ? '已启用' : '已停用');
    }

    function openResetPwd(u) {
      openForm('重置密码 · ' + u.realName, [
        { key: 'newPassword', label: '新密码', type: 'password', placeholder: '至少 6 位', hint: '重置后请当面告知本人，系统不会发送短信' }
      ], '确认重置', function (v) {
        if ((v.newPassword || '').length < 6) throw new Error('密码至少 6 位');
        return act(api.put('/admin/users/' + u.id + '/password', { newPassword: v.newPassword }), '密码已重置');
      });
    }

    function openCreateUser() {
      var classes = (STORE.admin.classes || []).filter(function (c) { return c.status === 'ACTIVE'; });
      openForm('新建账号', [
        { key: 'role', label: '角色', type: 'select', options: [
          { value: 'STUDENT', label: '学生' },
          { value: 'TEACHER', label: '教师' },
          { value: 'ADMIN', label: '管理员' }
        ] },
        { key: 'username', label: '账号（学号 / 工号）', placeholder: '如 2023001001' },
        { key: 'realName', label: '姓名', placeholder: '真实姓名' },
        { key: 'phone', label: '手机号', placeholder: '选填' },
        { key: 'classId', label: '所属班级（学生必填）', type: 'select',
          options: [{ value: '', label: '— 非学生可留空 —' }].concat(classes.map(function (c) {
            return { value: c.id, label: c.className };
          })) },
        { key: 'teacherNo', label: '工号（教师必填）', placeholder: '如 T2023003' },
        { key: 'department', label: '院系（教师）', placeholder: '如 计算机学院' },
        { key: 'initialPassword', label: '初始密码', placeholder: '默认 123456' }
      ], '创建', function (v) {
        if (!v.username || !v.realName) throw new Error('账号与姓名必填');
        var body = {
          username: v.username, realName: v.realName, role: v.role,
          phone: v.phone, initialPassword: v.initialPassword || '123456'
        };
        if (v.role === 'STUDENT') {
          if (!v.classId) throw new Error('学生必须选择班级');
          body.classId = Number(v.classId);
          body.studentNo = v.username;
        }
        if (v.role === 'TEACHER') {
          if (!v.teacherNo) throw new Error('教师必须填工号');
          body.teacherNo = v.teacherNo;
          body.department = v.department;
        }
        return act(api.post('/admin/users', body), '账号已创建');
      });
    }

    paint();
  };

  /* ================= 2. 班级 ================= */

  ADMIN.pages.adminClasses = function (page) {
    page.className = 'page page--scroll';
    var all = (STORE.admin && STORE.admin.classes) || [];

    page.appendChild(ui.pageHead({
      title: '班级',
      right: [
        el('div', { class: 'page-meta', text: '共 ' + all.length + ' 个' }),
        headBtn('新建班级', function () {
          openForm('新建班级', [
            { key: 'className', label: '班级名称', placeholder: '如 计算机科学与技术3班' },
            { key: 'classCode', label: '班级编码', placeholder: '如 CS2303，唯一' },
            { key: 'major', label: '专业', placeholder: '选填' },
            { key: 'grade', label: '年级', placeholder: '如 2023' }
          ], '创建', function (v) {
            if (!v.className || !v.classCode) throw new Error('名称与编码必填');
            return act(api.post('/admin/classes', v), '班级已创建');
          });
        })
      ]
    }));

    var box = el('div', { class: 'tbl-wrap' });
    page.appendChild(box);

    if (!all.length) {
      box.appendChild(ui.empty({ title: '还没有班级。', note: '先建班级，再给学生开户并绑定辅导员。' }));
      return;
    }

    box.appendChild(ui.table({
      rowKey: 'id',
      cols: [
        { label: '班级', render: function (c) { return c.className; } },
        { label: '编码', width: 110, render: function (c) { return el('span', { class: 'mono', text: c.classCode }); } },
        { label: '专业', width: 160, render: function (c) { return c.major || '—'; } },
        { label: '年级', width: 80, render: function (c) { return c.grade || '—'; } },
        {
          label: '学生数', width: 90, align: 'right', render: function (c) {
            return el('span', { class: 'mono', text: String(c.studentCount) });
          }
        },
        {
          label: '辅导员', width: 150, render: function (c) {
            return c.teacherName ? c.teacherName : el('span', { class: 'cell-sub', text: '未绑定' });
          }
        },
        {
          label: '状态', width: 80, render: function (c) {
            return el('span', {
              class: 'tag ' + (c.status === 'ACTIVE' ? 'tag--ok' : 'tag--quiet'),
              text: c.status === 'ACTIVE' ? '启用' : '停用'
            });
          }
        },
        {
          label: '操作', width: 100, align: 'right', render: function (c) {
            return el('button', {
              class: 'link-btn link-btn--danger', attrs: { type: 'button' }, text: '停用',
              onClick: function (e) {
                e.stopPropagation();
                if (!confirm('停用后该班级不再出现在开户列表里。班上有学生时会被拒绝。确认停用？')) return;
                act(api.del('/admin/classes/' + c.id), '已停用');
              }
            });
          }
        }
      ],
      rows: all
    }));
  };

  /* ================= 3. 辅导员绑定 ================= */

  ADMIN.pages.adminBindings = function (page) {
    page.className = 'page page--scroll';
    var all = (STORE.admin && STORE.admin.bindings) || [];
    var classes = (STORE.admin && STORE.admin.classes) || [];
    var teachers = ((STORE.admin && STORE.admin.users) || []).filter(function (u) { return u.role === 'TEACHER'; });
    var unbound = classes.filter(function (c) {
      return !all.some(function (b) { return b.classId === c.id; });
    });

    page.appendChild(ui.pageHead({
      title: '辅导员绑定',
      right: [
        el('div', { class: 'page-meta', text: all.length + ' 条绑定 · ' + unbound.length + ' 个班级未绑定' }),
        headBtn('新增绑定', function () {
          if (!unbound.length) { toast('所有班级都已绑定辅导员'); return; }
          openForm('绑定辅导员', [
            { key: 'teacherId', label: '教师', type: 'select', options: teachers.map(function (t) {
              return { value: t.id, label: t.realName + '（' + (t.teacherNo || t.username) + '）' };
            }) },
            { key: 'classId', label: '班级', type: 'select', options: unbound.map(function (c) {
              return { value: c.id, label: c.className };
            }) },
          ], '绑定', function (v) {
            if (!v.teacherId || !v.classId) throw new Error('教师与班级都要选');
            return act(api.post('/admin/teacher-classes', {
              teacherId: Number(v.teacherId), classId: Number(v.classId)
            }), '已绑定');
          });
        })
      ]
    }));

    var box = el('div', { class: 'tbl-wrap' });
    page.appendChild(box);

    if (!all.length) {
      box.appendChild(ui.empty({
        title: '还没有绑定关系。',
        note: '班级没有辅导员时，该班学生提交请假会被直接拒绝（42204）。'
      }));
      return;
    }

    box.appendChild(ui.table({
      rowKey: 'id',
      cols: [
        { label: '教师', render: function (b) { return b.teacherName; } },
        { label: '工号', width: 120, render: function (b) { return el('span', { class: 'mono', text: b.teacherNo || '—' }); } },
        { label: '负责班级', render: function (b) { return b.className; } },
        {
          label: '绑定时间', width: 150, render: function (b) {
            return el('span', { class: 'mono cell-sub', text: b.createdAt || '—' });
          }
        },
        {
          label: '操作', width: 100, align: 'right', render: function (b) {
            return el('button', {
              class: 'link-btn link-btn--danger', attrs: { type: 'button' }, text: '解绑',
              onClick: function (e) {
                e.stopPropagation();
                if (!confirm('解绑后 ' + b.className + ' 的学生将无法提交申请，确认？')) return;
                act(api.del('/admin/teacher-classes/' + b.id), '已解绑');
              }
            });
          }
        }
      ],
      rows: all
    }));
  };

  /* ================= 4. 系统配置 ================= */

  ADMIN.pages.adminConfigs = function (page) {
    page.className = 'page page--scroll';
    var all = (STORE.admin && STORE.admin.configs) || [];

    page.appendChild(ui.pageHead({
      title: '系统配置',
      right: [
        el('div', { class: 'page-meta', text: '改完立即生效 · 数值型配置写错会直接影响销假判定' })
      ]
    }));

    var box = el('div', { class: 'tbl-wrap' });
    page.appendChild(box);

    if (!all.length) {
      box.appendChild(ui.empty({ title: '没有配置项。', note: '检查 system_config 表是否已初始化。' }));
      return;
    }

    box.appendChild(ui.table({
      rowKey: 'key',
      cols: [
        { label: '配置项', width: 260, render: function (c) { return el('span', { class: 'mono', text: c.key }); } },
        { label: '说明', render: function (c) { return c.description || '—'; } },
        { label: '类型', width: 92, render: function (c) { return c.type || '—'; } },
        {
          label: '值', width: 200, render: function (c) {
            var input = el('input', {
              class: 'input input--inline',
              attrs: { value: c.value, autocomplete: 'off' },
              dataset: { key: c.key }
            });
            var save = function () {
              var v = (input.value || '').trim();
              if (v === c.value) return;
              input.classList.add('is-saving');
              api.put('/admin/configs/' + encodeURIComponent(c.key), { configValue: v })
                .then(function () {
                  input.classList.remove('is-saving');
                  input.classList.add('is-saved');
                  c.value = v;
                  setTimeout(function () { input.classList.remove('is-saved'); }, 900);
                })
                .catch(function (e) {
                  input.classList.remove('is-saving');
                  input.classList.add('is-err');
                  alert('保存失败：' + (e.message || ''));
                  input.value = c.value;
                  setTimeout(function () { input.classList.remove('is-err'); }, 900);
                });
            };
            input.addEventListener('blur', save);
            input.addEventListener('keydown', function (e) {
              if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
            });
            return input;
          }
        },
        {
          label: '更新时间', width: 140, render: function (c) {
            return el('span', { class: 'mono cell-sub', text: c.updatedAt || '—' });
          }
        }
      ],
      rows: all
    }));
  };
})();
