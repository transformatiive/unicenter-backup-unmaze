/* Quadro cruzado: escolha de grupos e ações (ver, etiquetar, criar lote). */
(function () {
  var data = JSON.parse(document.getElementById('qdata').textContent);
  var sel = new Set(); // "i,j"
  var mx = document.getElementById('mx');
  var $ = function (id) { return document.getElementById(id); };
  var fmt = function (v) { return Number(v || 0).toLocaleString('pt-PT'); };
  var lastCount = 0;
  var timer = null;

  function label(v) {
    if (v === '__vazio__') return '(vazio)';
    if (v === '__outros__') return 'Outros';
    return v;
  }

  function criteria() {
    var cells = [];
    sel.forEach(function (k) {
      var p = k.split(',');
      cells.push({ r: data.rowsAxis[+p[0]], c: data.colsAxis[+p[1]] });
    });
    return Object.assign({}, data.crit, { rTop: data.rTop, cTop: data.cTop, cells: cells });
  }

  function toast(text, isErr) {
    var t = $('toast');
    t.textContent = text;
    t.className = 'toast' + (isErr ? ' err' : '');
    t.hidden = false;
    clearTimeout(toast.h);
    toast.h = setTimeout(function () { t.hidden = true; }, 3500);
  }

  function post(url, body) {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(body),
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) throw new Error(j.error || 'Ocorreu um erro.');
        return j;
      });
    });
  }

  function setStat(i, part, total) {
    var p = total ? Math.round(part / total * 100) : 0;
    $('st' + i).textContent = total ? p + '%' : '–';
    $('st' + i + 'b').style.width = p + '%';
  }

  function refresh() {
    if (!mx) return;
    mx.querySelectorAll('.cell').forEach(function (b) {
      b.classList.toggle('on', sel.has(b.dataset.i + ',' + b.dataset.j));
    });
    $('selbar').hidden = sel.size === 0;
    $('sG').textContent = sel.size;
    // contagem rápida aproximada com os números do quadro; a exata vem do servidor
    var approx = 0;
    sel.forEach(function (k) {
      var b = mx.querySelector('.cell[data-i="' + k.split(',')[0] + '"][data-j="' + k.split(',')[1] + '"]');
      if (b) approx += +b.dataset.n;
    });
    $('sN').textContent = fmt(approx);
    $('st0k').textContent = sel.size ? 'Escolhidos' : 'No quadro';
    $('st0').textContent = fmt(sel.size ? approx : data.total);
    $('st0s').textContent = sel.size ? 'nos grupos escolhidos' : 'Escolha grupos para ver o detalhe';
    clearTimeout(timer);
    if (!sel.size) { [1, 2, 3].forEach(function (i) { setStat(i, 0, 0); }); return; }
    timer = setTimeout(function () {
      post('/quadro/contar', criteria()).then(function (j) {
        lastCount = j.count;
        $('sN').textContent = fmt(j.count);
        $('st0').textContent = fmt(j.count);
        setStat(1, j.email, j.count);
        setStat(2, j.tel, j.count);
        setStat(3, j.tagged, j.count);
      }).catch(function (e) { toast(e.message, true); });
    }, 250);
  }

  function toggle(keys) {
    var all = keys.every(function (k) { return sel.has(k); });
    keys.forEach(function (k) { if (all) sel.delete(k); else sel.add(k); });
    refresh();
  }

  if (mx) {
    mx.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      var keys = [];
      if (b.dataset.i !== undefined) {
        keys = [b.dataset.i + ',' + b.dataset.j];
      } else if (b.dataset.row !== undefined) {
        data.colsAxis.forEach(function (_, j) { keys.push(b.dataset.row + ',' + j); });
      } else if (b.dataset.col !== undefined) {
        data.rowsAxis.forEach(function (_, i) { keys.push(i + ',' + b.dataset.col); });
      }
      // só quadrados com contactos
      keys = keys.filter(function (k) {
        var p = k.split(',');
        var c = mx.querySelector('.cell[data-i="' + p[0] + '"][data-j="' + p[1] + '"]');
        return c && +c.dataset.n > 0;
      });
      if (keys.length) toggle(keys);
    });
  }

  $('sClear').addEventListener('click', function () { sel.clear(); refresh(); });

  $('sSee').addEventListener('click', function () {
    var json = JSON.stringify(criteria());
    var b64 = btoa(unescape(encodeURIComponent(json))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    window.location = '/quadro/contactos?s=' + b64;
  });

  function fillN() {
    document.querySelectorAll('[data-sel-n]').forEach(function (el) { el.textContent = $('sN').textContent; });
  }

  $('sTag').addEventListener('click', function () { fillN(); $('dTag').showModal(); });
  $('fTag').addEventListener('submit', function (e) {
    if (e.submitter && e.submitter.value === 'cancel') return;
    e.preventDefault();
    var f = new FormData(e.target);
    var body = { crit: criteria(), tagId: f.get('tagId'), tagName: f.get('tagName') };
    if (!body.tagId && !String(body.tagName || '').trim()) { toast('Escolha ou escreva uma etiqueta.', true); return; }
    e.submitter.disabled = true;
    post('/quadro/etiquetar', body).then(function (j) {
      $('dTag').close();
      toast('Etiqueta aplicada a ' + fmt(j.added) + ' contactos novos.');
      setTimeout(function () { window.location.reload(); }, 1200);
    }).catch(function (err) { toast(err.message, true); }).finally(function () { e.submitter.disabled = false; });
  });

  $('sLote').addEventListener('click', function () {
    fillN();
    var cells = criteria().cells.map(function (c) { return label(c.r) + ' · ' + label(c.c); });
    var name = cells.slice(0, 3).join(', ') + (cells.length > 3 ? ' e mais ' + (cells.length - 3) : '');
    $('fLote').elements.name.value = name.slice(0, 120);
    $('dLote').showModal();
  });
  $('fLote').addEventListener('submit', function (e) {
    if (e.submitter && e.submitter.value === 'cancel') return;
    e.preventDefault();
    var f = new FormData(e.target);
    e.submitter.disabled = true;
    e.submitter.textContent = 'A criar…';
    post('/lotes/quadro', { crit: criteria(), name: f.get('name'), tagIt: f.get('tagIt') === '1' })
      .then(function (j) { window.location = '/lotes/' + j.id + '?novo=1'; })
      .catch(function (err) { toast(err.message, true); e.submitter.disabled = false; e.submitter.textContent = 'Criar lote'; });
  });

  refresh();
}());
