var storage = require('@system.storage');
var router = require('@system.router');
var totp = require('../../common/totp');

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

module.exports = {
  data: {
    name: '',
    secret: '',
    errorMsg: ''
  },

  onNameChange: function (e) {
    this.name = e.value;
    this.errorMsg = '';
  },

  onSecretChange: function (e) {
    // Auto-uppercase; strip spaces so users can paste formatted secrets.
    this.secret = e.value.toUpperCase().replace(/\s/g, '');
    this.errorMsg = '';
  },

  cancel: () => {
    router.back();
  },

  save: function () {
    var name = this.name.trim();
    var secret = this.secret.trim();

    if (!name) {
      this.errorMsg = 'Account name is required.';
      return;
    }
    if (!secret) {
      this.errorMsg = 'Secret key is required.';
      return;
    }

    // Validate secret by attempting a TOTP generation.
    try {
      totp.totp(secret);
    } catch (e) {
      this.errorMsg = 'Invalid Base32 secret: ' + e.message;
      return;
    }

    var newAccount = { id: generateId(), name: name, secret: secret };

    storage.get({
      key: 'accounts',
      success: (data) => {
        var accounts = [];
        try {
          accounts = data ? JSON.parse(data) : [];
        } catch (e) {
          accounts = [];
        }
        accounts.push(newAccount);
        storage.set({
          key: 'accounts',
          value: JSON.stringify(accounts),
          success: () => {
            router.back();
          },
          fail: () => {
            this.errorMsg = 'Failed to save. Please try again.';
          }
        });
      },
      fail: () => {
        // storage unavailable — try writing fresh list
        storage.set({
          key: 'accounts',
          value: JSON.stringify([newAccount]),
          success: () => {
            router.back();
          },
          fail: () => {
            this.errorMsg = 'Storage error. Cannot save account.';
          }
        });
      }
    });
  }
};
