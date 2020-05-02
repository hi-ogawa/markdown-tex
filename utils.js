// @param
//   ls1: source
//   ls2: target
//   cost: ...
// @return
//   table
//   path
const solveLevenshteinDistance = (
    ls1, ls2, cost = { insert: 1, remove: 1, replace: 1 }) => {
  var n1 = ls1.length;
  var n2 = ls2.length;
  var table = [...new Array(n1 + 1)].map(() => new Array(n2 + 1).fill(null));

  // command in { NA, noop, insert, remove, replace }
  table[0][0] = { score: 0, command: 'NA', backtrack: 'NA' };

  for (var i = 1; i <= n1; i++) {
    table[i][0] = { score: i * cost.insert, command: 'insert', backtrack: [i - 1, 0] };
  }

  for (var j = 1; j <= n2; j++) {
    table[0][j] = { score: j * cost.remove, command: 'remove', backtrack: [0, j - 1] };
  }

  for (var i = 1; i <= n1; i++) {
    for (var j = 1; j <= n2; j++) {
      table[i][j] = [
        {
          score: table[i - 1][j].score + cost.insert,
          command: 'insert',
          backtrack: [i - 1, j]
        },
        {
          score: table[i][j - 1].score + cost.remove,
          command: 'remove',
          backtrack: [i, j - 1]
        },
        (
          ls1[i - 1] === ls2[j - 1]
          ? {
              score: table[i - 1][j - 1].score,
              command: 'noop',
              backtrack: [i - 1, j - 1]
            }
          : {
            score: table[i - 1][j - 1].score + cost.replace,
            command: 'replace',
            backtrack: [i - 1, j - 1]
            }
        )
      ].sort((c1, c2) => c1.score - c2.score)[0];
    }
  }

  var path = [];
  var [i, j] = [n1, n2];
  while (i > 0 || j > 0) {
    var e = table[i][j];
    path.unshift([e.command, i - 1, j - 1]);
    [i, j] = e.backtrack;
  }
  return [table, path];
}
