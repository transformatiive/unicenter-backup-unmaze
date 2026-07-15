document.addEventListener('DOMContentLoaded', function () {
  var selectAll = document.getElementById('select-all');
  if (selectAll) {
    selectAll.addEventListener('change', function () {
      document.querySelectorAll('.row-check').forEach(function (cb) {
        cb.checked = selectAll.checked;
      });
    });
  }
});

function prepareExport(scope) {
  var idsField = document.getElementById('export-ids');
  if (scope === 'selected') {
    var checked = Array.prototype.slice
      .call(document.querySelectorAll('.row-check:checked'))
      .map(function (cb) { return cb.value; });
    if (checked.length === 0) {
      alert('Seleciona pelo menos um registo, ou usa "Exportar todos os resultados filtrados".');
      return false;
    }
    idsField.value = checked.join(',');
  } else {
    idsField.value = '';
  }
  return true;
}
