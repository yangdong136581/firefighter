// Play.fun (OpenGameProtocol) integration - score-delta based. Defensive if SDK missing.
(function () {
  var GAME_ID = '51f2a5c0-ac4c-482a-b219-b40f3517378e';
  var sdk = null, ready = false, lastScore = 0, lastState = null, ended = false;
  function add(n) { if (ready && sdk && sdk.addPoints && n > 0) { try { sdk.addPoints(n); } catch (e) {} } }
  function save() { if (ready && sdk && sdk.savePoints) { try { sdk.savePoints(); } catch (e) {} } }
  function init() {
    var C = window.PlayFunSDK || window.OpenGameSDK;
    if (!C) { console.warn('Play.fun SDK not loaded - skipping'); return; }
    try {
      sdk = new C({ gameId: GAME_ID, ui: { usePointsWidget: true } });
      var p = sdk.init();
      if (p && p.then) p.then(function () { ready = true; }, function () {}); else ready = true;
    } catch (e) {}
  }
  function tick() {
    var g = window.game; if (!g) return;
    var sc = g.score || 0;
    var d = sc - lastScore; if (d > 0) add(d); lastScore = sc;
    if ((g.state === 'complete' || g.state === 'gameover') && !ended && lastState === 'playing') { ended = true; save(); }
    if (g.state === 'playing') ended = false;
    lastState = g.state;
  }
  init();
  setInterval(tick, 250);
  window.addEventListener('beforeunload', save);
})();
