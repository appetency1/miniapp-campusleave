/* ============================================================
   login.js —— 登录屏（无壳）。演示环境不做真实鉴权。
   ============================================================ */
(function () {
  var ADMIN = window.ADMIN;
  var ui = ADMIN.ui;
  var el = ui.el;

  var DEMO = { no: 'T2023001', pwd: '123456' };
  var STUDENT_NO = '2023001001';

  ADMIN.pages.login = function (page) {
    if (page && page.parentNode) page.remove();

    var root = document.getElementById('login-root');
    if (!root) return;
    root.innerHTML = '';

    var noInput = el('input', {
      class: 'input',
      attrs: { type: 'text', value: DEMO.no, autocomplete: 'off', spellcheck: 'false' }
    });
    var pwdInput = el('input', {
      class: 'input',
      attrs: { type: 'password', value: DEMO.pwd, autocomplete: 'off' }
    });

    var submit = el('button', {
      class: 'btn btn--primary btn--lg btn--block',
      attrs: { type: 'submit' },
      text: '登 录'
    });

    var hint = el('div', { class: 'login-hint', text: '账号由学校统一发放，忘记密码请联系管理员' });

    var demoLink = el('button', {
      class: 'login-demo',
      attrs: { type: 'button' },
      text: '填入演示账号'
    });
    demoLink.addEventListener('click', function () {
      noInput.value = DEMO.no;
      pwdInput.value = DEMO.pwd;
      hint.className = 'login-hint';
      hint.textContent = '账号由学校统一发放，忘记密码请联系管理员';
      noInput.focus();
    });

    function warnStudent() {
      hint.className = 'login-hint login-hint--warn';
      hint.innerHTML = '';
      hint.appendChild(el('div', { text: '学生请使用小程序端' }));
      var addr = el('div', { class: 'mono', style: { marginTop: '2px', userSelect: 'all' } });
      addr.textContent = 'http://localhost:8080/admin/';
      hint.appendChild(addr);
    }

    var busy = false;
    var form = el('form', { attrs: { novalidate: 'novalidate' } }, [
      el('div', { class: 'field' }, [
        el('label', { class: 'field-label', text: '工号', attrs: { for: 'login-no' } }),
        noInput
      ]),
      el('div', { class: 'field', style: { marginTop: '16px' } }, [
        el('label', { class: 'field-label', text: '密码', attrs: { for: 'login-pwd' } }),
        pwdInput
      ]),
      el('div', { style: { marginTop: '24px' } }, submit),
      hint,
      el('div', { style: { marginTop: '6px' } }, demoLink)
    ]);
    noInput.id = 'login-no';
    pwdInput.id = 'login-pwd';

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (busy) return;

      var no = noInput.value.trim();
      if (no === STUDENT_NO) { warnStudent(); return; }

      busy = true;
      submit.disabled = true;
      submit.textContent = '正在登录…';
      setTimeout(function () {
        busy = false;
        submit.disabled = false;
        submit.textContent = '登 录';
        ADMIN.shell.enterApp();
      }, 400);
    });

    noInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); pwdInput.focus(); }
    });
    pwdInput.addEventListener('input', function () {
      if (hint.className !== 'login-hint') {
        hint.className = 'login-hint';
        hint.textContent = '账号由学校统一发放，忘记密码请联系管理员';
      }
    });

    root.appendChild(el('div', { class: 'login fade-in' }, [
      el('h1', { class: 'login-h1', text: '校园请假' }),
      el('div', { class: 'login-sub', text: 'LA · 教师与管理员' }),
      el('div', { class: 'login-body' }, form)
    ]));
    root.appendChild(el('div', { class: 'login-foot', text: 'v0.4 · 2026' }));

    setTimeout(function () { noInput.focus(); }, 30);
  };
})();
