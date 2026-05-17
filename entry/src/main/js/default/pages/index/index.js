var storage = require('@system.storage');
var router = require('@system.router');
var totp = require('../../common/totp');

// @system.clipboard may not be available on all LiteWearable firmware versions.
var clipboard = null;
try {
  clipboard = require('@system.clipboard');
} catch (e) {
  clipboard = null;
}

// @system.prompt provides a native dialog on most devices.
var prompt = null;
try {
  prompt = require('@system.prompt');
} catch (e) {
  prompt = null;
}

function formatCode(code) {
  return code.slice(0, 3) + ' ' + code.slice(3);
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

module.exports = {
  data: {
    accounts: [],
    secondsLeft: 30,
    countdownPct: 100,
    showCopied: false,
    showDelete: false,
    deleteName: '',
    _deleteId: null,
    _timer: null
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
    storage.get({
      key: 'accounts',
      success: (data) => {
        var raw = [];
        try {
          raw = data ? JSON.parse(data) : [];
        } catch (e) {
          raw = [];
        }
        this.accounts = raw.map((acc) => {
          var code = '';
          try {
            code = totp.totp(acc.secret);
          } catch (e) {
            code = '------';
          }
          return { id: acc.id, name: acc.name, secret: acc.secret, displayCode: formatCode(code) };
        });
      },
      fail: () => {
        this.accounts = [];
      }
    });
  },

  _startTimer: function () {
    this._timer = setInterval(() => {
      var secs = totp.secondsUntilNextCode();
      this.secondsLeft = secs;
      this.countdownPct = Math.round((secs / 30) * 100);
      // Refresh codes on each tick (code changes at window boundary)
      this.accounts = this.accounts.map((acc) => {
        var code = '';
        try {
          code = totp.totp(acc.secret);
        } catch (e) {
          code = '------';
        }
        return { id: acc.id, name: acc.name, secret: acc.secret, displayCode: formatCode(code) };
      });
    }, 1000);
  },

  _writeAccounts: (arr, done) => {
    storage.set({
      key: 'accounts',
      value: JSON.stringify(arr),
      success: done || (() => {}),
      fail: done || (() => {})
    });
  },

  /* ── navigation ──────────────────────────────────────────────────── */

  goToAdd: () => {
    router.push({ uri: 'pages/add/add' });
  },

  /* ── item events ─────────────────────────────────────────────────── */

  onItemClick: function (e) {
    var idx = parseInt(e.target.dataSet.index, 10);
    var acc = this.accounts[idx];
    if (!acc) return;
    var code = acc.displayCode.replace(/\s/g, '');

    if (clipboard) {
      clipboard.set({
        text: code,
        success: () => {
          this._flashCopied();
        },
        fail: () => {
          this._flashCopied();
        }
      });
    } else {
      this._flashCopied();
    }
  },

  onItemLong: function (e) {
    var idx = parseInt(e.target.dataSet.index, 10);
    var acc = this.accounts[idx];
    if (!acc) return;

    if (prompt && prompt.showDialog) {
      prompt.showDialog({
        title: 'Delete account',
        message: 'Delete "' + acc.name + '"?',
        buttons: [
          { text: 'Cancel', color: '#888888' },
          { text: 'Delete', color: '#ff4444' }
        ],
        success: (res) => {
          if (res.index === 1) this._doDeleteId(acc.id);
        }
      });
    } else {
      // Fallback custom dialog
      this._deleteId = acc.id;
      this.deleteName = acc.name;
      this.showDelete = true;
    }
  },

  _flashCopied: function () {
    this.showCopied = true;
    setTimeout(() => {
      this.showCopied = false;
    }, 1500);
  },

  /* ── delete dialog (fallback) ────────────────────────────────────── */

  cancelDelete: function () {
    this.showDelete = false;
    this._deleteId = null;
    this.deleteName = '';
  },

  doDelete: function () {
    this._doDeleteId(this._deleteId);
    this.cancelDelete();
  },

  _doDeleteId: function (id) {
    var updated = this.accounts.filter((a) => a.id !== id);
    var plain = updated.map((a) => ({ id: a.id, name: a.name, secret: a.secret }));
    this._writeAccounts(plain, () => {
      this.accounts = updated;
    });
  }
};
