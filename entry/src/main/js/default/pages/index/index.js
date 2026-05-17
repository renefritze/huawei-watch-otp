var storage = require('@system.storage');
var router  = require('@system.router');
var totp    = require('../../common/totp');

// @system.clipboard may not be available on all LiteWearable firmware versions.
var clipboard = null;
try { clipboard = require('@system.clipboard'); } catch (e) { clipboard = null; }

// @system.prompt provides a native dialog on most devices.
var prompt = null;
try { prompt = require('@system.prompt'); } catch (e) { prompt = null; }

function formatCode(code) {
  return code.slice(0, 3) + ' ' + code.slice(3);
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

module.exports = {
  data: {
    accounts:     [],
    secondsLeft:  30,
    countdownPct: 100,
    showCopied:   false,
    showDelete:   false,
    deleteName:   '',
    _deleteId:    null,
    _timer:       null
  },

  onInit: function () {
    this._loadAccounts();
    this._startTimer();
  },

  onDestroy: function () {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  },

  onShow: function () {
    // Reload when navigating back from add page.
    this._loadAccounts();
  },

  /* ── private helpers ─────────────────────────────────────────────── */

  _loadAccounts: function () {
    var self = this;
    storage.get({
      key: 'accounts',
      success: function (data) {
        var raw = [];
        try { raw = data ? JSON.parse(data) : []; } catch (e) { raw = []; }
        self.accounts = raw.map(function (acc) {
          var code = '';
          try { code = totp.totp(acc.secret); } catch (e) { code = '------'; }
          return { id: acc.id, name: acc.name, secret: acc.secret,
                   displayCode: formatCode(code) };
        });
      },
      fail: function () {
        self.accounts = [];
      }
    });
  },

  _startTimer: function () {
    var self = this;
    self._timer = setInterval(function () {
      var secs = totp.secondsUntilNextCode();
      self.secondsLeft  = secs;
      self.countdownPct = Math.round((secs / 30) * 100);
      // Refresh codes on each tick (code changes at window boundary)
      self.accounts = self.accounts.map(function (acc) {
        var code = '';
        try { code = totp.totp(acc.secret); } catch (e) { code = '------'; }
        return { id: acc.id, name: acc.name, secret: acc.secret,
                 displayCode: formatCode(code) };
      });
    }, 1000);
  },

  _writeAccounts: function (arr, done) {
    storage.set({
      key: 'accounts',
      value: JSON.stringify(arr),
      success: done || function () {},
      fail:    done || function () {}
    });
  },

  /* ── navigation ──────────────────────────────────────────────────── */

  goToAdd: function () {
    router.push({ uri: 'pages/add/add' });
  },

  /* ── item events ─────────────────────────────────────────────────── */

  onItemClick: function (e) {
    var idx = parseInt(e.target.dataSet.index, 10);
    var acc = this.accounts[idx];
    if (!acc) return;
    var code = acc.displayCode.replace(/\s/g, '');
    var self = this;

    if (clipboard) {
      clipboard.set({
        text: code,
        success: function () { self._flashCopied(); },
        fail:    function () { self._flashCopied(); }
      });
    } else {
      self._flashCopied();
    }
  },

  onItemLong: function (e) {
    var idx = parseInt(e.target.dataSet.index, 10);
    var acc = this.accounts[idx];
    if (!acc) return;
    var self = this;

    if (prompt && prompt.showDialog) {
      prompt.showDialog({
        title:   'Delete account',
        message: 'Delete "' + acc.name + '"?',
        buttons: [
          { text: 'Cancel', color: '#888888' },
          { text: 'Delete', color: '#ff4444' }
        ],
        success: function (res) {
          if (res.index === 1) self._doDeleteId(acc.id);
        }
      });
    } else {
      // Fallback custom dialog
      this._deleteId  = acc.id;
      this.deleteName = acc.name;
      this.showDelete = true;
    }
  },

  _flashCopied: function () {
    var self = this;
    self.showCopied = true;
    setTimeout(function () { self.showCopied = false; }, 1500);
  },

  /* ── delete dialog (fallback) ────────────────────────────────────── */

  cancelDelete: function () {
    this.showDelete = false;
    this._deleteId  = null;
    this.deleteName = '';
  },

  doDelete: function () {
    this._doDeleteId(this._deleteId);
    this.cancelDelete();
  },

  _doDeleteId: function (id) {
    var self    = this;
    var updated = this.accounts.filter(function (a) { return a.id !== id; });
    var plain   = updated.map(function (a) {
      return { id: a.id, name: a.name, secret: a.secret };
    });
    this._writeAccounts(plain, function () {
      self.accounts = updated;
    });
  }
};
