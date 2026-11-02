document.addEventListener('DOMContentLoaded', function () {
  var selectAll = document.getElementById('select-all');
  if (selectAll) {
    selectAll.addEventListener('change', function () {
      document.querySelectorAll('.row-check').forEach(function (cb) {
        cb.checked = selectAll.checked;
      });
    });
  }

  // Linha clicável -> abre o detalhe (exceto ao clicar na checkbox, link ou botão).
  document.querySelectorAll('tr[data-href]').forEach(function (tr) {
    tr.addEventListener('click', function (e) {
      if (e.target.closest('input, a, button, label')) return;
      window.location = tr.getAttribute('data-href');
    });
  });
});

function prepareExport(scope) {
  var form = document.getElementById('export-form');
  var idsField = document.getElementById('export-ids');
  if (scope === 'selected') {
    var checked = Array.prototype.slice
      .call(document.querySelectorAll('.row-check:checked'))
      .map(function (cb) { return cb.value; });
    if (checked.length === 0) {
      UI.alert('Escolha pelo menos um contacto na lista, ou use "Criar lote com todos os resultados".', 'Nenhum contacto escolhido');
      return false;
    }
    idsField.value = checked.join(',');
    return true;
  }
  idsField.value = '';
  var total = Number(form.getAttribute('data-total') || 0);
  if (total === 0) {
    UI.alert('A pesquisa não tem resultados. Mude a pesquisa e tente outra vez.', 'Sem resultados');
    return false;
  }
  UI.confirm(
    'Vai ser criado um lote com ' + total.toLocaleString('pt-PT') + ' contactos.',
    'Criar lote com todos os resultados',
    'Criar lote'
  ).then(function (yes) { if (yes) form.submit(); });
  return false;
}
