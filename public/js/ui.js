/*
 * Componentes de interface partilhados (sem dependências):
 *
 *  - UI.alert / UI.confirm: janelas (modals) com o estilo da app, em vez das
 *    caixas do browser.
 *  - Listas de escolha: cada <select> passa a ter uma lista com o estilo da app.
 *    O <select> original fica escondido e continua a ser o que o formulário envia,
 *    por isso o servidor não muda. Com muitas opções aparece uma caixa de pesquisa.
 *  - data-confirm="texto" num <form> ou botão pede confirmação antes de enviar.
 */
(function () {
  'use strict';

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  /* ---------- Modals ---------- */

  function modal(opts) {
    return new Promise(function (resolve) {
      var d = el('dialog', 'dlg');
      var form = el('form');
      form.method = 'dialog';
      var head = el('header');
      head.appendChild(el('h3', '', opts.title || 'Atenção'));
      if (opts.text) head.appendChild(el('p', '', opts.text));
      var foot = el('footer');
      if (opts.cancel) {
        var c = el('button', 'btn', opts.cancel);
        c.value = 'cancel';
        c.type = 'submit';
        foot.appendChild(c);
      }
      var ok = el('button', 'btn ' + (opts.danger ? 'btn-danger' : 'btn-primary'), opts.ok || 'OK');
      ok.value = 'ok';
      ok.type = 'submit';
      foot.appendChild(ok);
      form.appendChild(head);
      form.appendChild(foot);
      d.appendChild(form);
      document.body.appendChild(d);
      d.addEventListener('close', function () {
        var v = d.returnValue === 'ok';
        d.remove();
        resolve(v);
      });
      d.showModal();
      ok.focus();
    });
  }

  window.UI = {
    alert: function (text, title) { return modal({ title: title || 'Atenção', text: text, ok: 'OK' }); },
    confirm: function (text, title, okText) {
      return modal({ title: title || 'Confirmar', text: text, ok: okText || 'Confirmar', cancel: 'Cancelar' });
    },
  };

  /* ---------- Confirmação declarativa ---------- */

  document.addEventListener('submit', function (e) {
    var form = e.target;
    var btn = e.submitter;
    var text = (btn && btn.getAttribute('data-confirm')) || form.getAttribute('data-confirm');
    if (!text || form.dataset.confirmed === '1') return;
    e.preventDefault();
    window.UI.confirm(text, btn && btn.getAttribute('data-confirm-title'), btn && btn.getAttribute('data-confirm-ok')).then(function (yes) {
      if (!yes) return;
      form.dataset.confirmed = '1';
      if (btn && btn.name) {
        var h = el('input');
        h.type = 'hidden';
        h.name = btn.name;
        h.value = btn.value;
        form.appendChild(h);
      }
      form.submit();
    });
  }, true);

  /* ---------- Listas de escolha ---------- */

  var CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
  var CHEVRON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
  var SEARCH_FROM = 10;
  var openOne = null;

  function enhance(sel) {
    if (sel.dataset.ui === '1' || sel.multiple) return;
    sel.dataset.ui = '1';

    var wrap = el('div', 'ui-select' + (sel.classList.contains('inline') ? ' inline' : ''));
    var trigger = el('button', 'ui-select-trigger');
    trigger.type = 'button';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    var label = el('span', 'ui-select-value');
    trigger.appendChild(label);
    trigger.insertAdjacentHTML('beforeend', CHEVRON);

    var pop = el('div', 'ui-select-pop');
    pop.hidden = true;
    var search = null;
    if (sel.options.length > SEARCH_FROM) {
      search = el('input', 'ui-select-search');
      search.type = 'text';
      search.placeholder = 'Procurar…';
      search.setAttribute('aria-label', 'Procurar');
      pop.appendChild(search);
    }
    var list = el('div', 'ui-select-list');
    list.setAttribute('role', 'listbox');
    pop.appendChild(list);

    sel.parentNode.insertBefore(wrap, sel);
    wrap.appendChild(sel);
    wrap.appendChild(trigger);
    wrap.appendChild(pop);
    sel.classList.add('ui-native');
    sel.tabIndex = -1;
    sel.setAttribute('aria-hidden', 'true');

    var items = [];
    var active = -1;

    function sync() {
      var o = sel.options[sel.selectedIndex];
      label.textContent = o ? o.text : '';
      items.forEach(function (it) {
        var on = it.opt.selected;
        it.node.classList.toggle('on', on);
        it.node.setAttribute('aria-selected', on ? 'true' : 'false');
      });
    }

    function build() {
      list.innerHTML = '';
      items = [];
      Array.prototype.forEach.call(sel.options, function (opt) {
        var n = el('div', 'ui-select-opt');
        n.setAttribute('role', 'option');
        n.innerHTML = CHECK;
        n.appendChild(el('span', '', opt.text));
        if (opt.disabled) n.classList.add('disabled');
        n.addEventListener('mousedown', function (e) { e.preventDefault(); });
        n.addEventListener('click', function () { if (!opt.disabled) choose(opt); });
        list.appendChild(n);
        items.push({ opt: opt, node: n, text: opt.text.toLowerCase() });
      });
      sync();
    }

    function visible() { return items.filter(function (it) { return !it.node.hidden && !it.opt.disabled; }); }

    function setActive(i) {
      var v = visible();
      if (!v.length) return;
      active = Math.max(0, Math.min(i, v.length - 1));
      items.forEach(function (it) { it.node.classList.remove('active'); });
      v[active].node.classList.add('active');
      v[active].node.scrollIntoView({ block: 'nearest' });
    }

    function open() {
      if (openOne && openOne !== close) openOne();
      pop.hidden = false;
      wrap.classList.add('open');
      trigger.setAttribute('aria-expanded', 'true');
      var r = trigger.getBoundingClientRect();
      wrap.classList.toggle('up', window.innerHeight - r.bottom < 280 && r.top > 280);
      if (search) { search.value = ''; filter(''); search.focus(); }
      var v = visible();
      setActive(Math.max(0, v.findIndex(function (it) { return it.opt.selected; })));
      openOne = close;
    }

    function close() {
      pop.hidden = true;
      wrap.classList.remove('open');
      trigger.setAttribute('aria-expanded', 'false');
      if (openOne === close) openOne = null;
    }

    function choose(opt) {
      var changed = !opt.selected;
      opt.selected = true;
      sync();
      close();
      trigger.focus();
      if (changed) sel.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function filter(q) {
      q = q.trim().toLowerCase();
      items.forEach(function (it) { it.node.hidden = q !== '' && it.text.indexOf(q) === -1; });
      setActive(0);
    }

    function keys(e) {
      var v = visible();
      if (e.key === 'ArrowDown') { e.preventDefault(); if (pop.hidden) open(); else setActive(active + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); if (pop.hidden) open(); else setActive(active - 1); }
      else if (e.key === 'Enter' || (e.key === ' ' && e.target === trigger)) {
        e.preventDefault();
        if (pop.hidden) open(); else if (v[active]) choose(v[active].opt);
      } else if (e.key === 'Escape') { if (!pop.hidden) { e.preventDefault(); close(); trigger.focus(); } }
      else if (e.key === 'Tab') close();
    }

    trigger.addEventListener('click', function () { if (pop.hidden) open(); else close(); });
    trigger.addEventListener('keydown', keys);
    if (search) {
      search.addEventListener('input', function () { filter(search.value); });
      search.addEventListener('keydown', keys);
    }
    sel.addEventListener('change', sync);
    if (sel.form) sel.form.addEventListener('reset', function () { setTimeout(sync, 0); });
    build();
  }

  document.addEventListener('mousedown', function (e) {
    if (openOne && !e.target.closest('.ui-select.open')) openOne();
  });

  function init(root) {
    (root || document).querySelectorAll('select').forEach(enhance);
  }
  window.UI.enhanceSelects = init;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { init(); });
  else init();
}());
